/* 19-boot.js
   Start-up only: restore the saved session, apply the saved shell state, draw
   the first frame. The only module that calls anything at load time. */
/* ---------- boot ---------- */
load();
S.ui = Object.assign({nav:true, insp:true, tab:"tape"}, S.ui || {});
document.documentElement.setAttribute("data-theme", S.theme || "dark");
setPanel("nav", S.ui.nav !== false);
setPanel("insp", S.ui.insp !== false);
setTab(S.ui.tab || "tape");
paintClock();
$("sessionName").value = S.name || "Untitled walkthrough";
selectSection(S.active && DEF[S.active] ? S.active : "Systems", true);
renderAll();
