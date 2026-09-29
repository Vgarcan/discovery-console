/* 20-tour.js
   A guided tour of the whole console. It drives the app rather than describing
   it from the capture screen -- "Review has five tabs" is a sentence, opening
   them is a tour -- and it captures nothing. A tour that leaves three made-up
   systems behind is one you have to clean up after, and the first thing anyone
   would reach for is New session, which is how a first run ends up looking
   like a mess instead of an empty page. */

/* Each step names a control by selector and, optionally, where the app has to
   be for that control to exist: `view` is one of the four, `tab` the inspector
   tab on capture or the section tab on review, `map` the map over the top. */
const TOUR = [
  {
    title: "The whole console in a couple of minutes",
    text: "You are on a call and things arrive faster than you can write them down. " +
          "This walks through where they land, and what happens to them afterwards.\n\n" +
          "It moves the app around as it goes. Nothing is captured and nothing is changed."
  },

  /* ---- capture ---- */
  {
    at: {view:"capture"}, sel: "#channels",
    title: "Nine areas, one at a time",
    text: "Everything you capture belongs to one of nine areas. Pick the one you are " +
          "hearing about, or press its number, 1 to 9. The question at the top of the " +
          "stage changes with it, and so do the types below it."
  },
  {
    at: {view:"capture"}, sel: "#captureInput",
    title: "Name it, then move on",
    text: "Type what you heard and press Enter. That is the whole capture. Detail can " +
          "wait for review — the thing you cannot get back is the name you did not write down."
  },
  {
    at: {view:"capture"}, sel: "#types",
    title: "Or pick the kind first",
    text: "Press a type and the capture field is primed for it. The tag comes with the " +
          "type, and tags are what let the draft document fill itself later."
  },
  {
    at: {view:"capture"}, sel: "#detailBtn",
    title: "Details, when you need them",
    text: "Tags, relations to other items, and screenshots. Rarely worth opening mid-call. " +
          "Every item can be reopened here later, from the list, the tape or the map."
  },
  {
    at: {view:"capture"}, sel: "#markBtn",
    title: "Mark the moment",
    text: "Something you will want to find in the recording afterwards. It stamps the " +
          "time, not whatever you happen to be typing, which is why it sits by the clock " +
          "rather than by the capture field."
  },

  /* ---- the inspector, one tab at a time ---- */
  {
    at: {view:"capture", tab:"tape"}, sel: ".tabs", need: ".inspector",
    title: "The inspector has three tabs",
    text: "Tape, Questions and Note. This is the part you watch during the call: what " +
          "just happened, what is still missing, and somewhere to park a thought."
  },
  {
    at: {view:"capture", tab:"tape"}, sel: "#paneTape", need: ".inspector",
    title: "Tape: the last fourteen",
    text: "Newest first, colour coded by area, with the chips at the top filtering by kind. " +
          "Hover a row for Reply, Edit and Delete. Fourteen is deliberate — mid-call this " +
          "is a glance, not a database — and underneath is the way to all of them."
  },
  {
    at: {view:"capture", tab:"gaps"}, sel: "#paneGaps", need: ".inspector",
    title: "Questions: what is still missing",
    text: "Worked out from what you have captured rather than from a fixed checklist. " +
          "Tick one when the client confirms it and the area meters move with it."
  },
  {
    at: {view:"capture", tab:"note"}, sel: "#paneNote", need: ".inspector",
    title: "Note: park it and carry on",
    text: "For anything you have no time to classify. It keeps its place in the record " +
          "and you can sort it out afterwards."
  },

  /* ---- the map ---- */
  {
    at: {map:true}, sel: "#mapStage", wait: 1000,
    title: "The map: how it all connects",
    text: "One horizontal band per area. Every relation is an arrow, and hovering or " +
          "selecting one names it. Select a node and everything it is not wired to steps " +
          "back, so you can read the one thing you asked about."
  },
  {
    at: {map:true}, sel: "#mapSide", wait: 350,
    title: "Filter it down",
    text: "Tags, a search box and the areas legend. Keep items linked to the matches is " +
          "the one that earns its keep: filter by a tag and you also get, dimmed, " +
          "everything that hangs off it."
  },

  /* ---- review ---- */
  {
    at: {view:"review", rvTab:"overview"}, sel: "#rvTabs", wait: 250,
    title: "Review: five ways to look at it",
    text: "Overview, Session Record, Inventory, Coverage and Evidence. The session's " +
          "vital signs sit above the tabs and stay put whichever one you are on."
  },
  {
    at: {view:"review", rvTab:"overview"}, sel: "#rvPanelOverview",
    title: "Overview: what is still open",
    text: "The questions again, grouped by area, and the inputs, outputs and exceptions " +
          "count. A five-minute pass here turns a vague sense of having covered most of " +
          "it into a list you can send."
  },
  {
    at: {view:"review", rvTab:"record"}, sel: "#rvPanelRecord",
    title: "Session Record: when, and in what order",
    text: "Every entry in the session — captures, notes, marks and replies — with a " +
          "search, a type filter and an order. Twenty-five at a time, so five hundred " +
          "entries open as fast as fifty. Drag a row by its handle to move it; the " +
          "capture times never change with it."
  },
  {
    at: {view:"review", rvTab:"inventory"}, sel: "#rvPanelInventory",
    title: "Inventory: what did we find",
    text: "The same entries grouped by area instead of by the clock, which is the shape " +
          "the document gets written in. Two different questions, two tabs."
  },
  {
    at: {view:"review", rvTab:"coverage"}, sel: "#rvPanelCoverage",
    title: "Coverage: how much of the document is there",
    text: "Measured per section of the PDD against the fields it actually fills, not " +
          "against how many things you captured near it. A section reading not landing " +
          "has items that are not reaching any field — usually a missing tag."
  },
  {
    at: {view:"review", rvTab:"evidence"}, sel: "#rvPanelEvidence",
    title: "Evidence: what you hand over",
    text: "The screenshot folder, and anything parked without being classified. " +
          "Screenshots live in a folder beside the session file rather than inside it, " +
          "and this panel says whether they are all there."
  },

  /* ---- the document ---- */
  {
    at: {view:"pdd"}, sel: "#pddDoc", wait: 250,
    title: "The draft writes itself",
    text: "Your capture, arranged into the approved PDD structure, section by section. " +
          "Nothing is invented: a field with no evidence behind it says so."
  },
  {
    at: {view:"pdd"}, sel: "#pddMeta",
    title: "TBC is a question, not a gap",
    text: "The header counts what is filled and what is still waiting on a person. Click " +
          "any TBC in a dashed outline and type into it — those are the things the " +
          "console has no way to capture, like a contact or an access date."
  },
  {
    at: {view:"pdd"}, sel: "#printPddBtn",
    title: "Taking it out",
    text: "Print or save as PDF, copy as Markdown, or download the .md. The session " +
          "itself goes out as JSON from Review, and comes back in the same way."
  },

  {
    title: "That is the tour",
    text: "Guide, at the foot of the view bar, brings it back whenever you want it.\n\n" +
          "Nothing you have just seen changed the session. Start typing."
  }
];

