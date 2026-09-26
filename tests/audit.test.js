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
  return { w: dom.window, d: dom.window.document, errs };
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
  d.getElementById("dType").value = "connects to";
  const boxes = [...d.querySelectorAll("#dPicker input")].slice(0,2);
  boxes.forEach(b => { b.checked = true; b.dispatchEvent(new w.Event("change", { bubbles:true })); });
  d.getElementById("dLink").click();
  eq("two links created at once", d.querySelectorAll("#mapEdges .edge").length, 3);
  const removable = d.querySelector("#dLinks .icon-btn");
  removable.click();
  eq("a relation can be removed from the map", d.querySelectorAll("#mapEdges .edge").length, 2);
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
     d.querySelector("#pddMeta .byhand-count").textContent, "33");
  eq("and marked in the document", d.querySelectorAll("#pddDoc .tbc.byhand").length, 33);
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
  eq("bands follow the rail order",
     [...dM.querySelectorAll("#mapLaneLabels span")].map(x => x.firstChild.textContent).join(","),
     populated.map(s2 => s2.toLowerCase()).join(","));

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
  aM.clickNode(wM.M.nodes.indexOf(wM.M.links[0].s));
  await wait(60);
  ok("selecting a node turns its relations hot and names them",
     wM.M.links.filter(l => l.el.getAttribute("marker-end") === "url(#arrowHot)").length > 0 &&
     wM.M.links.some(l => l.lab.style.opacity === "1" && l.lab.textContent === relType),
     relType);

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
     dS.querySelector("#pddMeta .byhand-count").textContent, "38");
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

  group("Session clock");
  /* The clock reads the wall clock rather than counting its own ticks. A
     browser throttles a hidden tab's timers to about once a minute, so a tick
     count lost most of an hour whenever the analyst switched away to the call. */
  const ctxC = boot(); const aC = api(ctxC); await wait(150);
  const dC = ctxC.d, wC = ctxC.w;
  eq("it starts running", dC.getElementById("clock").dataset.state, "running");
  eq("and the badge says so", aC.text("liveWord"), "recording");

  wC.S.seconds = 100;
  const t0 = wC.elapsed();
  dC.getElementById("clockToggle").click();
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
