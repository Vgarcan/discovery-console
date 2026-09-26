/* 09-sheet.js
   Item detail sheet: tags and the many-to-many relation editor. */
/* ---------- detail sheet ---------- */
function openSheet(id, prefillName){
  editingId = id;
  const item = id ? S.items.find(i => i.id === id) : null;
  const sec = item ? item.section : S.active;
  draftTags = item ? item.tags.slice() : (seed ? [tagOf(sec, seed)] : []);
  draftRels = item ? item.relations.slice() : [];
  freshRels = new Set();

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
  const rel = {type:type, targetId:target};
  const already = draftRels.some(r => relKey(r) === relKey(rel));
  if(!already){
    draftRels.push(rel);
    freshRels.add(relKey(rel));
  }
  $("fRelType").value = ""; $("fRelTarget").value = "";
  /* Flash the row either way. Picking one that is already there used to do
     nothing at all, which read as the menus having failed. */
  renderDraftRels(relKey(rel));
  if(already) toast("That relation is already on this item");
}

function renderDraftRels(flashKey){
  const wrap = $("fRelList");
  wrap.innerHTML = "";
  draftRels.forEach((r,i) => {
    const t = S.items.find(x => x.id === r.targetId);
    const key = relKey(r);
    const fresh = freshRels.has(key);
    const d = document.createElement("div");
    d.className = "rel" + (fresh ? " is-new" : "") + (key === flashKey ? " flash" : "");
    d.innerHTML = "<span><b>" + esc(r.type) + "</b> " + esc(t ? t.name : "missing item") +
                  (fresh ? '<em class="rel-new">new</em>' : "") + "</span>";
    const b = document.createElement("button");
    b.className = "icon-btn danger"; b.type = "button"; b.textContent = "Remove";
    b.addEventListener("click", () => {
      draftRels.splice(i,1);
      freshRels.delete(key);
      renderDraftRels();
    });
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
    S.items.push({id:uid(), section:S.active, name:name, tags:draftTags.slice(),
                  relations:draftRels.slice(), replies:[], shots:[], at:now(), ts:Date.now()});
  }
  capture.value = "";
  closeSheet(); renderAll(); save();
});
$("fCancel").addEventListener("click", closeSheet);
$("scrim").addEventListener("mousedown", e => { if(e.target === $("scrim")) closeSheet(); });
