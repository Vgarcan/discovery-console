/* 17-transfer.js
   Session lifecycle: JSON import by file or paste, saving files through the artifact
   downloads capability, and clearing the session to start a new one. */
/* =================== JSON IMPORT =================== */
function openImport(){
  $("importScrim").classList.add("on");
  $("importBox").value = "";
  $("importMsg").textContent = "";
  $("importSummary").classList.remove("on");
  $("importSummary").innerHTML = "";
  $("importFile").value = "";
  $("pasteAlt").open = false;
  setTimeout(() => $("importBox").focus(), 40);
}
function closeImport(){ $("importScrim").classList.remove("on"); }
$("importBtn").addEventListener("click", openImport);
$("importCancel").addEventListener("click", closeImport);
$("importScrim").addEventListener("mousedown", e => { if(e.target === $("importScrim")) closeImport(); });

function parseSession(raw){
  let o;
  try{ o = JSON.parse(raw); }
  catch(e){ throw new Error("That is not valid JSON. Paste the whole export, braces included."); }
  if(!o || !Array.isArray(o.items)) throw new Error("This JSON has no items array, so it is not a console session.");
  ["items","notes","marks","resolved"].forEach(k => { if(!Array.isArray(o[k])) o[k] = []; });
  return o;
}

function normalise(list, seq){
  return (list || []).map(e => {
    const c = Object.assign({}, e);
    if(!c.id) c.id = uid();
    if(!c.ts) c.ts = ++seq.n;
    if(!Array.isArray(c.replies)) c.replies = [];
    /* Where the entry sits in the record, when that is no longer where its
       capture time would put it. Anything that is not a usable number is
       dropped rather than kept, and the entry falls back to its timestamp. */
    if("ord" in c && !(typeof c.ord === "number" && isFinite(c.ord))) delete c.ord;
    /* A tag list that arrived as a bare string is one tag, not a broken
       field, so it is wrapped rather than dropped. Everything downstream --
       the rail, the map, the PDD -- calls .forEach on this. */
    if(c.tags !== undefined && !Array.isArray(c.tags)){
      c.tags = typeof c.tags === "string" && c.tags ? [c.tags] : [];
    }
    return c;
  });
}

/* An item naming an area the console does not have used to be counted in the
   session totals and then be unreachable everywhere else: no area rail, no
   review inventory, no PDD section. Park it in the first area instead and say
   so, rather than letting the item count lie. */
const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

function placeItems(list){
  let stray = 0;
  list.forEach(i => {
    if(!DEF[i.section]){ i.section = SECTIONS[0]; stray++; }
    if(!Array.isArray(i.tags)) i.tags = [];
    if(!Array.isArray(i.relations)) i.relations = [];
  });
  return stray;
}

$("importReplace").addEventListener("click", () =>
  confirmAction($("importReplace"), "Confirm replace", doReplace));

function doReplace(){
  try{
    const o = parseSession($("importBox").value);
    const seq = {n:0};
    /* The file's project id comes across with it: the screenshots it names live
       in that project's folder, whatever this console called itself before. */
    S.id = typeof o.id === "string" && o.id ? o.id : newProjectId();
    S.name = o.name || S.name;
    S.items = normalise(o.items, seq);
    const stray = placeItems(S.items);
    S.notes = normalise(o.notes, seq);
    S.marks = normalise(o.marks, seq);
    S.resolved = Array.isArray(o.resolved) ? o.resolved.filter(r => typeof r === "string") : [];
    S.shots = normaliseShots(o.shots, S.id);
    S.manual = normaliseManual(o.manual);
    S.pddShots = normalisePddShots(o.pddShots);
    const loose = [S.items, S.notes, S.marks]
      .reduce((n, list) => n + attachShots(list, S.shots, S.id), 0);
    if(typeof o.seconds === "number") S.seconds = o.seconds;
    /* Opening someone's session is not being on their call, so the clock takes
       the elapsed time and stops rather than carrying on counting. */
    S.paused = true;
    $("sessionName").value = S.name;
    startClock();
    closeImport(); save(); renderAll(); setView("capture");
    toast("Session replaced, " + S.items.length + " items loaded" +
          (stray ? ". " + stray + " moved to " + SECTIONS[0] + " from an unknown area" : "") +
          (loose ? ". " + plural(loose, "screenshot") + " named but not described" : ""));
  }catch(err){ $("importMsg").textContent = err.message; }
}

