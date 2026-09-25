/* 11-export.js
   Session Markdown and clipboard handling. */
/* ---------- export ---------- */
function toMarkdown(){
  const L = [];
  L.push("# " + (S.name || "Discovery walkthrough"));
  L.push("");
  L.push("Captured items: " + S.items.length + ". Areas touched: " + SECTIONS.filter(s => inSection(s).length).length + " of 9.");
  L.push("");
  SECTIONS.forEach(sec => {
    const items = inSection(sec);
    if(!items.length) return;
    L.push("## " + sec);
    items.forEach(i => {
      const rel = i.relations.map(r => {
        const t = S.items.find(x => x.id === r.targetId);
        return t ? r.type + " " + t.name : "";
      }).filter(Boolean).join("; ");
      L.push("- **" + i.name + "**" + (i.tags.length ? " (" + i.tags.join(", ") + ")" : "") + (rel ? " - " + rel : ""));
      (i.replies || []).forEach(r => L.push("  - " + r.at + " " + r.text));
    });
    L.push("");
  });
  const open = buildGaps().filter(g => !g.done);
  if(open.length){
    L.push("## Open questions for the next walkthrough");
    open.forEach(g => L.push("- [" + g.sec + "] " + g.text));
    L.push("");
  }
  if(S.notes.length){
    L.push("## Parked thoughts");
    S.notes.forEach(n => {
      L.push("- " + n.at + " " + n.text);
      (n.replies || []).forEach(r => L.push("  - " + r.at + " " + r.text));
    });
    L.push("");
  }
  if(S.marks.length){
    L.push("## Marked moments");
    S.marks.forEach((m,i) => {
      L.push("- Moment " + (i+1) + " at " + m.at);
      (m.replies || []).forEach(r => L.push("  - " + r.at + " " + r.text));
    });
  }
  return L.join("\n");
}

function copyText(text, msg){
  const done = () => toast(msg);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(fallback);
  }else fallback();
  function fallback(){
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand("copy"); done(); }catch(e){ toast("Copy failed, select the text manually"); }
    document.body.removeChild(ta);
  }
}
$("copyMdBtn").addEventListener("click", () => copyText(toMarkdown(), "Markdown copied, ready for the PDD"));
