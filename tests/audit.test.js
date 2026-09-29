/*
 * Functional audit of the built bundle.
 *
 *   NODE_PATH=<where jsdom lives> node tests/audit.test.js
 *
 * Drives the real DOM: every check goes through the same listeners a person
 * would trigger. Exits non-zero on any failure or uncaught page error.
 */

const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.dirname(__dirname);
const BUNDLE = path.join(ROOT, "dist", "process-discovery-console.html");
const DEMO = path.join(ROOT, "assets", "data", "demo-session-ach-returns.json");
const STRESS = path.join(ROOT, "assets", "data", "stress-session-wire-callbacks.json");
const html = fs.readFileSync(BUNDLE, "utf8");
const demoJson = fs.readFileSync(DEMO, "utf8");
const stressJson = fs.readFileSync(STRESS, "utf8");

let pass = 0, fail = 0;
const failures = [];
function group(name){ console.log("\n" + name); }
function ok(name, cond, detail){
  if(cond){ pass++; console.log("  pass  " + name); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log("  FAIL  " + name + (detail ? "  <- " + detail : "")); }
}
function eq(name, actual, expected){
  ok(name, String(actual) === String(expected), "got " + JSON.stringify(actual) + ", expected " + JSON.stringify(expected));
}

function boot(opts){
  opts = opts || {};
  const errs = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "https://audit.test/",
    beforeParse(win){
      win.requestAnimationFrame = () => 0;
      win.cancelAnimationFrame = () => {};
      win.print = () => { win.__printed = true; };
      win.__saved = [];
      win.claude = { use: async n => n === "downloads"
        ? { save: async r => { win.__saved.push(r); return {status:"saved"}; } } : null };
      win.navigator.clipboard = { writeText: t => { win.__clip = t; return Promise.resolve(); } };
      if(opts.storage) win.localStorage.setItem("process.discovery.console.v1", opts.storage);
      if(opts.legacyStorage) win.localStorage.setItem("tqa.discovery.console.v1", opts.legacyStorage);
    }
  });
  dom.window.addEventListener("error", e => errs.push(e.message));
  bridge(dom.window);
  return { w: dom.window, d: dom.window.document, errs };
}

/* The bundle is a classic script, so its top-level `let S` and `const M` go
   into the global lexical environment and never become properties of window.
   `w.S` and `w.M` from out here are plain undefined -- which is silent, so
   every assertion reading through them was comparing against nothing.
   Function declarations do land on window, which is why those always worked.
   An indirect eval runs in global scope and can see the lexical bindings, so
   route the few the suite reaches for through one. */