$("importMerge").addEventListener("click", () => {
  try{
    const o = parseSession($("importBox").value);
    const seq = {n:Date.now()};
    const map = {};
    const incoming = normalise(o.items, seq);
    const stray = placeItems(incoming);
    /* Merging keeps this project's id, so the incoming screenshots have to say
       which folder they came from or they would be looked for in the wrong one. */
    const fromPrj = typeof o.id === "string" && o.id ? o.id : S.id;
    Object.assign(S.shots, normaliseShots(o.shots, fromPrj));
    Object.assign(S.manual, normaliseManual(o.manual));
    /* A slot is a slot: two sessions merged both want section 2.2, so the
       images join rather than one silently winning. */
    const incomingSlots = normalisePddShots(o.pddShots);
    Object.keys(incomingSlots).forEach(k => {
      S.pddShots[k] = (S.pddShots[k] || []).concat(
        incomingSlots[k].filter(id => (S.pddShots[k] || []).indexOf(id) < 0));
    });
    incoming.forEach(i => { const old = i.id; i.id = uid(); map[old] = i.id; });
    /* Filter on the ORIGINAL target, then rewrite it. Rewriting first and then
       testing the new id against a map keyed by the old ones dropped every
       relation in the imported set. */
    incoming.forEach(i => {
      i.relations = i.relations
        .filter(r => map[r.targetId] || S.items.some(x => x.id === r.targetId))
        .map(r => ({type:r.type, targetId:map[r.targetId] || r.targetId}));
    });
    const inNotes = normalise(o.notes, seq).map(n => Object.assign({}, n, {id:uid()}));
    const inMarks = normalise(o.marks, seq).map(m => Object.assign({}, m, {id:uid()}));
    const loose = [incoming, inNotes, inMarks]
      .reduce((n, list) => n + attachShots(list, S.shots, fromPrj), 0);
    S.items = S.items.concat(incoming);
    S.notes = S.notes.concat(inNotes);
    S.marks = S.marks.concat(inMarks);
    (o.resolved || []).forEach(r => {
      if(typeof r === "string" && !S.resolved.includes(r)) S.resolved.push(r);
    });
    closeImport(); save(); renderAll(); setView("capture");
    toast(incoming.length + " items merged in" +
          (stray ? ", " + stray + " moved to " + SECTIONS[0] + " from an unknown area" : "") +
          (loose ? ", " + plural(loose, "screenshot") + " named but not described" : ""));
  }catch(err){ $("importMsg").textContent = err.message; }
});



/* =================== FILE SAVE AND LOAD =================== */
let dlNs;
async function getDownloads(){
  if(dlNs !== undefined) return dlNs;
  try{
    dlNs = (window.claude && typeof claude.use === "function") ? await claude.use("downloads") : null;
  }catch(e){ dlNs = null; }
  return dlNs;
}

function slug(s){
  return (s || "discovery-session").toLowerCase()
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60) || "discovery-session";
}

/* Images cannot go through saveFile, which turns its argument into text. */
function saveBlob(filename, blob){
  try{
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
    return true;
  }catch(e){ return false; }
}

