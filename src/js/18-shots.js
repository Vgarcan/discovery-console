/* 18-shots.js
   Screenshots: reading one off the clipboard, shrinking it, keeping the bytes in
   IndexedDB and drawing the thumbnails. The session only ever holds the
   manifest; nothing here writes image data into localStorage, which holds about
   5 MB in total and would be full after two full-screen PNGs. */
/* =================== SCREENSHOTS =================== */
const SHOT_DB = "process.discovery.shots";
const SHOT_STORE = "shots";
const SHOT_META = "meta";
const SHOT_MAX = 1600;      /* longest edge, enough to read a document */
const SHOT_QUALITY = 0.82;  /* WebP holds screenshot text far better than JPEG */

let shotDbPromise = null;
const shotUrls = new Map();

/* ---------- the store ---------- */
function shotDb(){
  if(shotDbPromise) return shotDbPromise;
  shotDbPromise = new Promise(resolve => {
    if(!window.indexedDB){ resolve(null); return; }
    let req;
    try{ req = indexedDB.open(SHOT_DB, 2); }catch(e){ resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(SHOT_STORE)) db.createObjectStore(SHOT_STORE);
      if(!db.objectStoreNames.contains(SHOT_META)) db.createObjectStore(SHOT_META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return shotDbPromise;
}

function shotTx(mode, run, store){
  return shotDb().then(db => {
    if(!db) return null;
    return new Promise(resolve => {
      /* A refused write -- out of quota, or a value the browser will not clone
         -- throws from inside here. Rejecting would hand a promise nobody
         catches to the page; a miss is the honest answer instead. */
      try{
        const tx = db.transaction(store || SHOT_STORE, mode);
        let out = null;
        const req = run(tx.objectStore(store || SHOT_STORE));
        if(req) req.onsuccess = () => { out = req.result; };
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      }catch(e){ resolve(null); }
    });
  });
}

const putShotBlob = (id, blob) => shotTx("readwrite", st => st.put(blob, id));
const getShotBlob = id => shotTx("readonly", st => st.get(id));
const delShotBlob = id => shotTx("readwrite", st => st.delete(id));
const storeIds = () => shotTx("readonly", st => st.getAllKeys())
  .then(keys => new Set(keys || []));
const putMeta = (k, v) => shotTx("readwrite", st => st.put(v, k), SHOT_META);
const getMeta = k => shotTx("readonly", st => st.get(k), SHOT_META);
const delMeta = k => shotTx("readwrite", st => st.delete(k), SHOT_META);

/* ---------- the folder ----------
   The session travels as ids; the images travel as files in a folder you share
   alongside it. A browser can only write into a folder through the File System
   Access API, which today means Chromium over https -- everywhere else the same
   files come out as downloads and go in by hand. Either way the layout is the
   same, so a folder written one way reads the other. */
let shotDir = null;          /* the chosen assets/shots/ handle, once permitted */
let folderHave = new Set();  /* which ids are in this project's subfolder */

const folderSupported = () => typeof window.showDirectoryPicker === "function";
const shotExt = id => ((S.shots[id] || {}).type === "image/jpeg") ? ".jpg" : ".webp";
const shotPrj = id => (S.shots[id] || {}).prj || S.id;

function dirPermission(handle, ask){
  if(!handle || !handle.queryPermission) return Promise.resolve("granted");
  const opts = {mode:"readwrite"};
  return handle.queryPermission(opts).then(state =>
    state === "granted" || !ask ? state : handle.requestPermission(opts));
}

/* Remembered between sessions, but a browser will not hand the permission back
   without a gesture, so a reload starts disconnected until Reconnect is used. */
function restoreShotDir(){
  if(!folderSupported()) return Promise.resolve(null);
  return getMeta("dir").then(handle => {
    if(!handle) return null;
    return dirPermission(handle, false).then(state => {
      shotDir = state === "granted" ? handle : null;
      return shotDir ? scanFolder() : null;
    });
  }).catch(() => null);
}

function chooseShotDir(){
  if(!folderSupported()) return Promise.resolve(null);
  return window.showDirectoryPicker({id:"discovery-shots", mode:"readwrite"})
    .then(handle => dirPermission(handle, true).then(state => {
      if(state !== "granted") return null;
      shotDir = handle;
      /* Remembering it is a convenience; not remembering it must not stop the
         folder working for the rest of this session. */
      return putMeta("dir", handle).then(scanFolder, scanFolder);
    }))
    .catch(() => null);
}

function projectDir(prj, create){
  if(!shotDir) return Promise.resolve(null);
  return shotDir.getDirectoryHandle(prj || S.id, {create:!!create}).catch(() => null);
}

/* What the folder already holds for this project, so nothing has to be written
   twice and the count of what is still missing is read rather than remembered. */
function scanFolder(){
  folderHave = new Set();
  if(!shotDir) return Promise.resolve(folderHave);
  return projectDir(S.id, false).then(dir => {
    if(!dir || !dir.values) return folderHave;
    const walk = async () => {
      for await (const entry of dir.values()){
        if(entry.kind === "file") folderHave.add(entry.name.replace(/\.[a-z]+$/i, ""));
      }
      return folderHave;
    };
    return walk().catch(() => folderHave);
  });
}

function writeToFolder(id){
  if(!shotDir) return Promise.resolve(false);
  return getShotBlob(id).then(blob => {
    if(!blob) return false;
    return projectDir(shotPrj(id), true)
      .then(dir => dir && dir.getFileHandle(id + shotExt(id), {create:true}))
      .then(fh => fh && fh.createWritable())
      .then(w => w && w.write(blob).then(() => w.close()).then(() => {
        folderHave.add(id);
        return true;
      }))
      .catch(() => false);
  });
}

/* A session received from someone else has an empty store and a full folder. */
function readFromFolder(id){
  if(!shotDir) return Promise.resolve(null);
  return projectDir(shotPrj(id), false)
    .then(dir => dir && dir.getFileHandle(id + shotExt(id)))
    .then(fh => fh && fh.getFile())
    .then(file => {
      if(!file) return null;
      /* Keep a local copy so the second look does not go back to disk. */
      putShotBlob(id, file);
      return file;
    })
    .catch(() => null);
}

function shotsOutstanding(){
  return Object.keys(S.shots).filter(id => !folderHave.has(id));
}

/* A session arrives as a manifest and its files arrive, or do not, as a folder
   somebody remembered to send. Which of the two happened is worth saying. */
function shotsAbsent(){
  return storeIds().then(have =>
    Object.keys(S.shots).filter(id => !have.has(id) && !folderHave.has(id)));
}

function flushShots(){
  const todo = shotsOutstanding();
  if(!todo.length){ toast("The folder already has every screenshot"); return Promise.resolve(0); }
  if(shotDir){
    return todo.reduce((chain, id) => chain.then(n =>
      writeToFolder(id).then(done => n + (done ? 1 : 0))), Promise.resolve(0))
      .then(n => {
        renderShotSync();
        toast(n + " written to the folder");
        return n;
      });
  }
  /* No folder to write into, so hand the files over instead. They carry the
     name the manifest expects, so dropping them in wires everything up. */
  return todo.reduce((chain, id) => chain.then(n =>
    getShotBlob(id).then(blob => {
      if(!blob) return n;
      saveBlob(id + shotExt(id), blob);
      return n + 1;
    })), Promise.resolve(0))
    .then(n => {
      toast(n + " downloaded. Put them in assets/shots/" + S.id + "/");
      return n;
    });
}

function forgetShotDir(){
  shotDir = null;
  folderHave = new Set();
  return delMeta("dir").then(renderShotSync);
}

/* ---------- what Review says about it ---------- */
function renderShotSync(){
  /* What is absent needs the store, which answers later. Draw what is known
     now and let the shortfall land on top when it comes back. */
  shotsAbsent().then(absent => {
    if(!absent.length) return;
    const total = Object.keys(S.shots).length;
    const prjs = [...new Set(absent.map(shotPrj))];
    $("shotSyncState").innerHTML =
      "<b>" + absent.length + "</b> of " + total + " screenshot" + (total === 1 ? "" : "s") +
      " named by this session are not on this machine. Ask for " +
      prjs.map(p => "<code>assets/shots/" + esc(p) + "/</code>").join(" and ") +
      " and connect the folder, or drop it in yourself.";
    $("shotSync").classList.remove("linked");
    $("shotSync").classList.add("behind");
  });

  const box = $("shotSync"), state = $("shotSyncState");
  const total = Object.keys(S.shots).length;
  const missing = shotsOutstanding().length;
  box.classList.toggle("linked", !!shotDir && !missing);
  box.classList.toggle("behind", !!shotDir && !!missing);
  $("shotForget").hidden = !shotDir;
  $("shotConnect").textContent = shotDir ? "Change folder" : "Connect folder";
  $("shotFlush").hidden = !total || !missing;
  $("shotFlush").textContent = shotDir
    ? "Write " + missing + " to the folder"
    : "Download " + missing + " screenshot" + (missing === 1 ? "" : "s");

  if(!total){
    state.innerHTML = "No screenshots yet. Paste one and it will be filed under " +
      "<code>assets/shots/" + esc(S.id) + "/</code>.";
  }else if(shotDir && !missing){
    state.innerHTML = "<b>" + total + "</b> screenshot" + (total === 1 ? "" : "s") +
      ", all of them in <code>assets/shots/" + esc(S.id) + "/</code>. " +
      "Share that folder with the JSON and they travel together.";
  }else if(shotDir){
    state.innerHTML = "<b>" + missing + "</b> of " + total +
      " not written yet. They are safe in this browser either way.";
  }else if(folderSupported()){
    state.innerHTML = "<b>" + total + "</b> screenshot" + (total === 1 ? "" : "s") +
      " in this browser only. Connect <code>assets/shots/</code> and they get written " +
      "to <code>" + esc(S.id) + "/</code> inside it as you go.";
  }else{
    state.innerHTML = "<b>" + total + "</b> screenshot" + (total === 1 ? "" : "s") +
      " in this browser only. This browser cannot write to a folder, so download them " +
      "and put them in <code>assets/shots/" + esc(S.id) + "/</code> yourself.";
  }
  if(!folderSupported()) $("shotConnect").hidden = true;
}

$("shotConnect").addEventListener("click", () =>
  chooseShotDir().then(dir => {
    renderShotSync();
    if(!dir){ toast("No folder connected"); return; }
    /* Catch the folder up with whatever was pasted before it was connected. */
    if(shotsOutstanding().length) flushShots();
  }));
$("shotFlush").addEventListener("click", () => flushShots());
$("shotForget").addEventListener("click", () =>
  confirmAction($("shotForget"), "Confirm", () => {
    forgetShotDir();
    toast("Folder disconnected. The screenshots stay in this browser.");
  }));

/* ---------- getting one in ---------- */
/* A full-screen PNG is about 1.8 MB. At 1600px on the long edge in WebP it is
   nearer 200 KB and still reads, which is the difference between a session
   that holds a walkthrough's worth of evidence and one that does not. */
function encodeShot(file){
  const draw = src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  const url = URL.createObjectURL(file);
  return draw(url).then(img => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, SHOT_MAX / Math.max(img.naturalWidth, img.naturalHeight, 1));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return new Promise(resolve => {
      c.toBlob(blob => {
        /* A browser with no WebP encoder quietly hands back a PNG instead, so
           check what actually came out rather than what was asked for. */
        if(blob && blob.type === "image/webp") resolve({blob:blob, w:w, h:h});
        else c.toBlob(jpg => resolve({blob:jpg || blob, w:w, h:h}), "image/jpeg", SHOT_QUALITY);
      }, "image/webp", SHOT_QUALITY);
    });
  });
}

/* Everything that takes a screenshot goes through here: it lands in the store
   and in the manifest before anything else happens, so a capture can never be
   lost to a cancelled sheet or a closed tab. */
function takeShot(file){
  if(!file) return Promise.resolve(null);
  return encodeShot(file).then(out => {
    if(!out || !out.blob){ toast("That image could not be read"); return null; }
    const id = "shot-" + uid();
    return putShotBlob(id, out.blob).then(written => {
      /* A refused store -- private browsing, no quota -- would otherwise put a
         screenshot on the manifest whose bytes went nowhere, and the analyst
         would find out when the thumbnail came back empty. */
      if(!written){ toast("This browser will not store the screenshot"); return null; }
      S.shots[id] = shotEntry(S.id, {
        w:out.w, h:out.h, bytes:out.blob.size, type:out.blob.type,
        at:now(), ts:Date.now()
      });
      save();
      /* Straight through to the folder when there is one, so the only copy is
         never the one inside a browser profile. */
      writeToFolder(id).then(() => { if($("reviewView").classList.contains("on")) renderShotSync(); });
      return id;
    });
  }).catch(() => { toast("That image could not be read"); return null; });
}

function clipboardImageFile(){
  if(!navigator.clipboard || !navigator.clipboard.read) return Promise.resolve(null);
  return navigator.clipboard.read().then(items => {
    for(let i = 0; i < items.length; i++){
      const type = items[i].types.find(t => t.indexOf("image/") === 0);
      if(type) return items[i].getType(type);
    }
    return null;
  }).catch(() => null);
}

function imageFromPaste(e){
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for(let i = 0; i < items.length; i++){
    if(items[i].type && items[i].type.indexOf("image/") === 0) return items[i].getAsFile();
  }
  return null;
}

/* The store first, the folder second: my own session is in the store, and a
   session handed to me is in the folder somebody shared. */
function shotBytes(id){
  return getShotBlob(id).then(blob => blob || readFromFolder(id));
}

/* ---------- drawing them ---------- */
/* Thumbnails are rendered empty and filled in afterwards, because the bytes
   come out of IndexedDB asynchronously and every render in this app is not. */
function shotThumbs(ids, onRemove){
  const wrap = document.createElement("div");
  wrap.className = "shots";
  (ids || []).forEach(id => {
    const meta = S.shots[id];
    const fig = document.createElement("figure");
    fig.className = "shot";
    const img = document.createElement("img");
    img.className = "shot-img";
    img.dataset.shot = id;
    img.alt = meta && meta.w ? meta.w + " by " + meta.h + " screenshot" : "screenshot";
    img.addEventListener("click", () => openShot(id));
    fig.appendChild(img);
    if(onRemove){
      const rm = document.createElement("button");
      rm.className = "shot-x"; rm.type = "button"; rm.title = "Remove this screenshot";
      rm.textContent = "×";
      rm.addEventListener("click", e => { e.stopPropagation(); onRemove(id); });
      fig.appendChild(rm);
    }
    wrap.appendChild(fig);
  });
  return wrap;
}

function hydrateShots(){
  document.querySelectorAll("img.shot-img:not([src])").forEach(img => {
    const id = img.dataset.shot;
    const cached = shotUrls.get(id);
    if(cached){ img.src = cached; return; }
    shotBytes(id).then(blob => {
      if(!blob){ img.closest(".shot").classList.add("missing"); return; }
      const url = URL.createObjectURL(blob);
      shotUrls.set(id, url);
      img.src = url;
    });
  });
}

/* ---------- full size ---------- */
function openShot(id){
  const meta = S.shots[id] || {};
  $("shotMeta").textContent = (meta.w ? meta.w + " × " + meta.h : "unknown size") +
    (meta.at ? " · captured " + meta.at : "") +
    (meta.bytes ? " · " + Math.round(meta.bytes / 1024) + " KB" : "");
  const big = $("shotFull");
  big.removeAttribute("src");
  $("shotScrim").classList.add("on");
  const cached = shotUrls.get(id);
  if(cached){ big.src = cached; return; }
  shotBytes(id).then(blob => {
    if(!blob){
      $("shotMeta").textContent = "Not on this machine \u2014 " + id +
        " should be at assets/shots/" + shotPrj(id) + "/";
      return;
    }
    const url = URL.createObjectURL(blob);
    shotUrls.set(id, url);
    big.src = url;
  });
}
function closeShot(){ $("shotScrim").classList.remove("on"); }
$("shotClose").addEventListener("click", closeShot);
$("shotScrim").addEventListener("mousedown", e => { if(e.target === $("shotScrim")) closeShot(); });
document.addEventListener("keydown", e => {
  if(e.key === "Escape" && $("shotScrim").classList.contains("on")) closeShot();
});

/* ---------- the keystroke ----------
   One rule: a pasted image goes wherever the focus already is. Nothing else in
   the app has to know about clipboards, and there is no case where the analyst
   has to stop and decide where the screenshot belongs. */
document.addEventListener("paste", e => {
  const file = imageFromPaste(e);
  if(!file) return;
  e.preventDefault();
  const sheetOpen = $("scrim").classList.contains("on");
  const onNote = document.activeElement === $("noteBox");
  takeShot(file).then(id => {
    if(!id) return;   /* takeShot has already said which way it failed */
    if(sheetOpen){ draftShots.push(id); renderDraftShots(); toast("Screenshot attached"); return; }
    if(onNote){ pendingShots.push(id); toast("Screenshot will go with this note"); return; }
    if(document.activeElement === $("captureInput")){
      pendingShots.push(id);
      renderPending();
      toast("Screenshot will go with the next capture");
      return;
    }
    /* Nowhere in particular, so it becomes evidence in its own right rather
       than being guessed onto whatever was captured last. */
    S.items.push({
      id:uid(), section:"Evidence", name:"Screenshot " + now(),
      tags:["Screenshot"], relations:[], replies:[], shots:[id],
      at:now(), ts:Date.now()
    });
    renderAll(); save();
    toast("Screenshot filed under Evidence");
  });
});

function renderPending(){
  const wrap = $("capturePending");
  wrap.innerHTML = "";
  if(!pendingShots.length) return;
  wrap.appendChild(shotThumbs(pendingShots, id => {
    pendingShots = pendingShots.filter(x => x !== id);
    renderPending(); pruneShots();
  }));
  hydrateShots();
}

/* ---------- housekeeping ---------- */
/* A screenshot pasted into a sheet that was then cancelled leaves an entry
   nothing points at. Drop those rather than carrying them into the export. */
function pruneShots(){
  const used = new Set();
  const walk = list => (list || []).forEach(e => {
    (e.shots || []).forEach(id => used.add(id));
    (e.replies || []).forEach(r => (r.shots || []).forEach(id => used.add(id)));
  });
  walk(S.items); walk(S.notes); walk(S.marks);
  /* Held on purpose rather than orphaned: one is waiting for the item it will
     belong to, the other for the sheet to be saved. */
  pendingShots.forEach(id => used.add(id));
  draftShots.forEach(id => used.add(id));
  let dropped = 0;
  Object.keys(S.shots).forEach(id => {
    if(!used.has(id)){ delete S.shots[id]; delShotBlob(id); dropped++; }
  });
  if(dropped) save();
  return dropped;
}
