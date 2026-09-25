/* 07-gaps.js
   Gap engine: what is still unconfirmed, and resolving it. */
/* ---------- gaps ---------- */
function buildGaps(){
  const out = [];
  SECTIONS.forEach(sec => {
    if(!inSection(sec).length) return;
    (GAPS[sec] || []).forEach(g => out.push({sec:sec, text:g, done:S.resolved.includes(gapKey(sec,g))}));
  });
  return out;
}

function toggleGap(sec, text){
  const k = gapKey(sec,text);
  S.resolved = S.resolved.includes(k) ? S.resolved.filter(x => x !== k) : S.resolved.concat(k);
  renderAll(); save();
}

function gapRow(g){
  const d = document.createElement("label");
  d.className = "gap-line";
  d.innerHTML = '<input type="checkbox"' + (g.done ? " checked" : "") + '><span><span class="gap-sec">' +
                esc(g.sec.toLowerCase()) + "</span> " + esc(g.text) + "</span>";
  d.querySelector("input").addEventListener("change", () => toggleGap(g.sec, g.text));
  return d;
}

function renderGaps(){
  const gaps = buildGaps();
  const open = gaps.filter(g => !g.done);
  $("gapCount").textContent = open.length ? open.length : "";
  const wrap = $("gapList");
  if(!gaps.length){
    wrap.innerHTML = '<div class="empty" style="padding:.6rem 0;font-size:.8rem">Capture something and the console starts listing what is still missing.</div>';
    return;
  }
  wrap.innerHTML = "";
  open.slice(0,7).forEach(g => wrap.appendChild(gapRow(g)));
  if(open.length > 7){
    const m = document.createElement("div");
    m.className = "label";
    m.style.paddingTop = ".5rem";
    m.textContent = "+" + (open.length - 7) + " more in review";
    wrap.appendChild(m);
  }
  if(!open.length){
    const m = document.createElement("div");
    m.className = "label";
    m.textContent = "all questions answered";
    wrap.appendChild(m);
  }
}
