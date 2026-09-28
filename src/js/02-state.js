/* 02-state.js
   Session state, localStorage persistence with migration, shared helpers and the toast. */
const SECTIONS = Object.keys(DEF);
const KEY = "process.discovery.console.v1";
const LEGACY_KEY = "tqa.discovery.console.v1";

const DEFAULT_NAME = "Untitled walkthrough";

let S = {
  id:"",
  name:DEFAULT_NAME,
  active:"Systems",
  items:[],
  notes:[],
  marks:[],
  resolved:[],
  shots:{},
  manual:{},
  /* Images placed into a document slot by hand, keyed by that slot. Separate
     from S.manual because those are typed strings and these are lists of
     screenshot ids, and separate from the items because a process map belongs
     to the document, not to anything that was captured during the call. */
  pddShots:{},
  seconds:0,
  paused:false,
  theme:"dark"
};

let seed = null;
let editingId = null;
let draftTags = [];
let draftRels = [];
/* Which relations were made while the sheet has been open, so the ones that
   were already on the item can be told apart from the ones you just added. */
let freshRels = new Set();
/* Screenshots pasted while a sheet is open, and ones pasted at the capture bar
   that are waiting for the item they belong to to be created. */
let draftShots = [];
let pendingShots = [];
const relKey = r => r.type + "\u0000" + r.targetId;
let sugIndex = 0;
let sugList = [];

const $ = id => document.getElementById(id);
const esc = v => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const now = () => new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

/* A project keeps this for life. Its name does not: it gets rewritten halfway
   through a walkthrough, and anything filed under the name -- screenshots, most
   of all -- would come loose the moment it changed. Short enough to read out
   over a call, because that is how someone finds the right folder. */
function newProjectId(){
  let s = "";
  while(s.length < 6) s += Math.random().toString(36).slice(2);
  return "prj-" + s.slice(0, 6);
}
/* A screenshot never lives in the session, only its description does. Every
   entry remembers whose folder holds the file, so a session merged in from
   another walkthrough can still find images that belong to that one. */
function shotEntry(prj, extra){
  return Object.assign({w:0, h:0, bytes:0, type:"", at:"", ts:0, prj:prj}, extra || {});
}

/* What the analyst typed into the PDD cells the console has no way to capture,
   keyed by where in the template it goes. Item ids are part of the key, so
   renaming a system does not lose the access note filed against it. */
