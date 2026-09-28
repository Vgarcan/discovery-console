/* 10-review.js
   Post-walkthrough review: stats, open questions, coverage and inventory. */
/* ---------- review ---------- */
$("finishBtn").addEventListener("click", () => setView("review"));
$("backBtn").addEventListener("click", () => setView("capture"));

/* ---------- tabs ---------- */
/* Inventory answers "what did we find" and groups by area; the session record
   answers "when, and in what order" and groups by the clock. Both are worth
   keeping, and stacking one under the other on a single page made the second
   one look like a footnote to the first. */
let rvTab = "overview";

function setReviewTab(name){
  rvTab = name;
  document.querySelectorAll("#rvTabs .rv-tab").forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle("on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".rv-panel").forEach(p2 =>
    p2.classList.toggle("on", p2.id === "rvPanel" + name[0].toUpperCase() + name.slice(1)));
  if(name === "record") renderRecord();
}

document.querySelectorAll("#rvTabs .rv-tab").forEach(b =>
  b.addEventListener("click", () => setReviewTab(b.dataset.tab)));

/* ---------- session record ---------- */
/* Everything is held in memory and only a window of it is ever in the DOM.
   A session of five hundred entries has to stay usable, and five hundred rows
   each carrying a thread and a strip of thumbnails does not. */
const REC_PAGE = 25;
let recShown = REC_PAGE;
let recQuery = "";
let recKind = "";
let recSort = "new";

/* The replies are part of the entry, so they are part of what a search looks
   through. Finding the row but not the sentence you remembered would make the
   search feel broken. */
function recHaystack(r){
  return (r.text + " " + r.kind + " " + r.at + " " +
          (r.ent.replies || []).map(x => x.text).join(" ")).toLowerCase();
}

function recordRows(){
  let rows = entities();                 /* already newest-first */
  if(recKind) rows = rows.filter(r => r.kind === recKind);
  if(recQuery){
    const q = recQuery.toLowerCase();
    rows = rows.filter(r => recHaystack(r).indexOf(q) > -1);
  }
  if(recSort === "old") rows = rows.slice().reverse();
  return rows;
}

function renderRecordKinds(){
  const sel = $("rvRecKind");
  const counts = new Map();
  entities().forEach(r => counts.set(r.kind, (counts.get(r.kind) || 0) + 1));
  if(recKind && !counts.has(recKind)) recKind = "";
  const total = entities().length;
  sel.innerHTML = '<option value="">All types (' + total + ")</option>" +
    [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => '<option value="' + esc(k) + '"' + (k === recKind ? " selected" : "") +
                       ">" + esc(k) + " (" + n + ")</option>").join("");
}

function recordRow(r){
  const d = document.createElement("div");
  d.className = "rec-row";
  d.dataset.entry = r.id;
  d.style.setProperty("--kind", kindColor(r.kind));

  const t = document.createElement("time");
  t.textContent = r.at;

  const body = document.createElement("div");
  body.className = "rec-body";
  body.innerHTML =
    '<span class="k"><i class="kdot' + (r.kind === "Mark" ? " ring" : "") + '" style="' +
    (r.kind === "Mark" ? "border-color:" : "background:") + kindColor(r.kind) + '"></i>' +
    esc(r.kind) + "</span>" +
    '<span class="ttext">' + esc(r.text) + "</span>";

  if((r.ent.shots || []).length) body.appendChild(shotThumbs(r.ent.shots));
  if((r.ent.replies || []).length) body.insertAdjacentHTML("beforeend", threadHtml(r.ent));

  /* An item has a sheet behind it -- tags, relations, screenshots, the lot.
     Notes and marks are only ever what the row already shows. */
  if(r.ent.section){
    const open = document.createElement("button");
    open.className = "icon-btn rec-open"; open.type = "button";
    open.textContent = "Open";
    open.title = "Open this item";
    open.addEventListener("click", () => openSheet(r.id));
    body.appendChild(open);
  }

  d.appendChild(t);
  d.appendChild(body);
  return d;
}

function renderRecord(){
  renderRecordKinds();
  const rows = recordRows();
  const total = entities().length;
  const shown = rows.slice(0, recShown);

  $("rvRecCount").textContent = total + (total === 1 ? " entry" : " entries");
  $("rvTabCount").textContent = total || "";

  const wrap = $("rvRecord");
  wrap.innerHTML = "";
  if(!shown.length){
    wrap.innerHTML = '<div class="empty">' +
      (total ? "Nothing in this session matches that."
             : "Captures, notes and marks appear here as you make them.") + "</div>";
    $("rvRecMore").hidden = true;
    return;
  }

  const frag = document.createDocumentFragment();
  shown.forEach(r => frag.appendChild(recordRow(r)));
  wrap.appendChild(frag);
  hydrateShots();

  const left = rows.length - shown.length;
  const more = $("rvRecMore");
  more.hidden = !left;
  more.textContent = "Load " + Math.min(REC_PAGE, left) + " earlier";

  /* Filtering narrows the list, so say what you are looking at rather than
     leaving the header count arguing with the rows on screen. */
  if(rows.length !== total){
    $("rvRecCount").textContent = "showing " + shown.length + " of " + rows.length +
      " matched, " + total + " in the session";
  }else if(left){
    $("rvRecCount").textContent = shown.length + " of " + total + " entries";
  }
}

/* A new search re-windows from the top; loading more never does. */
function recordReset(){ recShown = REC_PAGE; renderRecord(); }

