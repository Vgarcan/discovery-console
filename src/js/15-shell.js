/* 15-shell.js
   Shell navigation: view switching, collapsible panels and inspector tabs. */
/* =================== SHELL NAVIGATION =================== */
let currentView = "capture";

function paintIcons(v){
  document.querySelectorAll(".ico[data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === v));
}

function setView(v){
  if(v === "map"){ openMap(); return; }
  currentView = v;
  $("liveView").classList.toggle("off", v !== "capture");
  $("reviewView").classList.toggle("on", v === "review");
  $("pddView").classList.toggle("on", v === "pdd");
  $("liveBadge").style.display = v === "capture" ? "" : "none";
  $("finishBtn").style.display = v === "capture" ? "" : "none";
  if(v === "review"){ renderReview(); $("reviewView").scrollTop = 0; }
  if(v === "pdd"){ renderPDD(); $("pddView").scrollTop = 0; }
  paintIcons(v);
}

document.querySelectorAll(".ico[data-view]").forEach(b =>
  b.addEventListener("click", () => setView(b.dataset.view)));

function setPanel(which, on){
  S.ui = S.ui || {};
  S.ui[which] = on;
  $("shell").setAttribute(which === "nav" ? "data-nav" : "data-insp", on ? "on" : "off");
  $(which === "nav" ? "navToggle" : "inspToggle").setAttribute("aria-pressed", on ? "true" : "false");
  save();
}
$("navToggle").addEventListener("click", () => setPanel("nav", !S.ui.nav));
$("inspToggle").addEventListener("click", () => setPanel("insp", !S.ui.insp));

function setTab(t){
  S.ui = S.ui || {};
  S.ui.tab = t;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  [["tape","paneTape"],["gaps","paneGaps"],["note","paneNote"]].forEach(([k,id]) =>
    $(id).classList.toggle("on", k === t));
  save();
  if(t === "note") setTimeout(() => $("noteBox").focus(), 20);
}
document.querySelectorAll(".tab").forEach(b =>
  b.addEventListener("click", () => setTab(b.dataset.tab)));

document.addEventListener("keydown", e => {
  if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if($("mapScrim").classList.contains("on")) return;
  if(e.key === "["){ e.preventDefault(); setPanel("nav", !S.ui.nav); }
  if(e.key === "]"){ e.preventDefault(); setPanel("insp", !S.ui.insp); }
});

/* =================== RESIZABLE PANELS =================== */
/* Four side panels can be dragged by their inner edge: the areas rail and the
   inspector on the capture view, the filters and the detail panel in the map.
   Each one writes a --*-open custom property; the collapse rules still zero the
   grid track, so hiding a panel never forgets the width the analyst chose. */
const STAGE_MIN = 320;

const PANES = {
  nav:{
    handle:"navResize", host:"shell", prop:"--navw-open", key:"navw",
    min:180, max:560, def:238, grow:1, sib:"insp", room:() => $("liveView").clientWidth
  },
  insp:{
    handle:"inspResize", host:"shell", prop:"--inspw-open", key:"inspw",
    min:240, max:680, def:318, grow:-1, sib:"nav", room:() => $("liveView").clientWidth
  },
  mapside:{
    handle:"mapSideResize", host:"mapBody", prop:"--mapsidew", key:"mapsidew",
    min:180, max:520, def:238, grow:1, sib:"mapdetail", room:() => $("mapBody").clientWidth,
    after:() => { sizeMap(); fitMap(); }
  },
  mapdetail:{
    handle:"mapDetailResize", host:"mapBody", prop:"--mapdetailw", key:"mapdetailw",
    min:220, max:620, def:300, grow:-1, sib:"mapside", room:() => $("mapBody").clientWidth,
    after:() => { sizeMap(); fitMap(); }
  }
};

function paneCollapsed(which){
  if(which === "nav") return S.ui.nav === false;
  if(which === "insp") return S.ui.insp === false;
  if(which === "mapdetail") return !$("mapBody").classList.contains("detail");
  return false;
}

function paneWidth(which){
  const p = PANES[which];
  const v = parseFloat(getComputedStyle($(p.host)).getPropertyValue(p.prop));
  return isFinite(v) && v > 0 ? v : p.def;
}

function setPaneWidth(which, w, persist){
  const p = PANES[which];
  const taken = paneCollapsed(p.sib) ? 0 : paneWidth(p.sib);
  const room = (p.room() || 1200) - taken - STAGE_MIN;
  const max = Math.max(p.min, Math.min(p.max, room));
  const v = Math.round(Math.max(p.min, Math.min(w, max)));
  $(p.host).style.setProperty(p.prop, v + "px");
  $(p.handle).setAttribute("aria-valuenow", v);
  if(persist){ S.ui[p.key] = v; save(); }
  return v;
}

/* Only a width the analyst actually set is replayed, so the stylesheet keeps
   owning the defaults and the narrow-window breakpoints. */
function applyPaneWidths(){
  /* twice: the first pass clamps each pane against its sibling's default, the
     second against the width that pass has just put there. */
  for(let pass = 0; pass < 2; pass++){
    Object.keys(PANES).forEach(which => {
      const w = S.ui[PANES[which].key];
      if(typeof w === "number" && isFinite(w)) setPaneWidth(which, w, false);
    });
  }
}

function wirePaneResize(which){
  const p = PANES[which];
  const h = $(p.handle);

  h.addEventListener("pointerdown", e => {
    if(e.button !== 0) return;
    const startX = e.clientX, startW = paneWidth(which);
    try{ h.setPointerCapture(e.pointerId); }catch(err){}
    h.classList.add("dragging");
    document.body.classList.add("resizing");

    const move = ev => setPaneWidth(which, startW + p.grow * (ev.clientX - startX), false);
    const stop = () => {
      h.removeEventListener("pointermove", move);
      h.removeEventListener("pointerup", stop);
      h.removeEventListener("pointercancel", stop);
      h.classList.remove("dragging");
      document.body.classList.remove("resizing");
      setPaneWidth(which, paneWidth(which), true);
      if(p.after) p.after();
    };
    h.addEventListener("pointermove", move);
    h.addEventListener("pointerup", stop);
    h.addEventListener("pointercancel", stop);
  });

  /* no preventDefault on pointerdown, so the double-click reset still fires;
     body.resizing carries user-select:none, which is what selection needs. */
  h.addEventListener("dragstart", e => e.preventDefault());

  h.addEventListener("dblclick", () => { setPaneWidth(which, p.def, true); if(p.after) p.after(); });

  h.addEventListener("keydown", e => {
    const step = e.shiftKey ? 48 : 16;
    let w = null;
    if(e.key === "ArrowLeft") w = paneWidth(which) - step;
    else if(e.key === "ArrowRight") w = paneWidth(which) + step;
    else if(e.key === "Home") w = p.def;
    if(w === null) return;
    e.preventDefault();
    setPaneWidth(which, w, true);
    if(p.after) p.after();
  });
}
Object.keys(PANES).forEach(wirePaneResize);

/* A narrower window must not let a stored width squeeze the stage away. The
   stored preference is left alone; only what is rendered is re-clamped. */
window.addEventListener("resize", () => {
  Object.keys(PANES).forEach(which => {
    const w = S.ui[PANES[which].key];
    if(typeof w === "number" && isFinite(w)) setPaneWidth(which, w, false);
  });
});
