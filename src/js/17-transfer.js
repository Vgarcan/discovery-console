/* 17-transfer.js
   Session transfer: JSON import by file or paste, and saving files through the artifact downloads capability. */
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
    return c;
  });
}

$("importReplace").addEventListener("click", () => {
  try{
    const o = parseSession($("importBox").value);
    const seq = {n:0};
    S.name = o.name || S.name;
    S.items = normalise(o.items, seq).map(i => Object.assign({relations:[], tags:[]}, i));
    S.notes = normalise(o.notes, seq);
    S.marks = normalise(o.marks, seq);
    S.resolved = o.resolved || [];
    if(typeof o.seconds === "number") S.seconds = o.seconds;
    $("sessionName").value = S.name;
    closeImport(); save(); renderAll(); setView("capture");
    toast("Session replaced, " + S.items.length + " items loaded");
  }catch(err){ $("importMsg").textContent = err.message; }
});

$("importMerge").addEventListener("click", () => {
  try{
    const o = parseSession($("importBox").value);
    const seq = {n:Date.now()};
    const map = {};
    const incoming = normalise(o.items, seq).map(i => Object.assign({relations:[], tags:[]}, i));
    incoming.forEach(i => { const old = i.id; i.id = uid(); map[old] = i.id; });
    incoming.forEach(i => {
      i.relations = (i.relations || []).map(r => ({type:r.type, targetId:map[r.targetId] || r.targetId}))
                                       .filter(r => map[r.targetId] || S.items.some(x => x.id === r.targetId));
    });
    S.items = S.items.concat(incoming);
    S.notes = S.notes.concat(normalise(o.notes, seq).map(n => Object.assign({}, n, {id:uid()})));
    S.marks = S.marks.concat(normalise(o.marks, seq).map(m => Object.assign({}, m, {id:uid()})));
    (o.resolved || []).forEach(r => { if(!S.resolved.includes(r)) S.resolved.push(r); });
    closeImport(); save(); renderAll(); setView("capture");
    toast(incoming.length + " items merged in");
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
      $("importSummary").innerHTML = '<span class="label">' + esc(file.name) + "</span>" +
        "<b>" + (o.items.length) + "</b> items, <b>" + o.notes.length + "</b> notes, <b>" +
        o.marks.length + "</b> marks" + (o.name ? " — " + esc(o.name) : "");
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
