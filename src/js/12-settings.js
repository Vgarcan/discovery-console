/* 12-settings.js
   Theme switch, global keyboard shortcuts and the session clock. */
/* ---------- theme ---------- */
$("themeBtn").addEventListener("click", () => {
  S.theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", S.theme);
  save();
});

/* ---------- keyboard ---------- */
document.addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "m"){ e.preventDefault(); markMoment(); return; }
  if(e.key === "Escape" && $("scrim").classList.contains("on")){ closeSheet(); return; }
  if(typing && document.activeElement !== document.body) return;
  if(/^[1-9]$/.test(e.key)){
    const sec = SECTIONS[Number(e.key)-1];
    if(sec && currentView === "capture") selectSection(sec);
    return;
  }
  if((e.key === "Enter" || e.key === "/") && currentView === "capture"){
    e.preventDefault();
    $("captureInput").focus();
  }
});

/* ---------- clock ---------- */
function paintClock(){
  const h = String(Math.floor(S.seconds/3600)).padStart(2,"0");
  const m = String(Math.floor((S.seconds%3600)/60)).padStart(2,"0");
  const s = String(S.seconds%60).padStart(2,"0");
  $("clock").textContent = h + ":" + m + ":" + s;
}

setInterval(() => {
  S.seconds++;
  paintClock();
  if(S.seconds % 20 === 0) save();
}, 1000);