function browserSave(filename, text, okMsg){
  try{
    const blob = new Blob([text], {type:"application/octet-stream"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
    toast(okMsg);
  }catch(e){ toast("Could not save the file here, use Copy instead"); }
}

async function saveFile(filename, text, okMsg){
  const ns = await getDownloads();
  if(!ns){ browserSave(filename, text, okMsg); return; }
  try{
    await ns.save({filename:filename, data:text});
    toast(okMsg);
  }catch(err){
    const code = err && err.code;
    if(code === "declined") return;
    if(code === "rate_limited"){ toast("A save prompt is already open"); return; }
    browserSave(filename, text, okMsg);
  }
}

$("dlJsonBtn").addEventListener("click", () =>
  saveFile(slug(S.name) + "-" + today() + ".json", JSON.stringify(S,null,2), "Session saved as JSON"));
$("dlMdBtn").addEventListener("click", () =>
  saveFile(slug(S.name) + "-pdd-draft-" + today() + ".md", pddMarkdown(), "PDD draft saved as Markdown"));

/* ----- reading a file in ----- */
function loadIntoImport(file){
  if(!file) return;
  if(!/\.json$/i.test(file.name) && file.type.indexOf("json") === -1){
    $("importMsg").textContent = "That is not a .json file.";
    return;
  }
  const r = new FileReader();
  r.onload = () => {
    $("importBox").value = r.result;
    $("importMsg").textContent = "";
    try{
      const o = parseSession(r.result);
      $("importSummary").classList.add("on");
      /* A session file never carries the images, so say how many it expects to
         find and where, before anything is replaced. */
      const shotCount = (o.shots && typeof o.shots === "object") ? Object.keys(o.shots).length : 0;
      $("importSummary").innerHTML = '<span class="label">' + esc(file.name) + "</span>" +
        "<b>" + (o.items.length) + "</b> items, <b>" + o.notes.length + "</b> notes, <b>" +
        o.marks.length + "</b> marks" +
        (shotCount ? ", <b>" + shotCount + "</b> screenshots it does not carry" : "") +
        (o.name ? " — " + esc(o.name) : "");
    }catch(err){
      $("importSummary").classList.remove("on");
      $("importMsg").textContent = err.message;
    }
  };
  r.onerror = () => { $("importMsg").textContent = "The file could not be read."; };
  r.readAsText(file);
}

$("importPick").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", e => loadIntoImport(e.target.files && e.target.files[0]));

const drop = $("importDrop");
["dragenter","dragover"].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.add("over");
}));
["dragleave","drop"].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.remove("over");
}));
drop.addEventListener("drop", e => {
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  loadIntoImport(f);
});

$("importBtn2").addEventListener("click", openImport);

/* =================== NEW SESSION =================== */
/* The most destructive thing in the app, so it is the only one behind a dialog
   rather than the two-press arm used everywhere else: the confirm sits in a
   different place from the button that opened it, and the export is one click
   away at the moment it is worth taking. */
function openNew(){
  if(sessionIsEmpty()) return;
  const answered = buildGaps().filter(g => g.done).length;
  const n = (v, word) => "<b>" + v + "</b> " + word + (v === 1 ? "" : "s");
  $("newSummary").innerHTML =
    '<span class="label">' + esc(S.name || DEFAULT_NAME) + "</span>" +
    [n(S.items.length, "item"), n(S.notes.length, "note"), n(S.marks.length, "mark"),
     n(answered, "question") + " answered"].join(", ");
  $("newScrim").classList.add("on");
  setTimeout(() => $("newCancel").focus(), 30);
}
function closeNew(){ $("newScrim").classList.remove("on"); }

$("newBtn").addEventListener("click", openNew);
$("newCancel").addEventListener("click", closeNew);
$("newScrim").addEventListener("mousedown", e => { if(e.target === $("newScrim")) closeNew(); });
$("newExport").addEventListener("click", () =>
  saveFile(slug(S.name) + "-" + today() + ".json", JSON.stringify(S,null,2), "Session saved as JSON"));

$("newConfirm").addEventListener("click", () => {
  resetSession();
  $("sessionName").value = S.name;
  $("captureInput").value = "";
  $("noteBox").value = "";
  resetMap();
  closeNew();
  startClock();
  save();
  setView("capture");
  selectSection(S.active, true);
  renderAll();
  toast("New session started");
});

document.addEventListener("keydown", e => {
  if(e.key !== "Escape") return;
  if($("newScrim").classList.contains("on")){ closeNew(); return; }
  if($("importScrim").classList.contains("on")) closeImport();
});
