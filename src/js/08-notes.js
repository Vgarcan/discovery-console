/* 08-notes.js
   Parked notes, marked moments, undo and the session name. */
/* ---------- notes and marks ---------- */
function saveNoteFrom(text){
  const t = (text || "").trim();
  if(!t) return;
  S.notes.push({id:uid(), text:t, replies:[], shots:[], at:now(), ts:Date.now()});
  renderAll(); save(); toast("Note parked");
}
$("saveNoteBtn").addEventListener("click", () => { saveNoteFrom($("noteBox").value); $("noteBox").value = ""; });
$("noteBox").addEventListener("keydown", e => {
  if((e.metaKey || e.ctrlKey) && e.key === "Enter"){ e.preventDefault(); saveNoteFrom($("noteBox").value); $("noteBox").value = ""; }
});
$("markBtn").addEventListener("click", markMoment);
function markMoment(){
  S.marks.push({id:uid(), at:now(), seconds:S.seconds, replies:[], shots:[], ts:Date.now()});
  renderAll(); save(); toast("Moment marked at " + $("clock").textContent);
}

$("undoBtn").addEventListener("click", () => {
  if(!S.items.length) return;
  S.items.pop();
  renderAll(); save(); toast("Last capture removed");
});

$("sessionName").addEventListener("input", e => { S.name = e.target.value; save(); });