const BRIDGED = ["S", "M", "recShown"];
function bridge(win){
  BRIDGED.forEach(name => {
    if(typeof win[name] !== "undefined") return;
    try{
      win.eval(name);                       /* throws if the binding is absent */
      Object.defineProperty(win, name, {
        configurable: true,
        get: () => win.eval(name),
        set: v => win.eval("(function(v){ " + name + " = v; })")(v)
      });
    }catch(e){ /* not in this build; leave it undefined */ }
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms || 60));

function api(ctx){
  const { w, d } = ctx;
  return {
    key: (k, mod) => d.dispatchEvent(new w.KeyboardEvent("keydown", { key:k, bubbles:true, metaKey:!!mod })),
    typeIn(value, mod){
      const i = d.getElementById("captureInput");
      i.value = value;
      i.dispatchEvent(new w.KeyboardEvent("keydown", { key:"Enter", bubbles:true, metaKey:!!mod }));
    },
    pickType(label){
      const b = [...d.querySelectorAll(".type")].find(x => x.querySelector("b").textContent === label);
      if(b) b.click();
      return !!b;
    },
    capture(areaNo, typeLabel, name){
      d.getElementById("captureInput").blur();
      this.key(String(areaNo));
      if(typeLabel) this.pickType(typeLabel);
      this.typeIn(name);
      d.getElementById("captureInput").blur();
    },
    clickNode(i){
      const n = d.querySelectorAll("#mapNodes .node")[i || 0];
      n.dispatchEvent(new w.MouseEvent("pointerdown", { bubbles:true }));
      d.getElementById("mapSvg").dispatchEvent(new w.MouseEvent("pointerup", { bubbles:true }));
    },
    dropFile(text, filename, type){
      const file = new w.File([text], filename, { type: type || "application/json" });
      const ev = new w.Event("drop", { bubbles:true });
      ev.dataTransfer = { files:[file] };
      ev.preventDefault = () => {};
      d.getElementById("importDrop").dispatchEvent(ev);
    },
    view(name){ d.querySelector('.ico[data-view="' + name + '"]').click(); },
    tab(name){ d.querySelector('.tab[data-tab="' + name + '"]').click(); },
    text(id){ return d.getElementById(id).textContent.trim(); }
  };
}

async function run(){
  /* ---------------------------------------------------------------- boot */
  let ctx = boot(); let a = api(ctx); let { w, d } = ctx;
  await wait(120);

  group("Boot and shell");
  eq("nine discovery areas render", d.querySelectorAll(".channel").length, 9);
  eq("four views in the icon bar", d.querySelectorAll(".ico[data-view]").length, 4);
  ok("capture view is active", d.querySelector(".ico.on span").textContent === "Capture");
  ok("capture field holds focus on boot", d.activeElement === d.getElementById("captureInput"));
  eq("both side panels open", d.getElementById("shell").getAttribute("data-nav") + "/" +
     d.getElementById("shell").getAttribute("data-insp"), "on/on");
  eq("tape tab selected", d.querySelector(".pane.on").id, "paneTape");
  eq("clock starts at zero", a.text("clock"), "00:00:00");

  /* ------------------------------------------------------------ keyboard */
  group("Keyboard navigation");
  d.getElementById("captureInput").blur();
  a.key("3");
  eq("digit switches area", a.text("stageLabel"), "process");
  ok("digit does not steal focus", d.activeElement !== d.getElementById("captureInput"));
  a.key("4"); a.key("7");
  eq("digits chain without typing", a.text("stageLabel"), "exceptions");
  eq("capture field stayed empty", d.getElementById("captureInput").value, "");
  a.key("Enter");
  ok("Enter focuses the capture field", d.activeElement === d.getElementById("captureInput"));
  d.getElementById("captureInput").dispatchEvent(new w.KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
  ok("Escape leaves the capture field", d.activeElement !== d.getElementById("captureInput"));
  a.key("[");
  eq("[ collapses the areas panel", d.getElementById("shell").getAttribute("data-nav"), "off");
  a.key("]");
  eq("] collapses the inspector", d.getElementById("shell").getAttribute("data-insp"), "off");
  a.key("["); a.key("]");
  eq("panels reopen", d.getElementById("shell").getAttribute("data-nav") + "/" +
     d.getElementById("shell").getAttribute("data-insp"), "on/on");

  /* -------------------------------------------------------------- capture */
  group("Capture");
  a.capture(1, "Web UI", "Certitude 70");
  eq("item captured", a.text("cItems"), "1");
  eq("seeded type became a tag", d.querySelector("#items .chip").textContent, "#Web UI");
  a.capture(1, null, "Host emulator");
  eq("capture works without a type", a.text("cItems"), "2");
  d.getElementById("captureInput").value = "";
  a.typeIn("");
  eq("empty capture is rejected", a.text("cItems"), "2");

  const inp = d.getElementById("captureInput");
  inp.value = "excep";
  inp.dispatchEvent(new w.Event("input", { bubbles:true }));
  ok("type-ahead offers matches", d.querySelectorAll("#suggest div").length > 0,
     "suggestions: " + d.querySelectorAll("#suggest div").length);
  ok("type-ahead reaches other areas",
     [...d.querySelectorAll("#suggest .sg-sec")].some(s => s.textContent !== "systems"));
  inp.value = "";
  inp.dispatchEvent(new w.Event("input", { bubbles:true }));

  /* ---------------------------------------------------------------- tape */
  group("Tape, notes and marks");
  a.tab("note");
  d.getElementById("noteBox").value = "Check the second approver";
  d.getElementById("saveNoteBtn").click();
  eq("note saved", a.text("cNotes"), "1");
  d.getElementById("markBtn").click();
  eq("moment marked", a.text("cMarks"), "1");
  a.tab("tape");
  eq("tape shows every kind", d.querySelectorAll("#tape .tape-row").length, 4);
  const kinds = [...d.querySelectorAll("#tape .tape-row .k")].map(k => k.textContent.trim());
  eq("newest entry first", kinds[0], "Mark");
  ok("each row is colour coded", [...d.querySelectorAll("#tape .tape-row")]
     .every(r => r.style.getPropertyValue("--kind")));
  ok("marks use a ring, not a filled dot", !!d.querySelector("#tape .kdot.ring"));

  const noteChip = [...d.querySelectorAll("#tapeFilter .tagf")].find(b => b.textContent.includes("Note"));
  noteChip.click();
  eq("kind filter narrows the tape", d.querySelectorAll("#tape .tape-row").length, 1);
  eq("filtered row is the note", d.querySelector("#tape .tape-row .k").textContent.trim(), "Note");
  [...d.querySelectorAll("#tapeFilter .tagf")].find(b => b.textContent.trim() === "all").click();
  eq("filter cleared", d.querySelectorAll("#tape .tape-row").length, 4);

  /* -------------------------------------------------------------- threads */
  group("Reply threads");
  const target = [...d.querySelectorAll("#tape .tape-row")].find(r => r.textContent.includes("Certitude 70"));
  target.querySelector(".reply-btn").click();
  const ta = d.querySelector("#tape .reply-input");
  ok("composer opens on the right row", !!ta);
  ta.value = "Version 70.2, hosted internally";
  ta.dispatchEvent(new w.KeyboardEvent("keydown", { key:"Enter", bubbles:true }));
  eq("reply stored on the tape", d.querySelectorAll("#tape .reply").length, 1);
  ok("same thread shows in the item list", d.querySelectorAll("#items .reply").length === 1,
     "item replies: " + d.querySelectorAll("#items .reply").length);
  ok("reply count on the button", d.querySelector("#items .reply-btn u").textContent === "1");

  /* ----------------------------------------------------------------- gaps */
  group("Gap engine");
  const openBefore = d.querySelectorAll("#gapList .gap-line").length;
  ok("questions appear once an area has items", openBefore > 0, "open: " + openBefore);
  a.tab("gaps");
  const meterBefore = d.querySelector(".channel.active .meter i").style.width;
  d.querySelector("#gapList .gap-line input").click();
  const meterAfter = d.querySelector('.channel .meter i').style.width;
  ok("resolving a question moves the meter", meterBefore !== meterAfter,
     meterBefore + " -> " + meterAfter);
  ok("open count shown on the tab", a.text("gapCount").length > 0);

  /* ------------------------------------------------------- detail + rels */
  group("Detail sheet and many-to-many relations");
  a.key("2"); a.pickType("Input");
  a.typeIn("Daily trigger workbook");
  d.getElementById("captureInput").blur();
  d.querySelector("#items [data-edit]").click();
  ok("sheet opens", d.getElementById("scrim").classList.contains("on"));
  d.getElementById("fCustomTag").value = "programx";
  d.getElementById("fAddTag").click();
  ok("custom tag added", [...d.querySelectorAll("#fTags button.on")].some(b => b.textContent === "programx"));
  d.getElementById("fRelType").value = "reads from";
  const targetOpt = [...d.getElementById("fRelTarget").options].find(o => o.textContent.includes("Certitude 70"));
  d.getElementById("fRelTarget").value = targetOpt.value;
  d.getElementById("fRelTarget").dispatchEvent(new w.Event("change", { bubbles:true }));
  eq("relation staged", d.querySelectorAll("#fRelList .rel").length, 1);
  d.getElementById("fSave").click();
  ok("sheet closes on save", !d.getElementById("scrim").classList.contains("on"));
  ok("outgoing relation rendered", d.querySelector("#items .rel").textContent.includes("reads from"));
  a.key("1");
  ok("incoming relation rendered on the other item",
     [...d.querySelectorAll("#items .rel")].some(r => r.textContent.includes("this")));

  /* ------------------------------------------------------------- tag filter */
  group("Tag filtering on the stage");
  const tagChip = d.querySelector("#tagBar .tagf");
  ok("tag chips listed for the area", !!tagChip, "no chips");
  tagChip.click();
  ok("filter narrows the list", d.querySelectorAll("#items .item").length <= 2);
  ok("count shows the ratio", a.text("listCount").includes("of"));
  [...d.querySelectorAll("#tagBar .tagf")].find(b => b.textContent.trim() === "clear").click();
  ok("filter cleared", !a.text("listCount").includes("of"));

  /* ------------------------------------------------------------------ map */
  group("Relationship map");
  a.view("map");
  ok("map opens", d.getElementById("mapScrim").classList.contains("on"));
  eq("map icon marked active", d.querySelector(".ico.on span").textContent, "Map");
  eq("every item is a node", d.querySelectorAll("#mapNodes .node").length, 3);
  eq("the relation is an edge", d.querySelectorAll("#mapEdges .edge").length, 1);
  eq("nine areas in the legend", d.querySelectorAll("#mapLegend button").length, 9);

  const mapTag = [...d.querySelectorAll("#mapTags .tagf")].find(b => b.textContent.includes("programx"));
  mapTag.click();
  ok("tag filter keeps linked items visible", d.querySelectorAll("#mapNodes .node").length === 2,
     "nodes: " + d.querySelectorAll("#mapNodes .node").length);
  eq("linked item is ghosted", d.querySelectorAll("#mapNodes .node.ghost").length, 1);
  d.getElementById("mapLinked").checked = false;
  d.getElementById("mapLinked").dispatchEvent(new w.Event("change", { bubbles:true }));
  eq("turning linked off isolates the match", d.querySelectorAll("#mapNodes .node").length, 1);
  d.getElementById("mapLinked").checked = true;
  d.getElementById("mapLinked").dispatchEvent(new w.Event("change", { bubbles:true }));
  d.getElementById("mapClear").click();
  eq("clear restores every node", d.querySelectorAll("#mapNodes .node").length, 3);

  a.clickNode(0);
  ok("selecting a node opens the detail panel", d.getElementById("mapBody").classList.contains("detail"));

  /* Reading happens in the panel, changing happens in the sheet. The panel
     used to carry a relation builder of its own, which meant two places to
     learn and two places to keep right. */
  ok("the panel carries no relation builder",
     !d.getElementById("dType") && !d.getElementById("dPicker") &&
     !d.getElementById("dLink") && !d.getElementById("dFind"));
  ok("it offers Edit instead", !!d.getElementById("dEdit"));
  d.getElementById("dEdit").click();
  await wait(60);
  ok("which opens the sheet on that item",
     d.getElementById("scrim").classList.contains("on"));
  ok("and the sheet is the thing that manages relations",
     !!d.getElementById("fRelType") && !!d.getElementById("fRelList"));

  /* Edit opens over the map, so one Escape closes the sheet and leaves the
     map where it was. Every one of these listeners is on the same document. */
  d.dispatchEvent(new w.KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
  ok("Escape closes the sheet", !d.getElementById("scrim").classList.contains("on"));
  ok("and leaves the map open", d.getElementById("mapScrim").classList.contains("on"));

  d.querySelector("#mapLegend button").click();
  ok("legend hides an area", d.querySelectorAll("#mapNodes .node").length < 3);
  d.querySelector("#mapLegend button").click();
  d.getElementById("mapClose").click();
  ok("map closes and the view icon returns", !d.getElementById("mapScrim").classList.contains("on") &&
     d.querySelector(".ico.on span").textContent === "Capture");

  /* --------------------------------------------------------------- review */
  group("Review");
  a.view("review");
  ok("review renders", d.getElementById("reviewView").classList.contains("on"));
  eq("four headline stats", d.querySelectorAll("#rvStats .rv-stat").length, 4);
  eq("item count matches", d.querySelector("#rvStats b").textContent, a.text("cItems"));
  eq("eleven PDD coverage rows", d.querySelectorAll("#rvCoverage .cov").length, 11);
  ok("coverage reports filled-over-total, not item count",
     [...d.querySelectorAll("#rvCoverage .st")].every(x => /\d+\/\d+$/.test(x.textContent.trim())),
     [...d.querySelectorAll("#rvCoverage .st")].map(x => x.textContent).join(" | "));
  eq("three IOE counters", d.querySelectorAll("#rvIoe div").length, 3);
  ok("inventory groups by area", d.querySelectorAll("#rvInventory .inv-group").length >= 2);
  ok("threads shown read-only in review", d.querySelectorAll("#rvInventory .reply").length >= 1);
  d.getElementById("copyMdBtn").click();
  await wait(60);
  ok("session markdown copied", (w.__clip || "").includes("## Systems"));
  ok("markdown carries follow-ups", (w.__clip || "").includes("Version 70.2"));

  /* ------------------------------------------------------------------ pdd */
  group("PDD draft");
  a.view("pdd");
  const secs = [...d.querySelectorAll("#pddDoc .pdd-sec h3")].map(h => h.textContent.split(" ")[0]);
  eq("fifteen numbered sections", secs.length, 15);
  ok("runs 1.1 through 2.10 in order", secs[0] === "1.1" && secs[secs.length-1] === "2.10",
     secs.join(","));
  eq("two part headings", d.querySelectorAll("#pddDoc .pdd-h1").length, 2);
  ok("unanswered fields marked TBC", d.querySelectorAll("#pddDoc .tbc").length > 10);
  ok("sign off left blank, not TBC",
     !d.querySelectorAll("#pddDoc .pdd-sec")[14].querySelector(".tbc"));
  const apps = [...d.querySelectorAll("#pddDoc .pdd-table")].find(t => t.textContent.includes("Certitude 70"));
  ok("systems reach the applications table", !!apps);
  ok("a reply became the URL/Details cell", apps.textContent.includes("Version 70.2"));
  d.getElementById("copyPddBtn").click();
  await wait(60);
  ok("pdd markdown copied", (w.__clip || "").includes("## 2.6 Process Exceptions"));
  ok("markdown tables rendered", (w.__clip || "").includes("| App/System |"));
  ok("by-hand cells named in the markdown", (w.__clip || "").includes("TBC (by hand)"));
  const rows = (w.__clip || "").split("\n").filter(l => l.startsWith("| ") && !l.startsWith("|---"));
  ok("every markdown table row keeps its column count",
     rows.every(r => r.split(" | ").length >= 4 || r.split(" | ").length >= 2));
  d.getElementById("printPddBtn").click();
  await wait(120);
  ok("print invoked", w.__printed === true);

  /* ------------------------------------------------------------- transfer */
  group("Transfer");
  d.getElementById("dlMdBtn").click();
  await wait(80);
  ok("markdown saved through the downloads capability", w.__saved.length === 1);
  ok("filename slugged from the session", /\.md$/.test(w.__saved[0].filename), w.__saved[0].filename);

  d.getElementById("importBtn").click();
  a.dropFile("not json at all", "notes.txt", "text/plain");
  await wait(80);
  eq("non-json rejected", a.text("importMsg"), "That is not a .json file.");
  a.dropFile("{broken", "broken.json");
  await wait(80);
  ok("malformed json explained", a.text("importMsg").startsWith("That is not valid JSON"));
  a.dropFile(demoJson, "demo.json");
  await wait(120);
  ok("file summary shown before importing", a.text("importSummary").includes("53 items"));

  const beforeMerge = Number(a.text("cItems"));
  d.getElementById("importMerge").click();
  await wait(60);
  eq("merge adds to the session", a.text("cItems"), String(beforeMerge + 53));
  const ids = new Set();
  let dupes = 0;
  d.querySelectorAll("#items .item").length;
  d.getElementById("importBtn2") && null;
  a.view("review");
  d.getElementById("dlJsonBtn").click();
  await wait(80);
  const saved = JSON.parse(w.__saved[w.__saved.length-1].data);
  saved.items.forEach(i => { if(ids.has(i.id)) dupes++; ids.add(i.id); });
  eq("merge produced no duplicate ids", dupes, 0);
  ok("merged relations still resolve",
     saved.items.every(i => i.relations.every(r => ids.has(r.targetId))));

  d.getElementById("importBtn2").click();
  a.dropFile(demoJson, "demo.json");
  await wait(120);
  const beforeReplace = a.text("cItems");
  d.getElementById("importReplace").click();
  await wait(60);
  eq("replace arms rather than firing", a.text("cItems"), beforeReplace);
  eq("replace button relabels", d.getElementById("importReplace").textContent, "Confirm replace");
  await wait(450);
  d.getElementById("importReplace").click();
  await wait(60);
  eq("replace swaps the session", a.text("cItems"), "53");
  eq("session name taken from the file", d.getElementById("sessionName").value,
     "Meridian CU — ACH return exception handling");
  eq("returns to capture after import", d.querySelector(".ico.on span").textContent, "Capture");

  group("Demo session integrity");
  eq("all nine areas populated", [...d.querySelectorAll(".channel-count")].filter(c => c.textContent !== "0").length, 9);
  a.view("map");
  ok("21 relations drawn", d.getElementById("mapCount").textContent.includes("21 relations"),
     d.getElementById("mapCount").textContent);
  d.getElementById("mapClose").click();
  a.view("pdd");
  ok("pdd fills from the demo", a.text("pddMeta").startsWith("93 of 94"), a.text("pddMeta"));
  eq("by-hand fields counted separately",
     d.querySelector("#pddMeta .byhand-count").textContent, "34");
  eq("and marked in the document", d.querySelectorAll("#pddDoc .tbc.byhand").length, 34);
  ok("only one cell is a real open question",
     d.querySelectorAll("#pddDoc .tbc").length - d.querySelectorAll("#pddDoc .tbc.byhand").length === 1,
     String(d.querySelectorAll("#pddDoc .tbc").length));
  const excTable = [...d.querySelectorAll("#pddDoc .pdd-table")].find(t => t.textContent.includes("token expired"));
  eq("six exceptions in the table", excTable.querySelectorAll("tbody tr").length, 6);
  ok("business actions filled from replies",
     excTable.textContent.includes("End process and report exception."));

  /* ---------------------------------------------------------- persistence */
  group("Persistence");
  const stored = w.localStorage.getItem("process.discovery.console.v1");
  ok("session written to localStorage", !!stored && JSON.parse(stored).items.length === 53);
  ok("no page errors in this run", ctx.errs.length === 0, ctx.errs.join(" | "));

  const ctx2 = boot({ storage: stored });
  const a2 = api(ctx2);
  await wait(150);
  eq("session restored on reload", ctx2.d.getElementById("cItems").textContent, "53");
  eq("area restored", ctx2.d.getElementById("sessionName").value, "Meridian CU — ACH return exception handling");
  ok("resolved questions restored", ctx2.d.querySelector(".channel .meter i").style.width !== "0%");
  ok("no page errors on restore", ctx2.errs.length === 0, ctx2.errs.join(" | "));

  group("Legacy session migration");
  const legacy = JSON.stringify({
    name:"Old format", active:"Systems", resolved:[], notes:[{text:"no id here", at:"09:00"}],
    marks:[{at:"09:05", seconds:5}],
    items:[{section:"Systems", name:"Legacy system", tags:["Web UI"], at:"09:01"}]
  });
  const ctx3 = boot({ storage: legacy });
  await wait(150);
  eq("legacy items load", ctx3.d.getElementById("cItems").textContent, "1");
  eq("legacy tape renders", ctx3.d.querySelectorAll("#tape .tape-row").length, 3);
  ok("ids and reply arrays backfilled", !!ctx3.d.querySelector("#tape .reply-btn"));
  ok("no page errors on migration", ctx3.errs.length === 0, ctx3.errs.join(" | "));

  group("Capture vocabulary");
  /* The grid used to store the button's label, which the PDD never looked for:
     an "Average volume" capture left 1.3 Expected volumes rendering TBC. */
  const ctxV = boot(); const aV = api(ctxV); await wait(120);
  const dV = ctxV.d;
  aV.capture(4, "Average volume", "About 120 a day");
  eq("a type whose label differs stores the declared tag",
     dV.querySelector("#items .chip").textContent, "#Volume");
  aV.capture(3, "End condition", "All returns posted");
  eq("and again in another area", dV.querySelector("#items .chip").textContent, "#End");
  aV.capture(9, "SOP / document", "Existing returns SOP");
  eq("and in a third", dV.querySelector("#items .chip").textContent, "#SOP");
  aV.view("pdd");
  ok("the volume reaches 1.3 Expected volumes",
     dV.getElementById("pddDoc").textContent.includes("About 120 a day"));
  ok("the end state reaches 2.1",
     dV.getElementById("pddDoc").textContent.includes("All returns posted"));
  ok("the SOP reaches 2.2",
     dV.getElementById("pddDoc").textContent.includes("Existing returns SOP"));
  ok("no page errors capturing by type", ctxV.errs.length === 0, ctxV.errs.join(" | "));

  group("Two-step delete");
  const ctxD = boot({ storage: stored }); const aD = api(ctxD);
  await wait(150);
  const dD = ctxD.d, wD = ctxD.w;
  const before = Number(aD.text("cItems"));
  const del = dD.querySelector("#items [data-del]");
  del.click();
  eq("first press deletes nothing", aD.text("cItems"), String(before));
  eq("the button asks for confirmation", del.textContent, "Confirm delete");
  del.click();
  eq("a double-click cannot get through", aD.text("cItems"), String(before));
  await wait(450);
  del.click();
  eq("the second press deletes", aD.text("cItems"), String(before - 1));

  const del2 = dD.querySelector("#items [data-del]");
  del2.click();
  eq("armed again", del2.textContent, "Confirm delete");
  dD.dispatchEvent(new wD.KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
  eq("Escape calls it off", del2.textContent, "Delete");
  eq("and nothing was deleted", aD.text("cItems"), String(before - 1));
  ok("no page errors deleting", ctxD.errs.length === 0, ctxD.errs.join(" | "));

  group("Resizable panels");
  const ctxR = boot(); await wait(120);
  ["navResize","inspResize","mapSideResize","mapDetailResize"].forEach(id =>
    ok(id + " present", !!ctxR.d.getElementById(id)));
  eq("handles are separators", ctxR.d.getElementById("navResize").getAttribute("role"), "separator");
  ctxR.d.getElementById("navResize").dispatchEvent(
    new ctxR.w.KeyboardEvent("keydown", { key:"ArrowRight", bubbles:true }));
  ok("a keyboard nudge changes the width",
     Number(ctxR.d.getElementById("navResize").getAttribute("aria-valuenow")) > 238,
     ctxR.d.getElementById("navResize").getAttribute("aria-valuenow"));
  ok("no page errors resizing", ctxR.errs.length === 0, ctxR.errs.join(" | "));

  group("Map layout");
  /* The map defaults to lanes: one horizontal band per area, in rail order, with
     the order inside each band settled by barycentre sweeps. The properties that
     matter are that it is deterministic and that no two items in a band land on
     the same spot -- the free layout guarantees neither. */
  const ctxM = boot({ storage: stored }); const aM = api(ctxM); await wait(150);
  const dM = ctxM.d, wM = ctxM.w;
  aM.view("map");
  await wait(80);

  eq("lanes is the default", dM.getElementById("layoutLanes").className, "on");
  const populated = ["Systems","Data","Process","Operations","Rules","People",
                     "Exceptions","Dependencies","Evidence"]
    .filter(sec => wM.M.nodes.some(n => n.item.section === sec));
  eq("one band per populated area",
     dM.querySelectorAll("#mapLanes rect.lane").length, populated.length);
  eq("one label per band",
     dM.querySelectorAll("#mapLaneLabels span").length, populated.length);
  /* Rail order, with Operations moved to the bottom: it is volumes, timings
     and cutoffs rather than parts of the process, and sitting fourth it pushed
     the bands that are wired to each other apart. */
  const laneNames = [...dM.querySelectorAll("#mapLaneLabels span")]
    .map(x => x.firstChild.textContent);
  eq("bands follow the lane order",
     laneNames.join(","),
     wM.laneOrder().filter(s2 => populated.indexOf(s2) > -1)
                   .map(s2 => s2.toLowerCase()).join(","));
  eq("which is the rail order except that Operations is last",
     laneNames[laneNames.length - 1], "operations");
  eq("and every populated area still gets a band", laneNames.length, populated.length);

  ok("every node is assigned to its own area's band",
     wM.M.nodes.every(n => wM.M.lanes[n.lane].sec === n.item.section));
  ok("every node has a slot on the band",
     wM.M.nodes.every(n => typeof n.lx === "number" && isFinite(n.lx) &&
                           n.ly === wM.M.lanes[n.lane].mid));

  let shared = 0;
  wM.M.lanes.forEach((l, i) => {
    const xs = wM.M.nodes.filter(n => n.lane === i).map(n => Math.round(n.lx));
    if(new Set(xs).size !== xs.length) shared++;
  });
  eq("no two items in a band share a slot", shared, 0);

  const firstPass = wM.M.nodes.map(n => n.id + ":" + Math.round(n.lx)).join("|");
  dM.getElementById("mapClear").click();
  await wait(60);
  const secondPass = wM.M.nodes.map(n => n.id + ":" + Math.round(n.lx)).join("|");
  eq("the same session lays out the same way every time", secondPass, firstPass);

  /* The reason the dots can sit closer together than their names are wide: a
     name is measured rather than counted, wrapped onto at most two lines, and
     every other label in a band goes under its dot instead of over it. */
  ok("names wrap to no more than two lines",
     wM.M.nodes.every(n => n.lines.length >= 1 && n.lines.length <= 2));
  ok("every node renders one tspan per line",
     [...dM.querySelectorAll("#mapNodes .node")].every((g, i) =>
       g.querySelectorAll("text tspan").length === wM.M.nodes[i].lines.length));
  ok("labels alternate above and below inside a band",
     wM.M.lanes.every((l, i) => {
       const band = wM.M.nodes.filter(n => n.lane === i).sort((a, b) => a.lx - b.lx);
       return band.every((n, k) => !k || n.row !== band[k-1].row);
     }));

  const box = n => {
    const x0 = n.lx - n.lw/2, x1 = n.lx + n.lw/2;
    const y1 = n.row === 1 ? n.ly + n.r + 8 + n.lines.length * 12
                           : n.ly - (n.r + 3);
    const y0 = n.row === 1 ? n.ly + n.r + 8 : y1 - n.lines.length * 12;
    return [x0, y0, x1, y1];
  };
  let collided = 0;
  for(let i = 0; i < wM.M.nodes.length; i++){
    for(let j = i + 1; j < wM.M.nodes.length; j++){
      const a = box(wM.M.nodes[i]), b = box(wM.M.nodes[j]);
      if(a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) collided++;
    }
  }
  eq("no two labels overlap anywhere on the map", collided, 0);

  /* The dots spread into whatever width the stack height leaves unused, so the
     air is free: Fit to view was already being held back by the height. */
  const bandSpan = i => {
    const band = wM.M.nodes.filter(n => n.lane === i).map(n => n.lx);
    return band.length ? Math.max(...band) - Math.min(...band) : 0;
  };
  const widest = Math.max(...wM.M.lanes.map((l, i) => bandSpan(i)));
  const lastLane = wM.M.lanes[wM.M.lanes.length - 1];
  const stack = lastLane.top + lastLane.h;
  const byWidth = wM.M.W / (widest + 140), byHeight = wM.M.H / (stack + 140);
  ok("the spread claims the width the stack height leaves over",
     byWidth >= byHeight * 0.9,
     "width caps zoom at " + byWidth.toFixed(2) + ", height at " + byHeight.toFixed(2));

  let tightest = 1e9;
  wM.M.lanes.forEach((l, i) => {
    const xs = wM.M.nodes.filter(n => n.lane === i).map(n => n.lx).sort((a, b) => a - b);
    xs.forEach((x, k) => { if(k) tightest = Math.min(tightest, x - xs[k-1]); });
  });
  ok("no two dots in a band sit closer than the minimum gap",
     tightest >= 52, "tightest " + Math.round(tightest) + "px");

  ok("every edge carries an arrowhead",
     [...dM.querySelectorAll("#mapEdges line")].every(l =>
       l.getAttribute("marker-end") === "url(#arrowEdge)"));
  ok("edges stop short of the node they point at",
     wM.M.links.every(l => {
       const x2 = Number(l.el.getAttribute("x2")), y2 = Number(l.el.getAttribute("y2"));
       const d = Math.hypot(l.t.x - x2, l.t.y - y2);
       const full = Math.hypot(l.t.x - l.s.x, l.t.y - l.s.y);
       return full <= l.s.r + l.t.r + 13 || d > l.t.r;
     }));

  const relType = wM.M.links[0].type;
  const pivot = wM.M.links[0].s;
  aM.clickNode(wM.M.nodes.indexOf(pivot));
  await wait(60);
  ok("selecting a node turns its relations hot and names them",
     wM.M.links.filter(l => l.el.getAttribute("marker-end") === "url(#arrowHot)").length > 0 &&
     wM.M.links.some(l => l.lab.style.opacity === "1" && l.lab.textContent === relType),
     relType);

  /* A selection is a question about one node. The answer is that node and what
     it is wired to; everything else loses its light so the answer can be read
     without losing the shape of the graph behind it. */
  const lit = new Set([pivot.id]);
  wM.M.links.forEach(l => {
    if(l.s.id === pivot.id) lit.add(l.t.id);
    if(l.t.id === pivot.id) lit.add(l.s.id);
  });
  ok("the selected node and its neighbours keep their light",
     wM.M.nodes.filter(n => lit.has(n.id)).every(n => !n.el.classList.contains("faded")));
  ok("everything else is dimmed",
     wM.M.nodes.filter(n => !lit.has(n.id)).every(n => n.el.classList.contains("faded")));
  ok("dimmed, not removed -- the graph is still drawn",
     dM.querySelectorAll("#mapNodes .node").length === wM.M.nodes.length);
  ok("the edges that are not the answer are dimmed too",
     wM.M.links.every(l => l.el.classList.contains("faded") ===
       !(l.s.id === pivot.id || l.t.id === pivot.id)));

  /* Without this, holding a selection would make the rest of the map
     unreadable instead of merely quiet. */
  const far = wM.M.nodes.find(n => !lit.has(n.id));
  wM.hotEdges(far.id, true);
  ok("hovering something dimmed brings it back", far.el.classList.contains("peek"));
  wM.hotEdges(far.id, false);
  ok("and it drops away again when the pointer leaves",
     !far.el.classList.contains("peek"));

  /* Six relations converging on one node used to stack their type labels on
     the same few pixels. */
  const shown = wM.M.links.filter(l => l.lab.style.opacity === "1")
    .map(l => ({x:Number(l.lab.getAttribute("x")), y:Number(l.lab.getAttribute("y")),
                w:l.type.length * 4.9}));
  let stacked = 0;
  for(let i = 0; i < shown.length; i++)
    for(let j = i + 1; j < shown.length; j++){
      const a = shown[i], b2 = shown[j];
      if(Math.abs(a.x - b2.x) < (a.w + b2.w)/2 && Math.abs(a.y - b2.y) < 11) stacked++;
    }
  eq("no two relation labels are drawn on top of each other", stacked, 0);

  aM.clickNode(wM.M.nodes.indexOf(pivot));
  await wait(60);
  ok("clearing the selection lights the whole map again",
     wM.M.nodes.every(n => !n.el.classList.contains("faded")) &&
     wM.M.links.every(l => !l.el.classList.contains("faded")));

  /* Pointer behaviour. A press only becomes a drag once it has travelled, so a
     click that wobbles still selects; anything that travels moves the node and
     selects nothing. */
  const svgM = dM.getElementById("mapSvg");
  const nodeEls = [...dM.querySelectorAll("#mapNodes .node")];
  const press = (el, x, y, button) => el.dispatchEvent(new wM.MouseEvent("pointerdown",
    { bubbles:true, cancelable:true, clientX:x, clientY:y, button:button || 0 }));
  const moveTo = (x, y) => svgM.dispatchEvent(new wM.MouseEvent("pointermove",
    { bubbles:true, clientX:x, clientY:y }));
  const release = () => svgM.dispatchEvent(new wM.MouseEvent("pointerup", { bubbles:true }));

  ok("every dot carries a bigger invisible target",
     nodeEls.every((g, i) => Number(g.querySelector(".hit").getAttribute("r")) >
                             Number(g.querySelectorAll("circle")[1].getAttribute("r"))));

  press(svgM, 10, 10); release();
  eq("a click on bare canvas clears the selection", String(wM.M.sel), "null");

  press(nodeEls[1], 200, 200); moveTo(250, 232); release();
  eq("a press that travels moves the node and selects nothing", String(wM.M.sel), "null");

  press(nodeEls[1], 200, 200); moveTo(202, 201); release();
  eq("a press that only wobbles still selects", wM.M.sel, wM.M.nodes[1].id);

  const before2 = wM.M.sel;
  press(nodeEls[2], 300, 300, 2); release();
  eq("the right button does not drag or select", wM.M.sel, before2);
  ok("and starts nothing", !wM.M.drag && !wM.M.pan);

  const home = { x: wM.M.nodes[3].x, y: wM.M.nodes[3].y };
  press(nodeEls[3], 400, 400); moveTo(460, 430);
  ok("a drag in flight is registered", !!wM.M.drag && wM.M.drag.moved);
  dM.dispatchEvent(new wM.KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
  ok("Escape puts a dropped drag back", !wM.M.drag &&
     wM.M.nodes[3].x === home.x && wM.M.nodes[3].y === home.y,
     JSON.stringify([wM.M.nodes[3].x, home.x]));
  ok("and leaves the map open", dM.getElementById("mapScrim").classList.contains("on"));
  release();

  ok("no coordinate went infinite on an unmeasured stage",
     wM.M.nodes.every(n => isFinite(n.x) && isFinite(n.y)));

  dM.getElementById("layoutFree").click();
  await wait(60);
  eq("free clears the bands", dM.querySelectorAll("#mapLanes rect.lane").length, 0);
  eq("and the band labels", dM.querySelectorAll("#mapLaneLabels span").length, 0);
  eq("free is marked active", dM.getElementById("layoutFree").className, "on");
  eq("the layout choice is remembered",
     JSON.parse(wM.localStorage.getItem("process.discovery.console.v1")).ui.mapLayout, "free");

  dM.getElementById("layoutLanes").click();
  await wait(60);
  eq("and lanes come back", dM.querySelectorAll("#mapLanes rect.lane").length, populated.length);
  dM.getElementById("mapClose").click();
  ok("no page errors laying out the map", ctxM.errs.length === 0, ctxM.errs.join(" | "));

  group("An area this build does not declare");
  /* A session can name an area the model has never heard of -- renamed
     upstream, hand edited, written by a later version. It used to leave the
     node with no band, and the first read of that band's midpoint threw,
     taking the whole map down rather than the one item. */
  const strayStore = JSON.parse(stored);
  strayStore.items = strayStore.items.concat([{
    id:"stray1", section:"Sistemas", name:"An area from another build",
    tags:"Input", relations:[], replies:[], shots:[], at:"09:00", ts:99999
  }]);
  const ctxX = boot({ storage: JSON.stringify(strayStore) });
  const aX = api(ctxX); await wait(150);
  const dX = ctxX.d, wX = ctxX.w;

  eq("a tag list that arrived as a bare string becomes one tag",
     JSON.stringify(wX.S.items.find(i => i.id === "stray1").tags), '["Input"]');

  aX.view("map");
  await wait(120);
  eq("every item is drawn, including the one from the unknown area",
     dX.querySelectorAll("#mapNodes .node").length, wX.M.nodes.length);
  ok("the unknown area gets a band of its own",
     wX.M.lanes.some(l => l.sec === "Sistemas"), wX.M.lanes.map(l => l.sec));
  ok("it sits after the declared ones rather than among them",
     wX.M.lanes[wX.M.lanes.length - 1].sec === "Sistemas");
  ok("every node still resolves to a band",
     wX.M.nodes.every(n => wX.M.lanes[n.lane] && typeof n.ly === "number"));
  ok("and its dot gets a colour rather than `undefined`",
     [...dX.querySelectorAll("#mapNodes .node circle:not(.hit)")]
       .every(c => !!c.getAttribute("fill") && c.getAttribute("fill") !== "undefined"));
  ok("no page errors drawing it", ctxX.errs.length === 0, ctxX.errs.join(" | "));

  group("New session");
  const ctxN = boot(); const aN = api(ctxN); await wait(120);
  const dN = ctxN.d, wN = ctxN.w;
  ok("New session is disabled with nothing to lose", dN.getElementById("newBtn").disabled);
  aN.capture(1, "Web UI", "Certitude 70");
  aN.tab("note");
  dN.getElementById("noteBox").value = "Park this";
  dN.getElementById("saveNoteBtn").click();
  dN.getElementById("markBtn").click();
  aN.tab("tape");
  ok("and enabled once there is", !dN.getElementById("newBtn").disabled);
  dN.getElementById("themeBtn").click();

  dN.getElementById("newBtn").click();
  ok("the confirm dialog opens", dN.getElementById("newScrim").classList.contains("on"));
  const lost = aN.text("newSummary");
  ok("it names what will be lost", /1 item,.*1 note,.*1 mark,/.test(lost), lost);
  ok("it counts singulars as singulars", !lost.includes("1 items"), lost);

  dN.getElementById("newCancel").click();
  ok("cancel closes it", !dN.getElementById("newScrim").classList.contains("on"));
  eq("cancel keeps the session", aN.text("cItems"), "1");

  dN.getElementById("newBtn").click();
  dN.dispatchEvent(new wN.KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
  ok("Escape closes it too", !dN.getElementById("newScrim").classList.contains("on"));
  eq("and keeps the session", aN.text("cItems"), "1");

  dN.getElementById("newBtn").click();
  dN.getElementById("newExport").click();
  await wait(80);
  const backup = JSON.parse(wN.__saved[wN.__saved.length - 1].data);
  eq("the export offered in the dialog is the live session", backup.items.length, 1);
  ok("exporting does not close the dialog", dN.getElementById("newScrim").classList.contains("on"));

  dN.getElementById("newConfirm").click();
  await wait(80);
  eq("items cleared", aN.text("cItems"), "0");
  eq("notes cleared", aN.text("cNotes"), "0");
  eq("marks cleared", aN.text("cMarks"), "0");
  eq("name reset", dN.getElementById("sessionName").value, "Untitled walkthrough");
  eq("back on the capture view", dN.querySelector(".ico.on span").textContent, "Capture");
  eq("and the clock is running again from nothing",
     dN.getElementById("clock").dataset.state, "running");
  eq("area reset to the first", aN.text("stageLabel"), "systems");
  ok("the tape is empty", dN.querySelectorAll("#tape .tape-row").length === 0);
  ok("New session is disabled again", dN.getElementById("newBtn").disabled);
  eq("theme preference survives the reset",
     dN.documentElement.getAttribute("data-theme"), "light");
  const after = JSON.parse(wN.localStorage.getItem("process.discovery.console.v1"));
  ok("the cleared session is what got persisted",
     after.items.length === 0 && after.notes.length === 0 &&
     after.marks.length === 0 && after.resolved.length === 0 &&
     after.name === "Untitled walkthrough",
     JSON.stringify({i:after.items.length, n:after.notes.length, m:after.marks.length,
                     r:after.resolved.length, name:after.name}));
  ok("no page errors starting over", ctxN.errs.length === 0, ctxN.errs.join(" | "));

  group("Stress fixture");
  /* assets/data/stress-session-wire-callbacks.json is built to fail loudly if any
     of the PDD audit fixes regresses. Every assertion here names the finding it
     guards. */
  const ctxS = boot(); const aS = api(ctxS); await wait(120);
  const dS = ctxS.d, wS = ctxS.w;
  dS.getElementById("importBtn2").click();
  aS.dropFile(stressJson, "stress.json");
  await wait(120);
  ok("stress fixture summarised before import", aS.text("importSummary").includes("59 items"),
     aS.text("importSummary"));
  dS.getElementById("importReplace").click();
  await wait(450);
  dS.getElementById("importReplace").click();
  await wait(90);

  eq("all 59 items load", aS.text("cItems"), "59");
  eq("opening someone's session does not keep counting as if you were on it",
     dS.getElementById("clock").dataset.state, "paused");
  const stressSaved = () =>
    JSON.parse(wS.localStorage.getItem("process.discovery.console.v1"));
  eq("the file's project id comes across with it", stressSaved().id, "prj-w1r3ca");
  ok("the two screenshots it describes are kept as metadata",
     stressSaved().shots["shot-stress01"].w === 1400 &&
     stressSaved().shots["shot-stress02"].bytes === 243881);
  ok("each is filed under the project whose folder holds it",
     stressSaved().shots["shot-stress01"].prj === "prj-w1r3ca");
  ok("and a screenshot named but never described is reported, not passed over",
     aS.text("toast").includes("1 screenshot named but not described"), aS.text("toast"));
  ok("a reference to a screenshot the manifest never heard of is kept, not dropped",
     !!stressSaved().shots["shot-orphan99"] &&
     stressSaved().shots["shot-orphan99"].w === 0,
     JSON.stringify(stressSaved().shots["shot-orphan99"]));
  ok("the unknown-area row is reported, not swallowed",
     aS.text("toast").includes("1 moved to Systems from an unknown area"), aS.text("toast"));
  eq("all nine areas populated",
     [...dS.querySelectorAll(".channel-count")].filter(c => c.textContent !== "0").length, 9);

  aS.view("pdd");
  ok("PDD-05: the header scores cells", aS.text("pddMeta").startsWith("103 of 112"),
     aS.text("pddMeta"));
  eq("PDD-02: by-hand fields counted apart",
     dS.querySelector("#pddMeta .byhand-count").textContent, "39");
  eq("only nine cells are open questions",
     dS.querySelectorAll("#pddDoc .tbc").length - dS.querySelectorAll("#pddDoc .tbc.byhand").length, 9);

  const pdd = dS.getElementById("pddDoc").textContent;
  ok("PDD-01: Volume reaches 1.3 Expected volumes", pdd.includes("About 85 wires a day"));
  ok("PDD-01: Peak reaches 1.3 too", pdd.includes("Up to 260 on the last business day"));
  ok("PDD-01: End reaches 2.1 and 2.3", pdd.includes("All wires either released or returned"));
  ok("PDD-01: SOP reaches 2.2", pdd.includes("Existing wire callback SOP"));
  ok("PDD-08: a Data item tagged Report reaches 2.8",
     pdd.includes("Weekly callback compliance report"));

  const appsRow = [...dS.querySelectorAll("#pddDoc .pdd-table tr")]
    .find(r => r.textContent.includes("Citrix published desktop"));
  const appsCells = [...appsRow.querySelectorAll("td")].map(c => c.textContent.trim());
  ok("PDD-09: Remote fills Access Type and leaves Environment TBC",
     appsCells[1] === "TBC" && appsCells[2] === "Remote", appsCells.join(" / "));

  const excRow = [...dS.querySelectorAll("#pddDoc .pdd-table tr")]
    .find(r => r.textContent.includes("no exception path yet"));
  eq("PDD-10: a free-text tag is not promoted to Exception Type",
     excRow.querySelectorAll("td")[1].textContent.trim(), "Business exception");
  const unclRow = [...dS.querySelectorAll("#pddDoc .pdd-table tr")]
    .find(r => r.textContent.includes("unfamiliar rejection code"));
  eq("PDD-10: Unclassified is a usable exception type",
     unclRow.querySelectorAll("td")[1].textContent.trim(), "Unclassified");

  ok("no markup from captured text reaches the DOM",
     dS.querySelectorAll("#pddDoc img, #pddDoc script").length === 0);
  ok("angle brackets survive as text", pdd.includes("Vendor SFTP <drop>"));

  dS.getElementById("copyPddBtn").click();
  await wait(60);
  const md = wS.__clip || "";
  ok("PDD-03: the piped reply is escaped", md.includes("wires \\| daily.xlsx"),
     (md.split("\n").find(l => l.includes("daily.xlsx")) || "not found").slice(0, 90));
  ok("PDD-03: the newline stayed inside its cell", md.includes("never overwritten"));
  let expectCols = 0, checkedRows = 0, ragged = 0;
  md.split("\n").forEach(l => {
    if(!l.startsWith("|")){ expectCols = 0; return; }
    const cells = l.split(/(?<!\\)\|/).length - 2;
    if(/^\|[-|]+\|$/.test(l)){ expectCols = cells; return; }
    if(expectCols){ checkedRows++; if(cells !== expectCols) ragged++; }
  });
  ok("PDD-03: every markdown table row keeps its column count",
     ragged === 0 && checkedRows > 20, checkedRows + " rows, " + ragged + " ragged");
  ok("PDD-02: by-hand cells named in the markdown", md.includes("TBC (by hand)"));

  aS.view("review");
  ok("PDD-06: coverage reports fill, not item count",
     [...dS.querySelectorAll("#rvCoverage .st")].every(x => /\d+\/\d+$/.test(x.textContent.trim())),
     [...dS.querySelectorAll("#rvCoverage .st")].map(x => x.textContent).join(" | "));
  dS.getElementById("dlJsonBtn").click();
  await wait(80);
  const savedS = JSON.parse(wS.__saved[wS.__saved.length - 1].data);
  ok("PDD-13: non-string resolved keys dropped on replace",
     savedS.resolved.every(r => typeof r === "string") && savedS.resolved.length === 10,
     JSON.stringify(savedS.resolved.length));
  ok("PDD-13: every item sits in a real area",
     savedS.items.every(i => ["Systems","Data","Process","Operations","Rules","People",
                              "Exceptions","Dependencies","Evidence"].includes(i.section)));
  ok("PDD-13: tags and relations are arrays on every item",
     savedS.items.every(i => Array.isArray(i.tags) && Array.isArray(i.relations)));

  dS.getElementById("importBtn2").click();
  aS.dropFile(stressJson, "stress.json");
  await wait(120);
  dS.getElementById("importMerge").click();
  await wait(90);
  eq("PDD-04: merge doubles the session", aS.text("cItems"), "118");
  dS.getElementById("dlJsonBtn").click();
  await wait(80);
  const merged = JSON.parse(wS.__saved[wS.__saved.length - 1].data);
  const allIds = new Set(merged.items.map(i => i.id));
  const rels = merged.items.reduce((n, i) => n + i.relations.length, 0);
  ok("PDD-04: relations survive the merge", rels === 81, String(rels));
  const stillDangling = merged.items
    .reduce((n, i) => n + i.relations.filter(r => !allIds.has(r.targetId)).length, 0);
  ok("PDD-04: only the fixture's deliberate dangling relation is unresolved",
     stillDangling === 1, String(stillDangling));
  eq("PDD-04: no duplicate ids after merge", allIds.size, merged.items.length);
  ok("no page errors on the stress fixture", ctxS.errs.length === 0, ctxS.errs.join(" | "));

  group("Screenshots");
  /* jsdom has no IndexedDB and no canvas encoder, so what a screenshot does to
     an image is checked in a real Chromium instead. What is checked here is the
     part that has to be true whatever the browser: the session never carries
     image bytes, and nothing is thrown away that someone is still holding. */
  const ctxSh = boot({ storage: stored }); const aSh = api(ctxSh); await wait(150);
  const dSh = ctxSh.d, wSh = ctxSh.w;

  wSh.openSheet(wSh.S.items[0].id);
  await wait(60);
  ok("the sheet offers to paste one", !!dSh.getElementById("fPasteShot"));
  ok("and says which keystroke does it too",
     aSh.text("fShotHint").includes("Ctrl + V"), aSh.text("fShotHint"));
  ok("with somewhere to show them", !!dSh.getElementById("fShots"));
  dSh.getElementById("fPasteShot").click();
  await wait(60);
  ok("a clipboard it cannot read says so rather than failing silently",
     aSh.text("fShotHint").includes("Nothing to paste"), aSh.text("fShotHint"));
  dSh.getElementById("fCancel").click();

  /* the manifest describes; it never carries */
  wSh.S.shots["shot-a"] = wSh.shotEntry(wSh.S.id, {w:1600, h:900, bytes:190000,
                                                   type:"image/webp", at:"10:01", ts:1});
  wSh.S.shots["shot-loose"] = wSh.shotEntry(wSh.S.id, {w:800, h:600, bytes:40000,
                                                       type:"image/webp", at:"10:02", ts:2});
  wSh.S.items[0].shots = ["shot-a"];
  wSh.pendingShots = ["shot-held"];
  wSh.S.shots["shot-held"] = wSh.shotEntry(wSh.S.id, {w:10, h:10, bytes:1, type:"image/webp"});
  wSh.save();
  const raw = wSh.localStorage.getItem("process.discovery.console.v1");
  ok("no image data reaches the session", raw.indexOf("data:image") === -1 &&
     raw.indexOf("base64") === -1);
  ok("but the description of one does", JSON.parse(raw).shots["shot-a"].bytes === 190000);

  eq("pruning drops what nothing points at", wSh.pruneShots(), 1);
  ok("the referenced one stays", !!wSh.S.shots["shot-a"]);
  ok("and so does one still waiting for its item", !!wSh.S.shots["shot-held"],
     JSON.stringify(Object.keys(wSh.S.shots)));
  ok("the loose one is gone", !wSh.S.shots["shot-loose"]);

  const strip = wSh.shotThumbs(["shot-a", "shot-held"]);
  eq("a thumbnail is drawn per screenshot", strip.querySelectorAll(".shot").length, 2);
  eq("each one knows which it is",
     strip.querySelector("img").getAttribute("data-shot"), "shot-a");
  ok("and carries a description for a screen reader",
     strip.querySelector("img").getAttribute("alt").includes("1600"));

  wSh.pendingShots = [];
  wSh.renderPending();
  eq("nothing waiting means nothing shown", aSh.text("capturePending"), "");

  dSh.dispatchEvent(new wSh.Event("paste", { bubbles:true }));
  ok("a paste carrying no image is left alone", ctxSh.errs.length === 0,
     ctxSh.errs.join(" | "));
  ok("no page errors around screenshots", ctxSh.errs.length === 0, ctxSh.errs.join(" | "));

  group("Screenshots in the draft");
  /* The template asks for them in 2.9, so a screenshot taken against a system
     has to reach the document, not only the console. */
  const ctxG = boot({ storage: stored }); const aG = api(ctxG); await wait(150);
  const dG = ctxG.d, wG = ctxG.w;
  const sysItem = wG.S.items.find(i => i.section === "Systems");
  const evItem = wG.S.items.find(i => i.section === "Evidence" &&
                                      i.tags.indexOf("Screenshot") > -1);
  wG.S.shots["shot-g1"] = wG.shotEntry(wG.S.id, {w:1200, h:760, bytes:90000,
                                                 type:"image/webp", at:"10:03", ts:3});
  wG.S.shots["shot-g2"] = wG.shotEntry(wG.S.id, {w:900, h:600, bytes:50000,
                                                 type:"image/jpeg", at:"10:04", ts:4});
  sysItem.shots = ["shot-g1"];
  evItem.shots = ["shot-g2"];
  aG.view("pdd");
  await wait(80);

  eq("2.9 gathers every screenshot, wherever it hangs",
     dG.querySelectorAll("#pddDoc .pdd-gallery")[0].querySelectorAll(".pdd-fig").length, 2);
  ok("each caption says what it was captured against",
     [...dG.querySelectorAll("#pddDoc .pdd-fig figcaption")]
       .some(c => c.textContent.indexOf(sysItem.name) === 0 &&
                  c.textContent.indexOf("systems") > -1),
     [...dG.querySelectorAll("#pddDoc .pdd-fig figcaption")].map(c => c.textContent));

  /* 2.2 is the authoritative As-Is map. It used to fill itself from every
     piece of evidence in the session, which put green-screen captures where a
     process diagram belongs -- so it is a by-hand slot now, and nothing lands
     in it on its own. */
  const sec22 = [...dG.querySelectorAll("#pddDoc .pdd-sec")]
    .find(x => x.textContent.indexOf("2.2 ") === 0);
  eq("2.2 helps itself to nothing", sec22.querySelectorAll(".pdd-fig").length, 0);
  eq("exactly one gallery is drawn, and it is 2.9",
     dG.querySelectorAll("#pddDoc .pdd-gallery").length, 1);
  ok("2.2 offers the slot instead", !!sec22.querySelector("[data-paste]"));
  ok("and reads as an outstanding by-hand field until it is filled",
     !!sec22.querySelector(".tbc.byhand"));
  ok("captured references are still listed there, because those are fact",
     sec22.querySelectorAll(".pdd-list li").length > 0);

  wG.S.pddShots["2.2|map"] = ["shot-g1"];
  wG.renderPDD();
  const sec22b = [...dG.querySelectorAll("#pddDoc .pdd-sec")]
    .find(x => x.textContent.indexOf("2.2 ") === 0);
  eq("an image placed by hand appears there", sec22b.querySelectorAll(".pdd-figures .pdd-fig").length, 1);
  ok("and the TBC goes", !sec22b.querySelector(".tbc.byhand"));
  eq("2.9 is unchanged by it, because it only gathers what was captured",
     dG.querySelectorAll("#pddDoc .pdd-gallery")[0].querySelectorAll(".pdd-fig").length, 2);
  ok("pictures are not scored as answered fields",
     aG.text("pddMeta").indexOf("93 of 94") === 0, aG.text("pddMeta"));

  /* Nothing in the session points at a document image, so the pruner has to
     be told about it or the next pass deletes the process map. */
  wG.pruneShots();
  ok("the pruner leaves an image placed in the document alone",
     !!wG.S.shots["shot-g1"], Object.keys(wG.S.shots));

  eq("rubbish in the field is dropped rather than trusted",
     JSON.stringify(wG.normalisePddShots({ok:["a"], bad:"not a list", empty:[], mixed:["b", 7]})),
     '{"ok":["a"],"mixed":["b"]}');
  wG.S.pddShots = {};

  const gmd = wG.pddMarkdown();
  ok("the markdown points at the folder, not at a blob",
     gmd.indexOf("](assets/shots/" + wG.S.id + "/shot-g1.webp)") > -1,
     gmd.split("\n").filter(l => l.indexOf("assets/shots") > -1)[0]);
  ok("and uses the extension each file actually has",
     gmd.indexOf("shot-g2.jpg)") > -1);
  ok("with the caption as the alt text",
     gmd.indexOf("![" + sysItem.name) > -1);

  sysItem.shots = []; evItem.shots = [];
  wG.renderPDD();
  eq("a session with none of them draws no gallery",
     dG.querySelectorAll("#pddDoc .pdd-gallery").length, 0);
  ok("but 2.2 still offers its slot, because that is where the map goes",
     !![...dG.querySelectorAll("#pddDoc .pdd-sec")]
       .find(x => x.textContent.indexOf("2.2 ") === 0).querySelector("[data-paste]"));
  ok("no page errors drawing the gallery", ctxG.errs.length === 0, ctxG.errs.join(" | "));

  group("Screenshot folder");
  /* jsdom has no File System Access API, which is also the case in Firefox,
     Safari and from file://, so this is the path most people will be on. What
     it must do is say so plainly and offer the downloads instead. The writing
     itself is driven against a stand-in handle in a real Chromium. */
  const ctxF = boot({ storage: stored }); const aF = api(ctxF); await wait(150);
  const dF = ctxF.d, wF = ctxF.w;
  wF.S.shots["shot-p1"] = wF.shotEntry(wF.S.id, {w:1600, h:900, bytes:190000,
                                                 type:"image/webp", at:"10:01", ts:1});
  wF.S.shots["shot-p2"] = wF.shotEntry(wF.S.id, {w:900, h:600, bytes:70000,
                                                 type:"image/jpeg", at:"10:02", ts:2});
  wF.S.items[0].shots = ["shot-p1", "shot-p2"];
  aF.view("review");
  await wait(80);

  ok("Review carries a panel for the folder", !!dF.getElementById("shotSync"));
  ok("with nothing connected, everything is outstanding",
     wF.shotsOutstanding().length === 2, wF.shotsOutstanding());
  ok("it says this browser cannot write to a folder",
     aF.text("shotSyncState").includes("cannot write to a folder"),
     aF.text("shotSyncState"));
  ok("and names the folder the files belong in",
     aF.text("shotSyncState").includes("assets/shots/" + wF.S.id),
     aF.text("shotSyncState"));
  ok("so it hides a Connect button that could not work",
     dF.getElementById("shotConnect").hidden);
  ok("and offers the files as downloads instead",
     aF.text("shotFlush").indexOf("Download 2") === 0, aF.text("shotFlush"));
  ok("it does not claim to be linked",
     !dF.getElementById("shotSync").classList.contains("linked"));

  /* the file name is what wires a shared folder back up, so it follows the id */
  eq("a webp keeps its extension", wF.shotExt("shot-p1"), ".webp");
  eq("and a jpeg keeps its own", wF.shotExt("shot-p2"), ".jpg");
  eq("a screenshot is looked for in the folder of the project that took it",
     wF.shotPrj("shot-p1"), wF.S.id);
  wF.S.shots["shot-p3"] = wF.shotEntry("prj-other", {w:10, h:10, bytes:1, type:"image/webp"});
  eq("even when that is not this one", wF.shotPrj("shot-p3"), "prj-other");

  wF.S.shots = {};
  wF.S.items[0].shots = [];
  wF.renderShotSync();
  ok("with none taken it says where the first will go",
     aF.text("shotSyncState").includes("No screenshots yet"), aF.text("shotSyncState"));
  ok("and offers nothing to write", dF.getElementById("shotFlush").hidden);
  /* A session arrives as a manifest; whether its files arrived too is the
     first thing the person opening it needs to know. */
  wF.S.shots["shot-gone"] = wF.shotEntry("prj-elsewhere", {w:10, h:10, bytes:1,
                                                           type:"image/webp"});
  wF.S.items[0].shots = ["shot-gone"];
  const absent = await wF.shotsAbsent();
  eq("a screenshot with no bytes anywhere is reported absent", absent.length, 1);
  eq("and remembers whose folder should hold it", wF.shotPrj("shot-gone"), "prj-elsewhere");

  ok("no page errors without a folder API", ctxF.errs.length === 0, ctxF.errs.join(" | "));

  group("Session record");
  /* The tape holds the last fourteen because that is what is useful mid-call.
     Everything else was reachable only in principle -- the footer said "all
     kept in review" and named no way to get there. The record is that way. */
  const bigStore = JSON.parse(stored);
  const baseTs = 1758780000000;
  for(let k = 0; k < 120; k++){
    const ts = baseTs + k * 60000;
    const at = String(7 + Math.floor(k / 60)).padStart(2, "0") + ":" +
               String(k % 60).padStart(2, "0");
    bigStore.items.push({id:"big" + k, section:"Process", name:"Filler " + k,
      tags:[], relations:[], shots:[],
      replies: k === 5 ? [{text:"a distinctive marzipan remark", at:at, ts:ts + 1, shots:[]}] : [],
      at:at, ts:ts});
  }
  const ctxR = boot({ storage: JSON.stringify(bigStore) });
  const aR = api(ctxR); await wait(150);
  const dR = ctxR.d, wR = ctxR.w;
  const totalR = wR.entities().length;

  eq("the tape is still fourteen rows", dR.querySelectorAll("#tape .tape-row").length, 14);
  const tapeFoot = aR.text("tape").slice(-120);
  ok("and says how many it is not showing",
     tapeFoot.indexOf("+" + (totalR - 14) + " earlier") > -1, tapeFoot);
  ok("it offers a way to the rest rather than asserting they exist somewhere",
     tapeFoot.indexOf("View full session record") > -1 &&
     tapeFoot.indexOf("kept in review") === -1, tapeFoot);

  dR.querySelector(".tape-more-btn").click();
  await wait(90);
  ok("following it lands on the record", dR.getElementById("rvPanelRecord")
     .classList.contains("on"));
  ok("and only that tab is open",
     dR.querySelectorAll(".rv-panel.on").length === 1);
  ok("with the tab marked selected",
     dR.getElementById("rvTabRecord").getAttribute("aria-selected") === "true");

  /* A classic pager would ask which of six pages an 08:14 note is on. A window
     that grows on request asks nothing. */
  eq("only a window of it is in the DOM",
     dR.querySelectorAll("#rvRecord .rec-row").length, 25);
  ok("while the header counts the whole session",
     aR.text("rvRecCount").indexOf(String(totalR)) > -1, aR.text("rvRecCount"));
  ok("the button says how many more, not which page",
     aR.text("rvRecMore").indexOf("Load ") === 0 &&
     aR.text("rvRecMore").indexOf("Page") === -1, aR.text("rvRecMore"));

  const rowTimes = () => [...dR.querySelectorAll("#rvRecord .rec-row > time")]
    .map(t => t.textContent);
  const desc = rowTimes();
  ok("newest first", desc.join("|") === desc.slice().sort().reverse().join("|"), desc.slice(0, 4));

  dR.getElementById("rvRecMore").click();
  await wait(60);
  eq("loading more grows the window", dR.querySelectorAll("#rvRecord .rec-row").length, 50);
  let guard = 0;
  while(!dR.getElementById("rvRecMore").hidden && guard++ < 40){
    dR.getElementById("rvRecMore").click();
    await wait(10);
  }
  eq("every entry is reachable", dR.querySelectorAll("#rvRecord .rec-row").length, totalR);
  ok("and the button retires", dR.getElementById("rvRecMore").hidden);

  /* Three tools, and no more. A record with twenty filters is a database. */
  eq("search, type and order -- nothing else",
     dR.querySelectorAll(".rec-tools > *").length, 3);

  const search = dR.getElementById("rvRecSearch");
  search.value = "marzipan";
  search.dispatchEvent(new wR.Event("input", { bubbles:true }));
  await wait(40);
  eq("a word that exists only inside a reply still finds its entry",
     dR.querySelectorAll("#rvRecord .rec-row").length, 1);
  eq("and it is the right one",
     dR.querySelector("#rvRecord .ttext").textContent, "Filler 5");
  ok("the header says what you are looking at rather than the raw total",
     aR.text("rvRecCount").indexOf("matched") > -1, aR.text("rvRecCount"));

  search.value = "zzzznothing";
  search.dispatchEvent(new wR.Event("input", { bubbles:true }));
  await wait(40);
  ok("a search with no matches says so rather than going blank",
     !!dR.querySelector("#rvRecord .empty"));
  ok("and offers nothing to load", dR.getElementById("rvRecMore").hidden);

  search.value = "";
  search.dispatchEvent(new wR.Event("input", { bubbles:true }));
  await wait(40);
  eq("clearing it re-windows from the top instead of keeping a stale page",
     dR.querySelectorAll("#rvRecord .rec-row").length, 25);

  const kindSel = dR.getElementById("rvRecKind");
  ok("the type list is built from what the session holds",
     kindSel.options.length > 2 && kindSel.options[0].value === "", kindSel.options.length);
  kindSel.value = "Note";
  kindSel.dispatchEvent(new wR.Event("change", { bubbles:true }));
  await wait(40);
  ok("picking one keeps only that type",
     [...dR.querySelectorAll("#rvRecord .rec-row .k")]
       .every(k => k.textContent.trim() === "Note"));
  kindSel.value = "";
  kindSel.dispatchEvent(new wR.Event("change", { bubbles:true }));
  await wait(40);

  const sortSel = dR.getElementById("rvRecSort");
  sortSel.value = "old";
  sortSel.dispatchEvent(new wR.Event("change", { bubbles:true }));
  await wait(40);
  const asc = rowTimes();
  ok("oldest first reverses it", asc.join("|") === asc.slice().sort().join("|"), asc.slice(0, 4));
  eq("and re-windows from the new top",
     dR.querySelectorAll("#rvRecord .rec-row").length, 25);
  sortSel.value = "new";
  sortSel.dispatchEvent(new wR.Event("change", { bubbles:true }));
  await wait(40);

  /* "Without losing information": a row carries what the entry carries. */
  wR.recShown = 1000;
  wR.renderRecord();
  eq("every reply in the session is on the record",
     dR.querySelectorAll("#rvRecord .thread .reply").length,
     [...wR.S.items, ...wR.S.notes, ...wR.S.marks]
       .reduce((a, e) => a + (e.replies || []).length, 0));
  ok("notes and marks are in it, not only items",
     new Set([...dR.querySelectorAll("#rvRecord .rec-row .k")]
       .map(k => k.textContent.trim())).size > 2);

  const openBtn = dR.querySelector("#rvRecord .rec-open");
  openBtn.click();
  await wait(40);
  ok("an item opens its own sheet from the record",
     dR.getElementById("scrim").classList.contains("on") &&
     dR.getElementById("fName").value ===
       openBtn.closest(".rec-row").querySelector(".ttext").textContent,
     dR.getElementById("fName").value);
  dR.getElementById("scrim").classList.remove("on");

  /* Inventory answers "what did we find", the record answers "when". Both. */
  dR.getElementById("rvTabInventory").click();
  await wait(40);
  ok("the inventory is still there, on its own tab",
     dR.getElementById("rvPanelInventory").classList.contains("on") &&
     dR.getElementById("rvInventory").textContent.length > 0);
  ok("and the record is put away", !dR.getElementById("rvPanelRecord")
     .classList.contains("on"));
  dR.getElementById("rvTabEvidence").click();
  await wait(40);
  ok("the screenshot folder panel is on Evidence",
     dR.getElementById("rvPanelEvidence").classList.contains("on") &&
     !!dR.getElementById("shotSync"));
  ok("no page errors anywhere in the record", ctxR.errs.length === 0, ctxR.errs.join(" | "));

  group("The guided tour");
  /* It points at the real controls and captures nothing. A tour that leaves
     three made-up systems behind is one you have to clean up after, and the
     first thing anybody would reach for is New session -- which is how a first
     run ends up looking like a mess instead of an empty page. */
  const ctxU = boot(); const aU = api(ctxU); await wait(200);
  const dU = ctxU.d, wU = ctxU.w;
  await wait(500);                       /* it comes up shortly after boot */

  ok("an empty console is offered the tour without being asked",
     !dU.getElementById("tourScrim").hidden);
  ok("it starts at the first step",
     aU.text("tourStep").indexOf("step 1 of ") === 0, aU.text("tourStep"));
  const steps = Number(aU.text("tourStep").split(" of ")[1]);
  ok("with a step for each part of the screen", steps >= 8, steps);
  ok("no Back on the first one", dU.getElementById("tourBack").hidden);
  ok("nothing to single out yet, so the whole screen dims",
     dU.getElementById("tourHole").hidden &&
     dU.getElementById("tourScrim").classList.contains("dim"));

  dU.getElementById("tourNext").click();
  await wait(60);
  ok("the next step singles out a control",
     !dU.getElementById("tourHole").hidden &&
     !dU.getElementById("tourScrim").classList.contains("dim"));
  ok("and Back is offered", !dU.getElementById("tourBack").hidden);
  eq("the count keeps up", aU.text("tourStep"), "step 2 of " + steps);
  dU.getElementById("tourBack").click();
  await wait(40);
  eq("Back goes back", aU.text("tourStep"), "step 1 of " + steps);

  const titles = [];
  for(let i = 1; i < steps; i++){
    dU.getElementById("tourNext").click();
    await wait(30);
    titles.push(aU.text("tourTitle"));
  }
  ok("every step says something of its own",
     titles.every(Boolean) && new Set(titles).size === titles.length, titles);
  eq("the last one offers Done rather than Next", aU.text("tourNext"), "Done");
  ok("and stops offering Skip, because there is nothing left to skip",
     dU.getElementById("tourSkip").hidden);

  dU.getElementById("tourNext").click();
  await wait(60);
  ok("Done closes it", dU.getElementById("tourScrim").hidden);
  eq("and it captured nothing", wU.S.items.length + wU.S.notes.length +
     wU.S.marks.length + Object.keys(wU.S.shots).length, 0);
  ok("the only thing written down is that it has been seen", wU.S.ui.tourSeen === true);

  /* Somebody halfway through a session does not need to be told where the
     capture field is, and somebody opening a colleague's session wants to
     read it rather than be introduced to it. */
  const ctxU2 = boot({ storage: stored }); await wait(200);
  await wait(500);
  ok("a console with a session in it is not introduced to itself",
     ctxU2.d.getElementById("tourScrim").hidden);
  ok("even though that session has never seen the tour",
     !(ctxU2.w.S.ui && ctxU2.w.S.ui.tourSeen));

  /* It drives the app rather than describing it from the capture screen.
     "Review has five tabs" is a sentence; opening them is a tour. */
  const ctxU3 = boot({ storage: stored }); await wait(200);
  const dU3 = ctxU3.d, wU3 = ctxU3.w;
  dU3.getElementById("tourBtn").click();
  await wait(60);
  const walked = Number(ctxU3.w.document.getElementById("tourStep")
    .textContent.split(" of ")[1]);
  ok("the tour is exhaustive rather than one screen", walked >= 18, walked);

  const been = {views:new Set(), tabs:new Set(), rvTabs:new Set(), map:false};
  for(let i = 0; i < walked - 1; i++){
    been.views.add(wU3.currentView);
    been.tabs.add(wU3.S.ui.tab);
    been.rvTabs.add(wU3.rvTab);
    if(dU3.getElementById("mapScrim").classList.contains("on")) been.map = true;
    dU3.getElementById("tourNext").click();
    await wait(25);
  }
  ok("it opens the map", been.map);
  ok("it visits every view",
     ["capture", "review", "pdd"].every(v => been.views.has(v)), [...been.views]);
  ok("it opens all three inspector tabs",
     ["tape", "gaps", "note"].every(t => been.tabs.has(t)), [...been.tabs]);
  ok("and all five review tabs",
     ["overview", "record", "inventory", "coverage", "evidence"]
       .every(t => been.rvTabs.has(t)), [...been.rvTabs]);

  dU3.getElementById("tourNext").click();
  await wait(60);
  eq("and it puts the app back where it found it", wU3.currentView, "capture");
  ok("with the map closed",
     !dU3.getElementById("mapScrim").classList.contains("on"));
  eq("and the inspector tab it started on", wU3.S.ui.tab, "tape");
  eq("still having captured nothing", wU3.S.items.length + wU3.S.notes.length +
     wU3.S.marks.length, 53 + 3 + 2);
  ok("no page errors walking the app", ctxU3.errs.length === 0, ctxU3.errs.join(" | "));

  ok("but Guide brings it back", !!ctxU2.d.getElementById("tourBtn"));
  const beforeU = JSON.stringify([ctxU2.w.S.items.length, ctxU2.w.S.notes.length,
                                  ctxU2.w.S.marks.length]);
  ctxU2.d.getElementById("tourBtn").click();
  await wait(60);
  ok("and it opens on demand", !ctxU2.d.getElementById("tourScrim").hidden);
  ctxU2.d.getElementById("tourSkip").click();
  await wait(60);
  ok("Skip closes it there and then", ctxU2.d.getElementById("tourScrim").hidden);
  eq("with the session untouched",
     JSON.stringify([ctxU2.w.S.items.length, ctxU2.w.S.notes.length,
                     ctxU2.w.S.marks.length]), beforeU);
  eq("and it did not become a fifth view",
     ctxU2.d.querySelectorAll(".ico[data-view]").length, 4);
  ok("no page errors from the tour", ctxU.errs.length === 0 && ctxU2.errs.length === 0,
     ctxU.errs.concat(ctxU2.errs).join(" | "));

  group("The tape can correct what it shows");
  /* A screenshot pasted with nothing focused is filed as its own Evidence
     item, named after the clock. From the tape there was no way to rename it,
     open it or take it back: notes and marks had actions, anything captured
     had none. */
  const ctxT = boot({ storage: stored }); const aT = api(ctxT); await wait(150);
  const dT = ctxT.d, wT = ctxT.w;
  const rowOf = id => dT.querySelector('#tape .tape-row[data-entry="' + id + '"]');
  const actsOf = id => [...rowOf(id).querySelectorAll(".entry-acts .icon-btn")]
    .map(b => b.textContent);

  const anItem = wT.entities().find(r => r.kind !== "Note" && r.kind !== "Mark");
  ok("every tape row says which entry it is, because two items can share a name",
     [...dT.querySelectorAll("#tape .tape-row")].every(r => !!r.dataset.entry));
  ok("an item on the tape can be reached at all", !!rowOf(anItem.id));
  eq("and it offers the same two things a note does",
     actsOf(anItem.id).join(","), "Edit,Delete");

  /* A note is a line of text, corrected where it stands. An item has tags,
     relations and screenshots behind it, so it goes to the sheet. */
  rowOf(anItem.id).querySelectorAll(".entry-acts .icon-btn")[0].click();
  await wait(60);
  ok("Edit on an item opens the sheet",
     dT.getElementById("scrim").classList.contains("on"));
  eq("on that item", dT.getElementById("fName").value, anItem.text);
  dT.getElementById("fName").value = "Renamed from the tape";
  dT.getElementById("fSave").click();
  await wait(80);
  eq("and the rename sticks",
     wT.S.items.find(i => i.id === anItem.id).name, "Renamed from the tape");
  eq("and the tape says so", rowOf(anItem.id).querySelector(".ttext").textContent,
     "Renamed from the tape");

  const aNote = wT.S.notes[0];
  rowOf(aNote.id).querySelectorAll(".entry-acts .icon-btn")[0].click();
  await wait(60);
  ok("Edit on a note still corrects it where it stands, without a sheet",
     !dT.getElementById("scrim").classList.contains("on") &&
     !!dT.querySelector("#tape .entry-edit"));
  dT.dispatchEvent(new wT.KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
  await wait(60);

  /* Deleting an item is three things, and doing only the first leaves the map
     drawing an edge to a node that is not there. */
  const doomed = wT.S.items.find(i =>
    wT.S.items.some(x => x.relations.some(r => r.targetId === i.id)));
  const pointers = () => wT.S.items
    .filter(x => x.relations.some(r => r.targetId === doomed.id)).length;
  ok("the demo has an item something points at", pointers() > 0);
  /* it has to be on the tape to be deleted from it */
  doomed.ord = Date.now() + 1000;
  wT.renderAll();
  const del = () => rowOf(doomed.id).querySelectorAll(".entry-acts .icon-btn")[1];
  del().click();
  ok("the first press only arms it", !!wT.S.items.find(i => i.id === doomed.id));
  eq("and relabels", del().textContent, "Confirm delete");
  ok("an armed row keeps its actions on screen rather than hiding a live confirm",
     rowOf(doomed.id).querySelector(".entry-acts").classList.contains("arming"));
  await wait(450);
  del().click();
  await wait(60);
  ok("the second press deletes it", !wT.S.items.find(i => i.id === doomed.id));
  eq("and nothing is left pointing at a ghost", pointers(), 0);
  ok("no page errors correcting from the tape", ctxT.errs.length === 0, ctxT.errs.join(" | "));

  group("Reordering the record");
  /* An entry carries the time it was captured and, separately, where it sits
     in the record. Dragging a note next to the thing it explains moves the
     second and never the first, so the tape, the marks and the PDD all keep
     saying when it actually happened. */
  const ctxO = boot({ storage: stored }); const aO = api(ctxO); await wait(150);
  const dO = ctxO.d, wO = ctxO.w;
  aO.view("review");
  wO.setReviewTab("record");
  await wait(80);

  const ids = () => [...dO.querySelectorAll("#rvRecord .rec-row")].map(r => r.dataset.entry);
  const clocks = () => {
    const o = {};
    [...wO.S.items, ...wO.S.notes, ...wO.S.marks].forEach(e => { o[e.id] = e.at + "/" + e.ts; });
    return JSON.stringify(o);
  };
  const start = ids();
  const beforeClocks = clocks();

  ok("nothing has been reordered yet", !wO.anyReordered());
  ok("so nothing is offered back", dO.getElementById("rvRecOrder").hidden);
  eq("every row has a handle",
     dO.querySelectorAll("#rvRecord .rec-grip").length,
     dO.querySelectorAll("#rvRecord .rec-row").length);

  const moved = start[3];
  ok("a move lands where it was asked to go",
     wO.applyMove(moved, 0) && ids()[0] === moved, ids().slice(0, 4));
  ok("and everything else keeps its order",
     ids().filter(x => x !== moved).join("|") ===
     start.filter(x => x !== moved).join("|"));
  eq("not one capture time was rewritten", clocks(), beforeClocks);
  ok("the move is written down against the entry",
     typeof [...wO.S.items, ...wO.S.notes, ...wO.S.marks]
       .find(e => e.id === moved).ord === "number");
  ok("and it is offered back now", !dO.getElementById("rvRecOrder").hidden);

  /* One order for the session, so the tape reads the same way. */
  aO.view("capture");
  await wait(60);
  eq("the tape reads in the same order",
     [...dO.querySelectorAll("#tape .tape-row .ttext")].map(t => t.textContent).join("|"),
     wO.entities().slice(0, 14).map(r => r.text).join("|"));
  aO.view("review");
  wO.setReviewTab("record");
  await wait(60);

  /* Reordering is only honest when what you can see is what there is: with a
     filter on, two rows next to each other can have a dozen between them. */
  const search = dO.getElementById("rvRecSearch");
  search.value = "return";
  search.dispatchEvent(new wO.Event("input", { bubbles:true }));
  await wait(40);
  ok("a filter disables every handle",
     [...dO.querySelectorAll("#rvRecord .rec-grip")].every(g => g.disabled));
  ok("and says why", !dO.getElementById("rvRecLock").hidden);
  const lockedOrder = wO.recordRows().map(r => r.id).join("|");
  const g0 = dO.querySelector("#rvRecord .rec-grip");
  g0.dispatchEvent(new wO.KeyboardEvent("keydown", { key:"ArrowUp", bubbles:true }));
  await wait(40);
  eq("and the keyboard cannot get round it",
     wO.recordRows().map(r => r.id).join("|"), lockedOrder);
  search.value = "";
  search.dispatchEvent(new wO.Event("input", { bubbles:true }));
  await wait(40);
  ok("clearing it turns them back on",
     [...dO.querySelectorAll("#rvRecord .rec-grip")].every(g => !g.disabled));

  /* Midpoints run out after about forty bisections between the same pair. */
  const rr = wO.recordRows();
  const top = rr[0].ent, second = rr[1].ent;
  const X = wO.ordOf(top);
  top.ord = X;
  second.ord = X - 1e-6;
  ok("two entries can be squeezed until no number fits between them",
     (wO.ordOf(top) + wO.ordOf(second)) / 2 === wO.ordOf(top));
  ok("a move into that gap still completes", wO.applyMove(rr[2].id, 1));
  ok("and the order comes out strictly descending", (() => {
    const o = wO.entities().map(r => wO.ordOf(r.ent));
    for(let i = 1; i < o.length; i++) if(!(o[i] < o[i - 1])) return false;
    return true;
  })());

  dO.getElementById("rvRecOrder").click();
  ok("putting it back arms first", wO.anyReordered());
  await wait(450);
  dO.getElementById("rvRecOrder").click();
  ok("the second press clears every override", !wO.anyReordered());
  ok("and the record is chronological again", (() => {
    const o = wO.entities().map(r => r.ts);
    return o.join("|") === o.slice().sort((a, b) => b - a).join("|");
  })());
  ok("no page errors reordering", ctxO.errs.length === 0, ctxO.errs.join(" | "));

  group("Notes and marks can be corrected");
  /* A mark arrived as "Moment 3" and stayed that way, and neither a mark nor a
     note could be renamed, edited or removed from anywhere in the console. */
  const ctxM2 = boot({ storage: stored }); const aM2 = api(ctxM2); await wait(150);
  const dM2 = ctxM2.d, wM2 = ctxM2.w;

  ok("Mark has left the capture bar",
     !dM2.querySelector(".capture-actions #markBtn"));
  ok("and sits with the clock instead", !!dM2.querySelector(".topbar #markBtn"));

  dM2.getElementById("markBtn").click();
  await wait(60);
  const freshMark = wM2.S.marks[wM2.S.marks.length - 1];
  const markRow = [...dM2.querySelectorAll("#tape .tape-row")]
    .find(r => r.textContent.includes("Mark"));
  ok("a new mark is numbered until it is named",
     markRow.querySelector(".ttext").textContent.startsWith("Moment"));
  [...markRow.querySelectorAll(".entry-acts button")]
    .find(b => b.textContent === "Name").click();
  await wait(60);
  const nameField = dM2.querySelector("#tape .entry-edit input");
  ok("naming opens a field on the row", !!nameField);
  nameField.value = "Screen share of the posting queue";
  nameField.dispatchEvent(new wM2.KeyboardEvent("keydown", { key:"Enter", bubbles:true }));
  await wait(60);
  eq("the name is kept", freshMark.label, "Screen share of the posting queue");
  ok("and replaces the number on the tape",
     aM2.text("tape").includes("Screen share of the posting queue"));

  const marksBefore = wM2.S.marks.length;
  const named = [...dM2.querySelectorAll("#tape .tape-row")]
    .find(r => r.textContent.includes("Screen share of the posting queue"));
  const delMark = [...named.querySelectorAll(".entry-acts button")]
    .find(b => b.textContent === "Delete");
  delMark.click();
  eq("the first press on delete only arms it", wM2.S.marks.length, marksBefore);
  await wait(450);
  delMark.click();
  await wait(60);
  eq("the second press removes the mark", wM2.S.marks.length, marksBefore - 1);

  const noteRow = [...dM2.querySelectorAll("#tape .tape-row")]
    .find(r => r.textContent.includes("Note"));
  const noteId = wM2.S.notes[0].id;
  [...noteRow.querySelectorAll(".entry-acts button")]
    .find(b => b.textContent === "Edit").click();
  await wait(60);
  const noteField = dM2.querySelector("#tape .entry-edit textarea");
  ok("a note opens in a box", !!noteField);
  noteField.value = "Corrected after the call";
  noteField.dispatchEvent(new wM2.KeyboardEvent("keydown", { key:"Enter", bubbles:true }));
  await wait(60);
  eq("the note is corrected",
     wM2.S.notes.find(n => n.id === noteId).text, "Corrected after the call");
  ok("no page errors correcting the tape", ctxM2.errs.length === 0, ctxM2.errs.join(" | "));

  group("By-hand PDD cells");
  /* The cells the console has no way to capture are typed into the draft
     itself, keyed by item id so renaming an item keeps what was filed there. */
  const ctxH = boot({ storage: stored }); const aH = api(ctxH); await wait(150);
  const dH = ctxH.d, wH = ctxH.w;
  aH.view("pdd");
  eq("the draft counts what is still to fill in by hand",
     dH.querySelector("#pddMeta .byhand-count").textContent, "33");
  const attended = dH.querySelector('[data-mk="1.3|attended"]');
  ok("Attended/Unattended is one of them", !!attended);
  attended.click();
  const typed = dH.querySelector("#pddDoc .pdd-input");
  ok("clicking it opens a field where it stood", !!typed);
  typed.value = "Unattended, agreed with the RPA lead";
  typed.dispatchEvent(new wH.KeyboardEvent("keydown", { key:"Enter", bubbles:true }));
  await wait(60);
  eq("what was typed is kept on the session",
     wH.S.manual["1.3|attended"], "Unattended, agreed with the RPA lead");
  ok("and reads in the draft",
     aH.text("pddDoc").includes("Unattended, agreed with the RPA lead"));
  eq("the outstanding count comes down",
     dH.querySelector("#pddMeta .byhand-count").textContent, "32");
  ok("it is marked as typed rather than captured",
     !!dH.querySelector('.pdd-hand[data-mk="1.3|attended"]'));
  ok("the markdown carries it", wH.pddMarkdown().includes("Unattended, agreed with the RPA lead"));
  ok("and still flags the rest", wH.pddMarkdown().includes("TBC (by hand)"));

  const sys0 = wH.S.items.find(i => i.section === "Systems");
  wH.S.manual["1.4|granted|" + sys0.id] = "Granted 12 March";
  sys0.name = "Renamed core system";
  wH.renderPDD();
  ok("a typed value survives its item being renamed",
     aH.text("pddDoc").includes("Granted 12 March"));
  ok("it is written down with the session",
     JSON.parse(wH.localStorage.getItem("process.discovery.console.v1"))
       .manual["1.3|attended"] === "Unattended, agreed with the RPA lead");
  ok("no page errors typing into the draft", ctxH.errs.length === 0, ctxH.errs.join(" | "));

  group("Narrow screen actions");
  /* Three buttons and a clock wanted 508px of a 390px screen, so the page
     scrolled sideways and End walkthrough was off it entirely. */
  const ctxW = boot(); await wait(120);
  const dW = ctxW.d, wW = ctxW.w;
  ok("the actions live in one group that can fold away",
     !!dW.getElementById("topbarActs") && !!dW.getElementById("topbarMore"));
  ok("every action is inside it",
     ["newBtn","undoBtn","finishBtn"].every(id =>
       dW.getElementById("topbarActs").contains(dW.getElementById(id))));
  ok("and Mark stays out, because it is the one you press mid-call",
     !dW.getElementById("topbarActs").contains(dW.getElementById("markBtn")));
  eq("it starts closed", dW.getElementById("topbarMore").getAttribute("aria-expanded"), "false");
  dW.getElementById("topbarMore").click();
  ok("the control opens it", dW.getElementById("topbarActs").classList.contains("on"));
  eq("and says so", dW.getElementById("topbarMore").getAttribute("aria-expanded"), "true");
  dW.getElementById("undoBtn").click();
  ok("choosing an action closes it", !dW.getElementById("topbarActs").classList.contains("on"));
  dW.getElementById("topbarMore").click();
  dW.dispatchEvent(new wW.KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
  ok("Escape closes it", !dW.getElementById("topbarActs").classList.contains("on"));
  dW.getElementById("topbarMore").click();
  dW.getElementById("stage").dispatchEvent(new wW.MouseEvent("pointerdown", { bubbles:true }));
  ok("so does a press anywhere else",
     !dW.getElementById("topbarActs").classList.contains("on"));
  ok("no page errors on the narrow layout", ctxW.errs.length === 0, ctxW.errs.join(" | "));

  group("Session clock");
  /* The clock reads the wall clock rather than counting its own ticks. A
     browser throttles a hidden tab's timers to about once a minute, so a tick
     count lost most of an hour whenever the analyst switched away to the call. */
  const ctxC = boot(); const aC = api(ctxC); await wait(150);
  const dC = ctxC.d, wC = ctxC.w;
  eq("it starts running", dC.getElementById("clock").dataset.state, "running");
  eq("and the badge says so", aC.text("liveWord"), "recording");

  /* The controls used to appear whenever the pointer crossed the digits, so a
     menu turned up while you were only reading the time. They have a handle of
     their own now and the digits are just digits. */
  ok("the digits are not a control", dC.getElementById("clock").tagName !== "BUTTON");
  ok("there is a gear beside them", !!dC.getElementById("clockGear"));
  ok("the menu starts closed", dC.getElementById("clockMenu").hidden);
  eq("and the gear says so",
     dC.getElementById("clockGear").getAttribute("aria-expanded"), "false");
  dC.getElementById("clockGear").click();
  ok("the gear opens it", !dC.getElementById("clockMenu").hidden);
  eq("and updates what it announces",
     dC.getElementById("clockGear").getAttribute("aria-expanded"), "true");
  dC.getElementById("clockGear").click();
  ok("pressing it again closes it", dC.getElementById("clockMenu").hidden);
  dC.getElementById("clockGear").click();
  dC.dispatchEvent(new wC.KeyboardEvent("keydown", { key:"Escape", bubbles:true }));
  ok("Escape closes it", dC.getElementById("clockMenu").hidden);
  dC.getElementById("clockGear").click();
  dC.getElementById("stage").dispatchEvent(new wC.MouseEvent("click", { bubbles:true }));
  ok("so does a click anywhere else", dC.getElementById("clockMenu").hidden);

  /* Reset arms on the first press. Closing the menu on top of an armed Reset
     would leave a live confirm one blind click away the next time it opens. */
  dC.getElementById("clockGear").click();
  dC.getElementById("clockReset").click();
  eq("the first press on reset arms it", aC.text("clockReset"), "Confirm");
  dC.getElementById("clockGear").click();
  eq("closing the menu disarms it", aC.text("clockReset"), "Reset");
  dC.getElementById("clockGear").click();

  wC.S.seconds = 100;
  /* Read the count after pausing, not before: a second boundary between the
     read and the click would make these disagree for a reason that has
     nothing to do with whether pause works. */
  dC.getElementById("clockToggle").click();
  const t0 = wC.elapsed();
  await wait(1100);
  eq("pause stops the count", wC.elapsed(), t0);
  eq("the state says paused", dC.getElementById("clock").dataset.state, "paused");
  eq("the badge stops claiming to record", aC.text("liveWord"), "paused");
  eq("and the control offers resume", aC.text("clockToggle"), "Resume");
  ok("paused is written down",
     JSON.parse(wC.localStorage.getItem("process.discovery.console.v1")).paused === true);

  dC.getElementById("clockToggle").click();
  await wait(1100);
  ok("resume picks up where it stopped", wC.elapsed() > t0, wC.elapsed() + " vs " + t0);
  ok("nothing was lost over the pause", wC.elapsed() >= t0 + 1);

  dC.getElementById("clockHide").click();
  eq("hide blanks the digits", aC.text("clock"), "--:--:--");
  eq("and says so", dC.getElementById("clock").dataset.state, "hidden");
  eq("the control offers to show it again", aC.text("clockHide"), "Show");
  ok("but the time is still running underneath", wC.elapsed() > t0);
  dC.getElementById("markBtn").click();
  ok("a mark stamps the real time, not the dashes",
     wC.S.marks[wC.S.marks.length - 1].seconds > t0,
     String(wC.S.marks[wC.S.marks.length - 1].seconds));
  aC.view("review");
  ok("and review reports the real time too",
     !aC.text("rvStats").includes("--:--:--"), aC.text("rvStats"));
  aC.view("capture");
  dC.getElementById("clockHide").click();
  ok("show brings the digits back", aC.text("clock") !== "--:--:--");

  const before = wC.elapsed();
  dC.getElementById("clockReset").click();
  ok("the first press on reset only arms it", wC.elapsed() >= before);
  eq("and relabels, like every other irreversible thing",
     aC.text("clockReset"), "Confirm");
  await wait(450);
  dC.getElementById("clockReset").click();
  ok("the second press resets", wC.elapsed() < 3, String(wC.elapsed()));

  dC.getElementById("clockToggle").click();
  const ctxC2 = boot({ storage: wC.localStorage.getItem("process.discovery.console.v1") });
  await wait(150);
  eq("a paused clock is still paused after a reload",
     ctxC2.d.getElementById("clock").dataset.state, "paused");
  ok("no page errors driving the clock", ctxC.errs.length === 0, ctxC.errs.join(" | "));

  group("Relations announce themselves");
  /* Picking a type and a target files the relation there and then and clears
     both menus. That was silent, and on an item that already had relations
     there was no way to see which one you had just made. */
  const ctxR = boot({ storage: stored }); const aR = api(ctxR); await wait(150);
  const dR = ctxR.d, wR = ctxR.w;
  const host = wR.S.items.find(i => i.relations.length >= 2);
  wR.openSheet(host.id);
  await wait(60);
  eq("what was already on the item is listed",
     dR.querySelectorAll("#fRelList .rel").length, host.relations.length);
  eq("and none of it is marked new",
     dR.querySelectorAll("#fRelList .rel.is-new").length, 0);

  const pick = (type, targetId) => {
    dR.getElementById("fRelType").value = type;
    dR.getElementById("fRelTarget").value = targetId;
    dR.getElementById("fRelTarget").dispatchEvent(new wR.Event("change", { bubbles:true }));
  };
  const other = wR.S.items.find(i => i.id !== host.id &&
    !host.relations.some(r => r.targetId === i.id));

  pick("depends on", other.id);
  eq("the one just added is the only one marked new",
     dR.querySelectorAll("#fRelList .rel.is-new").length, 1);
  eq("the row carries a NEW tag",
     dR.querySelector("#fRelList .rel.is-new .rel-new").textContent, "new");
  ok("and flashes on the way in", !!dR.querySelector("#fRelList .rel.flash"));
  eq("both menus clear for the next one", dR.getElementById("fRelType").value, "");

  pick("depends on", other.id);
  eq("picking the same pair again adds nothing",
     dR.querySelectorAll("#fRelList .rel").length, host.relations.length + 1);
  ok("and says why nothing happened", aR.text("toast").includes("already on this item"),
     aR.text("toast"));

  [...dR.querySelectorAll("#fRelList .rel")].pop().querySelector(".icon-btn").click();
  eq("removing it takes the mark with it",
     dR.querySelectorAll("#fRelList .rel.is-new").length, 0);
  eq("and the row", dR.querySelectorAll("#fRelList .rel").length, host.relations.length);

  wR.openSheet(host.id);
  await wait(60);
  eq("reopening the sheet starts counting new again from nothing",
     dR.querySelectorAll("#fRelList .rel.is-new").length, 0);
  ok("no page errors adding relations", ctxR.errs.length === 0, ctxR.errs.join(" | "));

  group("Project identity");
  /* Screenshots are filed by project id, never by name -- a walkthrough gets
     renamed halfway through and every reference filed under the old name would
     come loose. */
  const ctxP = boot(); const aP = api(ctxP); await wait(120);
  const idOf = c => JSON.parse(c.w.localStorage.getItem("process.discovery.console.v1")).id;
  aP.capture(1, "Web UI", "Certitude 70");
  const prj = idOf(ctxP);
  ok("a session gets a project id", /^prj-[a-z0-9]{6}$/.test(String(prj)), String(prj));
  eq("and shows it where you hand the session over",
     (aP.view("review"), ctxP.d.getElementById("rvProject").textContent), prj);
  ctxP.d.getElementById("sessionName").value = "Renamed halfway through";
  ctxP.d.getElementById("sessionName").dispatchEvent(new ctxP.w.Event("input", { bubbles:true }));
  eq("renaming the session does not touch it", idOf(ctxP), prj);

  const legacyNoId = JSON.stringify({
    name:"From before ids", active:"Systems", resolved:[], notes:[{text:"note", at:"09:00"}],
    marks:[], items:[{ section:"Systems", name:"Old system", tags:["Web UI"], at:"09:01",
                       replies:[{ text:"a reply", at:"09:02" }] }]
  });
  const ctxL = boot({ storage: legacyNoId });
  await wait(150);
  const migrated = JSON.parse(ctxL.w.localStorage.getItem("process.discovery.console.v1"));
  ok("a session from before ids is given one", /^prj-[a-z0-9]{6}$/.test(String(migrated.id)),
     String(migrated.id));
  ok("and a screenshot manifest", migrated.shots && typeof migrated.shots === "object");
  ok("every item, note and reply gets somewhere to hang screenshots",
     Array.isArray(migrated.items[0].shots) &&
     Array.isArray(migrated.notes[0].shots) &&
     Array.isArray(migrated.items[0].replies[0].shots));
  ok("no page errors migrating to the manifest", ctxL.errs.length === 0, ctxL.errs.join(" | "));

  group("Storage quota");
  /* A full quota was swallowed, so the console went on looking like it was
     recording a session it had stopped writing. Nothing recovers from that
     afterwards, so it has to show while it is still fixable. */
  const ctxQ = boot(); const aQ = api(ctxQ); await wait(120);
  const realSet = ctxQ.w.localStorage.setItem.bind(ctxQ.w.localStorage);
  ok("nothing is wrong to begin with", ctxQ.d.getElementById("storageWarn").hidden);
  /* The property being true is not the same as the element being gone: a class
     that sets display beats the browser's own [hidden] rule, and this badge sat
     on screen for two releases saying the session was not being saved. */
  ok("and the hidden attribute actually hides",
     [...ctxQ.d.styleSheets].some(sh => [...(sh.cssRules || [])]
       .some(r => r.selectorText === "[hidden]")),
     "no [hidden] rule in the bundle");

  ctxQ.w.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  aQ.capture(1, "Web UI", "Certitude 70");
  ok("a refused write raises the warning",
     !ctxQ.d.getElementById("storageWarn").hidden);
  ok("and says so out loud", aQ.text("toast").includes("NOT being saved"),
     aQ.text("toast"));
  eq("the capture itself still happened", aQ.text("cItems"), "1");

  ctxQ.w.localStorage.setItem = realSet;
  aQ.capture(2, null, "Daily extract");
  ok("the warning clears once writes work again",
     ctxQ.d.getElementById("storageWarn").hidden);
  ok("and the recovered session is on disk",
     JSON.parse(ctxQ.w.localStorage.getItem("process.discovery.console.v1")).items.length === 2);
  ok("no page errors around a full quota", ctxQ.errs.length === 0, ctxQ.errs.join(" | "));

  group("Renamed storage key");
  /* The tool was renamed. A session left under the old key has to come across on
     the next load, or the rename reads to the analyst as a cleared console. */
  const legacyKeyed = JSON.stringify({
    name:"Carried over", active:"Systems", resolved:["Systems::Confirm the owner of each system"],
    notes:[], marks:[], seconds:120,
    items:[{ id:"k1", section:"Systems", name:"System from the old key",
             tags:["Web UI"], relations:[], replies:[], at:"09:00", ts:1 }]
  });
  const ctxK = boot({ legacyStorage: legacyKeyed });
  await wait(150);
  eq("a session under the old key still opens", ctxK.d.getElementById("cItems").textContent, "1");
  eq("with its name", ctxK.d.getElementById("sessionName").value, "Carried over");
  ok("and its answered questions",
     JSON.parse(ctxK.w.localStorage.getItem("process.discovery.console.v1")).resolved.length === 1);
  ok("it is rewritten under the new key",
     !!ctxK.w.localStorage.getItem("process.discovery.console.v1"));
  eq("and the old key is cleared",
     String(ctxK.w.localStorage.getItem("tqa.discovery.console.v1")), "null");
  ok("no page errors migrating", ctxK.errs.length === 0, ctxK.errs.join(" | "));

  const ctxK2 = boot({ storage: stored, legacyStorage: legacyKeyed });
  await wait(150);
  eq("a session already on the new key wins", ctxK2.d.getElementById("cItems").textContent, "53");

  group("Theme");
  const ctx4 = boot(); await wait(120);
  const root = ctx4.d.documentElement;
  eq("dark by default", root.getAttribute("data-theme"), "dark");
  ctx4.d.getElementById("themeBtn").click();
  eq("toggles to light", root.getAttribute("data-theme"), "light");
  ctx4.d.getElementById("themeBtn").click();
  eq("toggles back", root.getAttribute("data-theme"), "dark");

  console.log("\n" + "-".repeat(56));
  console.log(pass + " passed, " + fail + " failed");
  if(fail){
    console.log("\nfailures:");
    failures.forEach(f => console.log("  - " + f));
    process.exit(1);
  }
  process.exit(0);
}

run().catch(e => { console.log("\nharness crashed: " + e.message + "\n" + e.stack.split("\n")[1]); process.exit(1); });