function normaliseManual(raw){
  const out = {};
  if(!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  Object.keys(raw).forEach(k => {
    if(typeof raw[k] === "string" && raw[k].trim()) out[k] = raw[k];
  });
  return out;
}

/* Same shape on the way in as on the way out: slot -> list of ids. Anything
   else in the file is dropped rather than trusted. */
function normalisePddShots(raw){
  const out = {};
  if(!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  Object.keys(raw).forEach(k => {
    if(!Array.isArray(raw[k])) return;
    const ids = raw[k].filter(x => typeof x === "string" && x);
    if(ids.length) out[k] = ids;
  });
  return out;
}

function normaliseShots(raw, prj){
  const out = {};
  if(!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  Object.keys(raw).forEach(id => {
    const s = raw[id];
    if(!s || typeof s !== "object") return;
    out[id] = shotEntry(typeof s.prj === "string" && s.prj ? s.prj : prj, {
      w:Number(s.w) || 0, h:Number(s.h) || 0, bytes:Number(s.bytes) || 0,
      type:typeof s.type === "string" ? s.type : "",
      at:typeof s.at === "string" ? s.at : "",
      ts:Number(s.ts) || 0
    });
  });
  return out;
}

/* Anything that points at a screenshot the manifest has never heard of gets a
   bare entry rather than being dropped: the id is still enough to go and look
   for the file, and a blank where a screenshot should be is worth seeing. */
/* A document slot names screenshots the same way an item does, so a file that
   arrives without them still has to say what it is missing rather than drop
   the reference and pretend the slot was always empty. */
function attachPddShots(slots, manifest, prj){
  let orphans = 0;
  Object.keys(slots || {}).forEach(k => {
    slots[k].forEach(id => {
      if(!manifest[id]){ manifest[id] = shotEntry(prj); orphans++; }
    });
  });
  return orphans;
}

function attachShots(list, manifest, prj){
  let orphans = 0;
  const keep = ids => {
    if(!Array.isArray(ids)) return [];
    return ids.filter(x => typeof x === "string").map(x => {
      if(!manifest[x]){ manifest[x] = shotEntry(prj); orphans++; }
      return x;
    });
  };
  (list || []).forEach(e => {
    e.shots = keep(e.shots);
    (e.replies || []).forEach(r => { r.shots = keep(r.shots); });
  });
  return orphans;
}
const inSection = s => S.items.filter(i => i.section === s);
const gapKey = (s,g) => s + "::" + g;

/* ---------- storage ---------- */
/* A full quota used to be swallowed here. The analyst kept capturing into a
   session that had silently stopped being written, and lost the lot on the next
   refresh. Nothing recovers from that after the fact, so it has to be said out
   loud the moment it happens, and kept on screen until it is no longer true. */
let storageDown = false;

function save(){
  try{
    localStorage.setItem(KEY, JSON.stringify(S));
    if(storageDown){
      storageDown = false;
      $("storageWarn").hidden = true;
      toast("Saving again");
    }
  }catch(e){
    if(!storageDown){
      storageDown = true;
      $("storageWarn").hidden = false;
      toast("Out of browser storage. This session is NOT being saved — download the JSON now.");
    }
  }
}
function load(){
  try{
    let raw = localStorage.getItem(KEY);
    if(!raw){
      /* A session saved under the name the tool used to carry is moved across
         once, so a rename never looks to the analyst like a cleared console. */
      const old = localStorage.getItem(LEGACY_KEY);
      if(old){
        raw = old;
        localStorage.setItem(KEY, old);
        localStorage.removeItem(LEGACY_KEY);
      }
    }
    if(raw) S = Object.assign(S, JSON.parse(raw));
  }catch(e){}
  if(!S.id) S.id = newProjectId();
  S.shots = normaliseShots(S.shots, S.id);
  S.manual = normaliseManual(S.manual);
  S.pddShots = normalisePddShots(S.pddShots);
  attachPddShots(S.pddShots, S.shots, S.id);
  let seq = 0;
  [S.items, S.notes, S.marks].forEach(list => (list || []).forEach(e => {
    if(!e.id) e.id = uid();
    if(!e.ts) e.ts = ++seq;
    if(!Array.isArray(e.replies)) e.replies = [];
    /* Where the entry sits in the record, when that is no longer where its
       capture time would put it. Anything that is not a usable number is
       dropped rather than kept, and the entry falls back to its timestamp. */
    if("ord" in e && !(typeof e.ord === "number" && isFinite(e.ord))) delete e.ord;
    if(!Array.isArray(e.relations) && list === S.items) e.relations = [];
    /* A tag list that arrived as a bare string is one tag, not a broken
       field, so it is wrapped rather than dropped. Everything downstream --
       the rail, the map, the PDD -- calls .forEach on this. */
    if(list === S.items && !Array.isArray(e.tags)){
      e.tags = typeof e.tags === "string" && e.tags ? [e.tags] : [];
    }
  }));
  [S.items, S.notes, S.marks].forEach(list => attachShots(list, S.shots, S.id));
}

/* ---------- two-step destructive actions ---------- */
/* Deleting is one keystroke away from the capture flow, so it arms on the first
   press and only runs on the second. The armed button widens and turns red, and
   a short dead time after arming swallows a double-click that would otherwise
   sail straight through both presses. */
const ARM_DEAD_MS = 400;
const ARM_LIFE_MS = 4000;
let armed = null;
let armTimer = 0;

function disarm(){
  if(!armed) return;
  armed.btn.textContent = armed.label;
  armed.btn.classList.remove("armed");
  if(armed.host) armed.host.classList.remove("arming");
  armed = null;
  clearTimeout(armTimer);
}

/* First call arms btn and relabels it; the second runs fn. */
function confirmAction(btn, label, fn){
  if(armed && armed.btn === btn){
    if(Date.now() - armed.at < ARM_DEAD_MS) return;
    disarm();
    fn();
    return;
  }
  disarm();
  armed = {
    btn:btn, label:btn.textContent, at:Date.now(),
    host:btn.closest(".item-acts, .entry-acts, .reply, .linkrow")
  };
  btn.textContent = label;
  btn.classList.add("armed");
  if(armed.host) armed.host.classList.add("arming");
  armTimer = setTimeout(disarm, ARM_LIFE_MS);
}

/* Anything else the analyst does calls the delete off. */
document.addEventListener("pointerdown", e => {
  if(armed && !armed.btn.contains(e.target)) disarm();
}, true);
document.addEventListener("keydown", e => { if(e.key === "Escape") disarm(); });

/* ---------- starting over ---------- */
/* This clears the session, not the view state each module keeps for itself.
   selectSection() drops the stage tag filter and the seed, renderTapeFilter()
   drops kinds that no longer exist, and the map owns its own resetMap(). The
   single repaint is what makes that division safe. Preferences -- theme, panel
   widths, the open inspector tab -- are deliberately kept. */
function sessionIsEmpty(){
  return !S.items.length && !S.notes.length && !S.marks.length &&
         !S.resolved.length && !Object.keys(S.shots || {}).length &&
         !Object.keys(S.manual || {}).length &&
         (S.name || "") === DEFAULT_NAME;
}

function resetSession(){
  /* A new walkthrough is a new project, so it gets its own id and its own
     folder. The old one keeps whatever was filed under it. */
  S.id = newProjectId();
  S.shots = {};
  S.manual = {};
  S.name = DEFAULT_NAME;
  S.items = [];
  S.notes = [];
  S.marks = [];
  S.resolved = [];
  S.seconds = 0;
  S.paused = false;
  S.active = SECTIONS[0];
  editingId = null;
  draftTags = [];
  draftRels = [];
  disarm();
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 1800);
}
