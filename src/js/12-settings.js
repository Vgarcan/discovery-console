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

/* ---------- clock ----------
   Wall-clock, not a tick count. setInterval drifts, and a browser throttles a
   hidden tab's timers to about once a minute after a few minutes -- so a clock
   that counted its own ticks lost most of an hour whenever the analyst switched
   away to the call itself. S.seconds is the time banked so far; runningSince is
   when the current run started, and is runtime state rather than session data,
   so it never reaches the exported JSON. */
let runningSince = 0;

function elapsed(){
  return Math.floor(S.seconds + (runningSince ? (Date.now() - runningSince) / 1000 : 0));
}

function clockText(t){
  const two = n => String(n).padStart(2, "0");
  return two(Math.floor(t/3600)) + ":" + two(Math.floor((t%3600)/60)) + ":" + two(t%60);
}

/* Fold the running stretch into S.seconds and write it down, so a crash costs
   at most the last twenty seconds rather than everything since the last pause. */
function bankClock(){
  if(!runningSince) return;
  S.seconds = elapsed();
  runningSince = Date.now();
  save();
}

function paintClock(){
  const hidden = !!(S.ui && S.ui.clockOff);
  $("clock").textContent = hidden ? "--:--:--" : clockText(elapsed());
  $("clock").dataset.state = hidden ? "hidden" : (runningSince ? "running" : "paused");
  $("clockToggle").textContent = runningSince ? "Pause" : "Resume";
  $("clockHide").textContent = hidden ? "Show" : "Hide";
  $("liveWord").textContent = runningSince ? "recording" : "paused";
  $("liveBadge").classList.toggle("paused", !runningSince);
}

/* Boot only. Time while the console was closed is not time on the call, so a
   run that was open at the last save picks up from now rather than backdating. */
function startClock(){
  runningSince = S.paused ? 0 : Date.now();
  paintClock();
}

$("clockToggle").addEventListener("click", () => {
  if(runningSince){ S.seconds = elapsed(); runningSince = 0; S.paused = true; }
  else { runningSince = Date.now(); S.paused = false; }
  paintClock(); save();
});

$("clockReset").addEventListener("click", () =>
  confirmAction($("clockReset"), "Confirm", () => {
    S.seconds = 0;
    if(runningSince) runningSince = Date.now();
    paintClock(); save(); toast("Clock reset");
  }));

$("clockHide").addEventListener("click", () => {
  S.ui = S.ui || {};
  S.ui.clockOff = !S.ui.clockOff;
  paintClock(); save();
});

setInterval(() => {
  if(!runningSince) return;
  paintClock();
  if(Date.now() - runningSince >= 20000) bankClock();
}, 1000);
