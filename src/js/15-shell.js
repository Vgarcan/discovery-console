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