let tourList = [];
let tourAt = -1;
let tourHome = null;

function tourVisible(sel){
  const el = document.querySelector(sel);
  if(!el) return null;
  const r = el.getBoundingClientRect();
  return (r.width > 0 && r.height > 0) ? el : null;
}

/* A step that stays on the capture screen has to have its control on screen
   right now: a folded panel or a narrow layout drops it, so the count and the
   buttons always match what is actually shown. A step that takes the app
   somewhere else only has to have its control in the page at all, because it
   is hidden until the tour goes there. */
function tourUsable(step){
  if(!step.sel) return true;
  if(!document.querySelector(step.sel)) return false;
  /* Hidden because the tour has not gone there yet, or hidden because this
     layout has no room for it? Only the second should drop the step. A pane
     behind an unselected tab is the first, so those say what to look at
     instead -- the panel that holds them. */
  const elsewhere = step.at && (step.at.map || step.at.rvTab ||
                                step.at.tab || step.at.view !== "capture");
  const gate = step.need || (elsewhere ? null : step.sel);
  return gate ? !!tourVisible(gate) : true;
}

function mapIsOpen(){ return $("mapScrim").classList.contains("on"); }

/* Put the app where the step needs it. Where the analyst was is put back when
   the tour ends, however it ends. */
function tourGoTo(at){
  if(!at){
    if(mapIsOpen()) closeMap();
    return;
  }
  if(at.map){
    if(!mapIsOpen()) openMap();
    return;
  }
  if(mapIsOpen()) closeMap();
  if(currentView !== at.view) setView(at.view);
  if(at.tab) setTab(at.tab);
  if(at.rvTab) setReviewTab(at.rvTab);
}

function startTour(){
  tourList = TOUR.filter(tourUsable);
  if(!tourList.length) return;
  tourHome = {
    view: currentView,
    tab: (S.ui && S.ui.tab) || "tape",
    rvTab: rvTab,
    map: mapIsOpen()
  };
  tourAt = 0;
  $("tourScrim").hidden = false;
  paintTour();
  $("tourNext").focus();
}

function endTour(){
  $("tourScrim").hidden = true;
  $("tourHole").hidden = true;
  tourAt = -1;
  /* Back where the analyst was, not where the tour happened to finish. */
  if(tourHome){
    const home = tourHome;
    tourHome = null;
    if(mapIsOpen() && !home.map) closeMap();
    if(currentView !== home.view) setView(home.view);
    setTab(home.tab);
    setReviewTab(home.rvTab);
    if(home.map && !mapIsOpen()) openMap();
  }
  /* Seen is seen, whether it was read to the end or skipped on the first
     step. Showing it again unasked is how a tour becomes an obstacle. */
  S.ui = S.ui || {};
  S.ui.tourSeen = true;
  save();
}

