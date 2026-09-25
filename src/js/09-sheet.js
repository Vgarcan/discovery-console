/* 09-sheet.js
   Item detail sheet: tags and the many-to-many relation editor. */
/* ---------- detail sheet ---------- */
function openSheet(id, prefillName){
  editingId = id;
  const item = id ? S.items.find(i => i.id === id) : null;
  const sec = item ? item.section : S.active;
  draftTags = item ? item.tags.slice() : (seed ? [tagOf(sec, seed)] : []);
  draftRels = item ? item.relations.slice() : [];

  $("sheetLabel").textContent = sec.toLowerCase();
  $("sheetTitle").textContent = item ? "Edit item" : "New " + sec.toLowerCase() + " item";
  $("fName").value = item ? item.name : (prefillName || "");
  $("fName").placeholder = placeholderFor(sec, seed);
  $("fCustomTag").value = "";
  $("fRelType").value = "";

  renderTagPick(sec);
  renderRelTargets(id);
  renderDraftRels();
  $("scrim").classList.add("on");
  setTimeout(() => $("fName").focus(), 30);
}
function closeSheet(){ $("scrim").classList.remove("on"); editingId = null; }

function renderTagPick(sec){
  const wrap = $("fTags");
  wrap.innerHTML = "";
  const all = DEF[sec].tags.concat(draftTags.filter(t => !DEF[sec].tags.includes(t)));
  all.forEach(tag => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = draftTags.includes(tag) ? "on" : "";
    b.textContent = tag;
    b.addEventListener("click", () => {
      draftTags = draftTags.includes(tag) ? draftTags.filter(t => t !== tag) : draftTags.concat(tag);
      renderTagPick(sec);
    });
    wrap.appendChild(b);
  });
}

$("fAddTag").addEventListener("click", () => {
  const v = $("fCustomTag").value.trim();
  if(!v) return;
  if(!draftTags.includes(v)) draftTags.push(v);
  $("fCustomTag").value = "";
  renderTagPick(editingId ? S.items.find(i => i.id === editingId).section : S.active);
});

function renderRelTargets(skipId){
  const sel = $("fRelTarget");
  sel.innerHTML = '<option value="">Pick an item</option>';
  S.items.filter(i => i.id !== skipId).forEach(i => {
    const o = document.createElement("option");
    o.value = i.id;
    o.textContent = i.name + " (" + i.section.toLowerCase() + ")";
    sel.appendChild(o);
  });
}

$("fRelTarget").addEventListener("change", addDraftRel);
$("fRelType").addEventListener("change", addDraftRel);
function addDraftRel(){
  const type = $("fRelType").value, target = $("fRelTarget").value;
  if(!type || !target) return;
  if(!draftRels.some(r => r.type === type && r.targetId === target)) draftRels.push({type:type, targetId:target});
  $("fRelType").value = ""; $("fRelTarget").value = "";
  renderDraftRels();
}
function renderDraftRels(){
  const wrap = $("fRelList");
  wrap.innerHTML = "";
  draftRels.forEach((r,i) => {
    const t = S.items.find(x => x.id === r.targetId);
    const d = document.createElement("div");
    d.className = "rel";
    d.style.display = "flex";
    d.style.justifyContent = "space-between";
    d.innerHTML = "<span><b>" + esc(r.type) + "</b> " + esc(t ? t.name : "missing item") + "</span>";
    const b = document.createElement("button");
    b.className = "icon-btn danger"; b.type = "button"; b.textContent = "Remove";
    b.addEventListener("click", () => { draftRels.splice(i,1); renderDraftRels(); });
    d.appendChild(b);
    wrap.appendChild(d);
  });
}

$("fSave").addEventListener("click", () => {
  const name = $("fName").value.trim() || draftTags[0] || "Untitled";
  if(editingId){
    const it = S.items.find(i => i.id === editingId);
    it.name = name; it.tags = draftTags.slice(); it.relations = draftRels.slice();
    toast("Item updated");
  }else{
    S.items.push({id:uid(), section:S.active, name:name, tags:draftTags.slice(), relations:draftRels.slice(), replies:[], at:now(), ts:Date.now()});
  }
  capture.value = "";
  closeSheet(); renderAll(); save();
});
$("fCancel").addEventListener("click", closeSheet);
$("scrim").addEventListener("mousedown", e => { if(e.target === $("scrim")) closeSheet(); });
