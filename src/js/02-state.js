/* 02-state.js
   Session state, localStorage persistence with migration, shared helpers and the toast. */
const SECTIONS = Object.keys(DEF);
const KEY = "tqa.discovery.console.v1";

let S = {
  name:"Untitled walkthrough",
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
    const raw = localStorage.getItem(KEY);
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

/* ---------- toast ---------- */
let toastTimer;
function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 1800);
}
