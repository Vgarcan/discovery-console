/* 04-capture.js
   The capture bar: type-ahead suggestions across all areas and item creation. */
/* ---------- capture ---------- */
const capture = $("captureInput");

capture.addEventListener("input", renderSuggest);
capture.addEventListener("keydown", e => {
  const open = $("suggest").classList.contains("on");
  if(e.key === "ArrowDown" && open){ e.preventDefault(); sugIndex = Math.min(sugIndex+1, sugList.length-1); paintSuggest(); return; }
  if(e.key === "ArrowUp" && open){ e.preventDefault(); sugIndex = Math.max(sugIndex-1, 0); paintSuggest(); return; }
  if(e.key === "Escape"){
    if($("suggest").classList.contains("on")) closeSuggest();
    else capture.blur();
    return;
  }
  if(e.key === "Enter"){
    e.preventDefault();
    if(e.metaKey || e.ctrlKey){ saveNoteFrom(capture.value); capture.value=""; closeSuggest(); return; }
    if(open && sugList[sugIndex]){
      const s = sugList[sugIndex];
      if(s.section !== S.active) selectSection(s.section);
      seed = s.type;
      renderTypes(); renderSeed();
      capture.value = s.rest;
      closeSuggest();
      if(!s.rest){ capture.focus(); return; }
    }
    commit();
  }
});

function renderSuggest(){
  const q = capture.value.trim().toLowerCase();
  sugList = [];
  if(q.length >= 2){
    SECTIONS.forEach(sec => {
      DEF[sec].actions.forEach(([name,desc]) => {
        const n = name.toLowerCase();
        if(n.startsWith(q) || (q.length >= 3 && n.includes(q))){
          sugList.push({section:sec, type:name, desc:desc, rest:""});
        }
      });
    });
    sugList.sort((a,b) => (a.section === S.active ? -1 : 0) - (b.section === S.active ? -1 : 0));
    sugList = sugList.slice(0,6);
  }
  sugIndex = 0;
  paintSuggest();
}

function paintSuggest(){
  const box = $("suggest");
  if(!sugList.length){ closeSuggest(); return; }
  box.classList.add("on");
  box.innerHTML = "";
  sugList.forEach((s,i) => {
    const d = document.createElement("div");
    if(i === sugIndex) d.className = "sel";
    d.innerHTML = "<span>" + esc(s.type) + "</span><small>" + esc(s.desc) + "</small>" +
                  '<span class="sg-sec">' + esc(s.section.toLowerCase()) + "</span>";
    d.addEventListener("mousedown", e => {
      e.preventDefault();
      sugIndex = i;
      if(s.section !== S.active) selectSection(s.section);
      seed = s.type; renderTypes(); renderSeed();
      capture.value = ""; closeSuggest(); capture.focus();
    });
    box.appendChild(d);
  });
}
function closeSuggest(){ $("suggest").classList.remove("on"); sugList = []; }

function commit(){
  const name = capture.value.trim() || seed;
  if(!name){ toast("Pick a type or type a name first"); return; }
  S.items.push({
    id:uid(), section:S.active, name:name,
    tags: seed ? [seed] : [], relations:[], replies:[], at:now(), ts:Date.now()
  });
  capture.value = "";
  closeSuggest();
  renderAll();
  save();
}

$("clearSeed").addEventListener("click", () => { seed = null; renderTypes(); renderSeed(); capture.focus(); });
$("detailBtn").addEventListener("click", () => openSheet(null, capture.value.trim()));