$("rvRecSearch").addEventListener("input", e => {
  recQuery = e.target.value.trim();
  recordReset();
});
$("rvRecKind").addEventListener("change", e => { recKind = e.target.value; recordReset(); });
$("rvRecSort").addEventListener("change", e => { recSort = e.target.value; recordReset(); });
$("rvRecMore").addEventListener("click", () => {
  recShown += REC_PAGE;
  renderRecord();
  /* Put the keyboard where the new rows start, so a long record can be walked
     with the button alone. */
  const rows = $("rvRecord").children;
  const first = rows[recShown - REC_PAGE];
  if(first) first.scrollIntoView({block:"center"});
});

/* Reached from the tape, which shows only the last fourteen. */
function openSessionRecord(){
  setView("review");
  setReviewTab("record");
  $("rvPanelRecord").scrollIntoView({block:"start"});
}

function renderReview(){
  const gaps = buildGaps();
  const open = gaps.filter(g => !g.done);
  const touched = SECTIONS.filter(s => inSection(s).length);
  $("rvTitle").textContent = S.name || "Review";
  /* The id, not the name, is what finds this project's screenshot folder. It is
     shown here because this is the view you are on when you hand a session over. */
  $("rvProject").textContent = S.id || "";
  $("rvProject").parentNode.hidden = !S.id;
  renderShotSync();

  $("rvStats").innerHTML = [
    [S.items.length, "items captured"],
    [open.length, "questions still open"],
    [touched.length + " of 9", "areas touched"],
    [clockText(elapsed()), "time on the call"]
  ].map(([b,s]) => '<div class="rv-stat"><b>' + esc(b) + "</b><span>" + esc(s) + "</span></div>").join("");

  const gw = $("rvGaps");
  gw.innerHTML = "";
  if(!gaps.length){
    gw.innerHTML = '<div class="empty">Nothing captured yet, so there is nothing to chase.</div>';
  }else{
    let current = "";
    gaps.forEach(g => {
      if(g.sec !== current){
        current = g.sec;
        const h = document.createElement("h3");
        h.style.cssText = "font-size:.8rem;font-weight:600;margin:1.1rem 0 .3rem;padding-bottom:.3rem;border-bottom:1px solid var(--line)";
        h.textContent = g.sec;
        gw.appendChild(h);
      }
      gw.appendChild(gapRow(g));
    });
  }

  const iw = $("rvInventory");
  iw.innerHTML = "";
  if(!S.items.length){
    iw.innerHTML = '<div class="empty">No items on the record.</div>';
  }else{
    SECTIONS.forEach(sec => {
      const items = inSection(sec);
      if(!items.length) return;
      const g = document.createElement("div");
      g.className = "inv-group";
      g.innerHTML = "<h3>" + esc(sec) + " (" + items.length + ")</h3>" + items.map(i => {
        const rel = i.relations.map(r => {
          const t = S.items.find(x => x.id === r.targetId);
          return t ? r.type + " " + t.name : "";
        }).filter(Boolean).join(", ");
        return '<div class="inv"><span>' + esc(i.name) + (rel ? ' <em>&nbsp;' + esc(rel) + "</em>" : "") +
               "</span><em>" + esc(i.tags.join(", ") || "untagged") + "</em></div>" + threadHtml(i);
      }).join("");
      iw.appendChild(g);
    });
  }

  /* Coverage reports how much of each PDD section the captured evidence actually
     fills. It used to be item count x 25%, which showed four flow cues as a
     covered Process Description while every field in it rendered TBC. */
  const cw = $("rvCoverage");
  cw.innerHTML = "";
  const fill = pddSectionFill();
  PDD.forEach(([label,secs]) => {
    const no = label.split(" ")[0];
    const f = fill[no] || {filled:0, total:0};
    const captured = secs.reduce((a,s) => a + inSection(s).length, 0);
    const pct = f.total ? Math.round(100 * f.filled / f.total) : 0;
    const cls = pct >= 75 ? "good" : pct >= 25 ? "part" : "none";
    const st = !captured ? "empty"
             : pct >= 75 ? "covered"
             : pct >= 25 ? "partial" : "not landing";
    const d = document.createElement("div");
    d.className = "cov " + cls;
    d.innerHTML = "<span>" + esc(label) + '</span><span class="bar"><i style="width:' + pct + '%"></i></span>' +
                  '<span class="st">' + esc(st) + " " + f.filled + "/" + f.total + "</span>";
    cw.appendChild(d);
  });

  const inputs = S.items.filter(i => i.section === "Data" && i.tags.includes("Input")).length;
  const outputs = S.items.filter(i => i.section === "Data" && i.tags.includes("Output")).length;
  const exc = inSection("Exceptions").length;
  $("rvIoe").innerHTML =
    "<div><b>" + inputs + "</b><span>inputs</span></div>" +
    "<div><b>" + outputs + "</b><span>outputs</span></div>" +
    "<div><b>" + exc + "</b><span>exceptions</span></div>";

  renderRecord();

  const nw = $("rvNotes");
  nw.innerHTML = "";
  if(!S.notes.length && !S.marks.length){
    nw.innerHTML = '<div class="empty">No parked thoughts or marks.</div>';
  }else{
    S.notes.forEach(n => {
      const d = document.createElement("div");
      d.className = "inv";
      d.innerHTML = "<span>" + esc(n.text) + "</span><em>" + esc(n.at) + "</em>";
      nw.appendChild(d);
      if((n.replies || []).length) nw.insertAdjacentHTML("beforeend", threadHtml(n));
    });
    S.marks.forEach((m,i) => {
      const d = document.createElement("div");
      d.className = "inv";
      d.innerHTML = "<span>Moment " + (i+1) + "</span><em>" + esc(m.at) + "</em>";
      nw.appendChild(d);
    });
  }
}
