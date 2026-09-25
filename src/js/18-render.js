/* 18-render.js
   The single repaint orchestrator. Any module that changes the session calls
   renderAll(); nothing repaints the whole app on its own. */
function renderAll(){
  renderChannels();
  renderTagBar();
  renderItems();
  if($("mapScrim").classList.contains("on")) rebuildMap(false);
  renderTape();
  renderGaps();
  $("cItems").textContent = S.items.length;
  $("cNotes").textContent = S.notes.length;
  $("cMarks").textContent = S.marks.length;
  $("undoBtn").disabled = !S.items.length;
}
