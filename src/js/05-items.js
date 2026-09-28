/* 05-items.js
   The captured-item list for the active area, with relations in both directions. */
/* ---------- items ---------- */
/* Deleting an item is three things, and it used to be spelled out in one
   place while the tape could not do it at all. Anywhere it is offered, it does
   all three: the item goes, the relations pointing at it go with it, and the
   screenshots nothing references any more are cleared out of the store. */
function deleteItem(id){
  const item = S.items.find(i => i.id === id);
  if(!item) return false;
  S.items = S.items.filter(i => i.id !== id);
  S.items.forEach(i => i.relations = i.relations.filter(r => r.targetId !== id));
  renderAll(); save();
  pruneShots();
  toast("Item deleted");
  return true;
}

function renderItems(){
  let items = inSection(S.active);
  if(stageTags.length) items = items.filter(i => stageTags.some(t => i.tags.includes(t)));
  items = items.slice().reverse();
  const total = inSection(S.active).length;
  $("listCount").textContent = stageTags.length ? items.length + " of " + total : total;
  const wrap = $("items");
  if(!items.length){
    wrap.innerHTML = stageTags.length
      ? '<div class="empty">No item in this area carries that tag.</div>'
      : '<div class="empty">Nothing captured in this area yet. Pick a type above, or just type a name and press Enter.</div>';
    return;
  }
  wrap.innerHTML = "";
  items.forEach(item => {
    const el = document.createElement("div");
    el.className = "item" + (DEF[item.section].risk ? " risk" : "");
    const tags = item.tags.length
      ? item.tags.map(t => '<span class="chip">#' + esc(t) + "</span>").join("")
      : '<span class="chip" style="opacity:.5">untagged</span>';
    const outs = item.relations.map(r => {
      const t = S.items.find(i => i.id === r.targetId);
      return t ? '<div class="rel">\u2192 <b>' + esc(r.type) + "</b> " + esc(t.name) + "</div>" : "";
    }).join("");
    const ins = incoming(item.id).map(r =>
      '<div class="rel">\u2190 ' + esc(r.from.name) + " <b>" + esc(r.type) + "</b> this</div>").join("");
    el.innerHTML =
      '<div class="item-main"><div class="item-name">' + esc(item.name) + "</div>" +
      '<div class="item-tags">' + tags + "</div>" + outs + ins + "</div>" +
      '<span class="item-time">' + esc(item.at) + "</span>" +
      '<span class="item-acts">' +
        '<button class="icon-btn" data-map="' + item.id + '" title="Show in map">Map</button>' +
        '<button class="icon-btn" data-edit="' + item.id + '" title="Edit">Edit</button>' +
        '<button class="icon-btn danger" data-del="' + item.id + '" title="Delete">Delete</button>' +
      "</span>";
    const mainEl = el.querySelector(".item-main");
    if((item.shots || []).length) mainEl.appendChild(shotThumbs(item.shots));
    mainEl.appendChild(threadBlock(item, item.id));
    mainEl.appendChild(replyButton(item, item.id));
    el.querySelector("[data-map]").addEventListener("click", () => { M.sel = item.id; M.tags = []; M.q = ""; M.hidden = []; $("mapSearch").value = ""; openMap(); });
    el.querySelector("[data-edit]").addEventListener("click", () => openSheet(item.id));
    const delBtn = el.querySelector("[data-del]");
    delBtn.addEventListener("click", () => confirmAction(delBtn, "Confirm delete",
      () => deleteItem(item.id)));
    wrap.appendChild(el);
  });
}
