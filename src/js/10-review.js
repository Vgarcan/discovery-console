/* 10-review.js
   Post-walkthrough review: stats, open questions, coverage and inventory. */
/* ---------- review ---------- */
$("finishBtn").addEventListener("click", () => setView("review"));
$("backBtn").addEventListener("click", () => setView("capture"));

function renderReview(){
  const gaps = buildGaps();
  const open = gaps.filter(g => !g.done);
  const touched = SECTIONS.filter(s => inSection(s).length);
  $("rvTitle").textContent = S.name || "Review";

  $("rvStats").innerHTML = [
    [S.items.length, "items captured"],
    [open.length, "questions still open"],
    [touched.length + " of 9", "areas touched"],
    [$("clock").textContent, "time on the call"]
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

  const cw = $("rvCoverage");
  cw.innerHTML = "";
  PDD.forEach(([label,secs]) => {
    const n = secs.reduce((a,s) => a + inSection(s).length, 0);
    const pct = Math.min(100, n * 25);
    const cls = pct >= 75 ? "good" : pct >= 25 ? "part" : "none";
    const st = pct >= 75 ? "covered" : pct >= 25 ? "partial" : "empty";
    const d = document.createElement("div");
    d.className = "cov " + cls;
    d.innerHTML = "<span>" + esc(label) + '</span><span class="bar"><i style="width:' + pct + '%"></i></span><span class="st">' + st + "</span>";
    cw.appendChild(d);
  });

  const inputs = S.items.filter(i => i.section === "Data" && i.tags.includes("Input")).length;
  const outputs = S.items.filter(i => i.section === "Data" && i.tags.includes("Output")).length;
  const exc = inSection("Exceptions").length;
  $("rvIoe").innerHTML =
    "<div><b>" + inputs + "</b><span>inputs</span></div>" +
    "<div><b>" + outputs + "</b><span>outputs</span></div>" +
    "<div><b>" + exc + "</b><span>exceptions</span></div>";

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
