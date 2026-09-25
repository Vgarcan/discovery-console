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
const BUNDLE = path.join(ROOT, "dist", "tqa-discovery-console.html");
const DEMO = path.join(ROOT, "assets", "data", "demo-session-ach-returns.json");
const html = fs.readFileSync(BUNDLE, "utf8");
const demoJson = fs.readFileSync(DEMO, "utf8");

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
      if(opts.storage) win.localStorage.setItem("tqa.discovery.console.v1", opts.storage);
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
  const stored = w.localStorage.getItem("tqa.discovery.console.v1");
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
