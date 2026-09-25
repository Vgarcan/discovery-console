/* 02-state.js
   Session state, localStorage persistence with migration, shared helpers and the toast. */
const SECTIONS = Object.keys(DEF);
const KEY = "process.discovery.console.v1";
const LEGACY_KEY = "tqa.discovery.console.v1";

const DEFAULT_NAME = "Untitled walkthrough";

let S = {
  name:DEFAULT_NAME,
  active:"Systems",
  items:[],
  notes:[],
  marks:[],
  resolved:[],
  seconds:0,
  theme:"dark"
};

let seed = null;
let editingId = null;
let draftTags = [];
let draftRels = [];
let sugIndex = 0;
let sugList = [];

const $ = id => document.getElementById(id);
const esc = v => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const now = () => new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const inSection = s => S.items.filter(i => i.section === s);
const gapKey = (s,g) => s + "::" + g;

/* ---------- storage ---------- */
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){}
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
  let seq = 0;
  [S.items, S.notes, S.marks].forEach(list => (list || []).forEach(e => {
    if(!e.id) e.id = uid();
    if(!e.ts) e.ts = ++seq;
    if(!Array.isArray(e.replies)) e.replies = [];
    if(!Array.isArray(e.relations) && list === S.items) e.relations = [];
  }));
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
    host:btn.closest(".item-acts, .reply, .linkrow")
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
         !S.resolved.length && (S.name || "") === DEFAULT_NAME;
}

function resetSession(){
  S.name = DEFAULT_NAME;
  S.items = [];
  S.notes = [];
  S.marks = [];
  S.resolved = [];
  S.seconds = 0;
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