function paintTour(){
  const step = tourList[tourAt];
  if(!step){ endTour(); return; }
  const last = tourAt === tourList.length - 1;

  tourGoTo(step.at);

  $("tourStep").textContent = "step " + (tourAt + 1) + " of " + tourList.length;
  $("tourTitle").textContent = step.title;
  $("tourText").textContent = step.text;
  $("tourBack").hidden = tourAt === 0;
  $("tourNext").textContent = last ? "Done" : "Next";
  $("tourSkip").hidden = last;

  /* Opening the map rebuilds and eases into place, and switching a view
     repaints it. Measure after that has settled, or the card is placed against
     a rectangle that has already moved. */
  /* Opening the map waits a second before measuring. Press Next inside that
     second and the old step's timer still fires, placing the card against the
     control the tour has already left. Each settle belongs to one step. */
  const mine = tourAt;
  const settle = () => {
    if(tourAt !== mine) return;
    const el = step.sel ? tourVisible(step.sel) : null;
    if(el) el.scrollIntoView({block:"nearest", inline:"nearest"});
    /* Opening the map focuses its search box and the Note tab focuses its
       textarea, both of which take the keyboard off the tour. Take it back,
       or Enter stops advancing halfway through. */
    $("tourNext").focus();
    requestAnimationFrame(() => { if(tourAt === mine) placeTour(el); });
  };
  /* Place it now with whatever is already laid out, and again once the map
     has finished easing. Waiting only for the second leaves the card sitting
     where the previous step put it for up to a second, which reads as the
     tour pointing at the wrong thing. */
  requestAnimationFrame(settle);
  if(step.wait) setTimeout(settle, step.wait);
}

function placeTour(el){
  const box = $("tourBox"), hole = $("tourHole");
  if(!el){
    hole.hidden = true;
    $("tourScrim").classList.add("dim");
    box.classList.add("mid");
    box.style.left = "";
    box.style.top = "";
    return;
  }
  $("tourScrim").classList.remove("dim");
  box.classList.remove("mid");
  hole.hidden = false;

  const r = el.getBoundingClientRect();
  /* The ring is drawn a few pixels outside the control, which puts half of it
     off the screen for anything sitting flush against an edge -- the view bar
     runs down the very left. Keep the ring inside the window instead. */
  const pad = 6, inset = 2;
  const l = Math.max(inset, r.left - pad);
  const t = Math.max(inset, r.top - pad);
  const rt = Math.min(window.innerWidth - inset, r.right + pad);
  const bt = Math.min(window.innerHeight - inset, r.bottom + pad);
  hole.style.left = l + "px";
  hole.style.top = t + "px";
  hole.style.width = Math.max(0, rt - l) + "px";
  hole.style.height = Math.max(0, bt - t) + "px";

  const bw = box.offsetWidth, bh = box.offsetHeight, gap = 14, edge = 12;
  /* Below the control if it fits, above if it does not, and never off the
     screen: a tour that points at something you cannot see is worse than none. */
  let top = bt + gap;
  if(top + bh > window.innerHeight - edge) top = t - gap - bh;
  top = Math.max(edge, Math.min(window.innerHeight - bh - edge, top));

  let left = r.left + r.width / 2 - bw / 2;
  /* Panels and panes fill most of the screen, so neither above nor below is
     clear of them. Put the card beside the control instead of on top of the
     thing it is talking about. */
  if(top < bt && top + bh > t){
    const rightRoom = window.innerWidth - rt - edge;
    const leftRoom = l - edge;
    if(rightRoom >= bw + gap) left = rt + gap;
    else if(leftRoom >= bw + gap) left = l - gap - bw;
  }
  left = Math.max(edge, Math.min(window.innerWidth - bw - edge, left));

  box.style.left = left + "px";
  box.style.top = top + "px";
}

function tourGo(by){
  const next = tourAt + by;
  if(next < 0) return;
  if(next >= tourList.length){ endTour(); return; }
  tourAt = next;
  paintTour();
}

$("tourNext").addEventListener("click", () => tourGo(1));
$("tourBack").addEventListener("click", () => tourGo(-1));
$("tourSkip").addEventListener("click", endTour);
$("tourBtn").addEventListener("click", startTour);

document.addEventListener("keydown", e => {
  if($("tourScrim").hidden) return;
  if(e.key === "Escape"){ e.preventDefault(); endTour(); return; }
  if(e.key === "ArrowRight"){ e.preventDefault(); tourGo(1); return; }
  if(e.key === "ArrowLeft"){ e.preventDefault(); tourGo(-1); }
});

window.addEventListener("resize", () => {
  if($("tourScrim").hidden) return;
  const step = tourList[tourAt];
  placeTour(step && step.sel ? tourVisible(step.sel) : null);
});

/* Only on a console that has nothing in it yet: somebody halfway through a
   session does not need to be told where the capture field is, and somebody
   opening a colleague's session wants to read it, not be introduced to it. */
function maybeStartTour(){
  /* The check waits with the tour rather than running before it. Somebody who
     has started typing in the four hundred milliseconds since the page opened
     is already working, and a modal card over the top of that is an
     interruption, not an introduction. */
  setTimeout(() => {
    if(S.ui && S.ui.tourSeen) return;
    if(!sessionIsEmpty()) return;
    if($("captureInput").value.trim()) return;
    startTour();
  }, 400);
}
