/* 06-tape.js
   Session tape: chronological feed, colour coding, kind filter and reply threads. */
/* ---------- tape ---------- */
let lastCount = 0;
let tapeKinds = [];
const openThreads = new Set();
let focusComposer = null;

function kindColor(kind){
  if(kind === "Note") return "var(--ink-2)";
  if(kind === "Mark") return "var(--accent)";
  return SEC_COLOR[kind] || "var(--ink-3)";
}

function entities(){
  return [
    ...S.items.map(i => ({id:i.id, kind:i.section, text:i.name, at:i.at, ts:i.ts||0, ent:i})),
    ...S.notes.map(n => ({id:n.id, kind:"Note", text:n.text, at:n.at, ts:n.ts||0, ent:n})),
    ...S.marks.map((m,idx) => ({id:m.id, kind:"Mark", text:"Moment " + (idx+1), at:m.at, ts:m.ts||0, ent:m}))
  ].sort((a,b) => b.ts - a.ts);
}

/* ----- threads ----- */
function renderThread(box, ent){
  box.innerHTML = "";
  (ent.replies || []).forEach((r,idx) => {
    const d = document.createElement("div");
    d.className = "reply";
    d.innerHTML = "<time>" + esc(r.at) + "</time><span>" + esc(r.text) + "</span>";
    const rm = document.createElement("button");
    rm.className = "icon-btn danger"; rm.type = "button"; rm.textContent = "×";
    rm.title = "Delete this reply";
    rm.addEventListener("click", () => confirmAction(rm, "Confirm", () => {
      ent.replies.splice(idx,1); save(); renderAll();
    }));
    d.appendChild(rm);
    box.appendChild(d);
  });
}

function buildComposer(ent, id){
  const wrap = document.createElement("div");
  wrap.className = "composer";
  const ta = document.createElement("textarea");
  ta.className = "reply-input";
  ta.rows = 2;
  ta.placeholder = "Continue this thread. Enter to add.";
  const bar = document.createElement("div");
  bar.className = "composer-bar";
  const add = document.createElement("button");
  add.className = "btn"; add.type = "button"; add.textContent = "Add";
  const close = document.createElement("button");
  close.className = "btn btn-ghost"; close.type = "button"; close.textContent = "Close";

  const send = () => {
    const v = ta.value.trim();
    if(!v) return;
    ent.replies = ent.replies || [];
    ent.replies.push({text:v, at:now(), ts:Date.now()});
    focusComposer = id;
    save(); renderAll();
  };
  ta.addEventListener("keydown", e => {
    if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); send(); }
    if(e.key === "Escape"){ openThreads.delete(id); renderAll(); }
  });
  add.addEventListener("click", send);
  close.addEventListener("click", () => { openThreads.delete(id); renderAll(); });

  bar.appendChild(add); bar.appendChild(close);
  wrap.appendChild(ta); wrap.appendChild(bar);
  wrap.dataset.composer = id;
  return wrap;
}

function threadHtml(ent){
  if(!(ent.replies || []).length) return "";
  return '<div class="thread">' + ent.replies.map(r =>
    '<div class="reply"><time>' + esc(r.at) + "</time><span>" + esc(r.text) + "</span></div>").join("") + "</div>";
}

function threadBlock(ent, id){
  const frag = document.createDocumentFragment();
  if((ent.replies || []).length){
    const box = document.createElement("div");
    box.className = "thread";
    renderThread(box, ent);
    frag.appendChild(box);
  }
  if(openThreads.has(id)) frag.appendChild(buildComposer(ent, id));
  return frag;
}

function replyButton(ent, id){
  const b = document.createElement("button");
  b.className = "icon-btn reply-btn"; b.type = "button";
  const n = (ent.replies || []).length;
  b.innerHTML = "Reply" + (n ? ' <u class="mono">' + n + "</u>" : "");
  b.title = "Add a follow-up to this thread";
  b.addEventListener("click", () => {
    openThreads.has(id) ? openThreads.delete(id) : openThreads.add(id);
    focusComposer = openThreads.has(id) ? id : null;
    renderAll();
  });
  return b;
}

/* ----- kind filter ----- */
function renderTapeFilter(){
  const bar = $("tapeFilter");
  const all = entities();
  const counts = new Map();
  all.forEach(r => counts.set(r.kind, (counts.get(r.kind)||0) + 1));
  tapeKinds = tapeKinds.filter(k => counts.has(k));
  bar.innerHTML = "";
  if(!counts.size) return;
  [...counts.entries()].sort((a,b) => b[1]-a[1]).forEach(([k,n]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tagf kindf" + (tapeKinds.includes(k) ? " on" : "");
    b.innerHTML = '<i class="kdot' + (k === "Mark" ? " ring" : "") + '" style="' +
      (k === "Mark" ? "border-color:" : "background:") + kindColor(k) + '"></i>' + esc(k) + "<u>" + n + "</u>";
    b.addEventListener("click", () => {
      tapeKinds = tapeKinds.includes(k) ? tapeKinds.filter(x => x !== k) : tapeKinds.concat(k);
      renderTape();
    });
    bar.appendChild(b);
  });
  if(tapeKinds.length){
    const c = document.createElement("button");
    c.type = "button"; c.className = "tagf"; c.textContent = "all";
    c.addEventListener("click", () => { tapeKinds = []; renderTape(); });
    bar.appendChild(c);
  }
}

function renderTape(){
  renderTapeFilter();
  let rows = entities();
  if(tapeKinds.length) rows = rows.filter(r => tapeKinds.includes(r.kind));
  const shown = rows.slice(0,14);

  const wrap = $("tape");
  wrap.innerHTML = "";
  if(!shown.length){
    wrap.innerHTML = '<div class="empty" style="padding:.6rem 0;font-size:.8rem">' +
      (rows.length === 0 && entities().length
        ? "Nothing on the tape matches that filter."
        : "Captures, notes and marks appear here as you make them.") + "</div>";
    lastCount = 0;
    return;
  }

  shown.forEach((r,i) => {
    const d = document.createElement("div");
    d.className = "tape-row" + (i === 0 && rows.length > lastCount ? " fresh" : "");
    d.style.setProperty("--kind", kindColor(r.kind));

    const t = document.createElement("time");
    t.textContent = r.at;

    const body = document.createElement("div");
    body.className = "tbody";
    body.innerHTML =
      '<span class="k"><i class="kdot' + (r.kind === "Mark" ? " ring" : "") + '" style="' +
      (r.kind === "Mark" ? "border-color:" : "background:") + kindColor(r.kind) + '"></i>' +
      esc(r.kind) + "</span>" +
      '<span class="ttext">' + esc(r.text) + "</span>";
    body.appendChild(threadBlock(r.ent, r.id));
    body.appendChild(replyButton(r.ent, r.id));

    d.appendChild(t);
    d.appendChild(body);
    wrap.appendChild(d);
  });

  if(rows.length > shown.length){
    const m = document.createElement("div");
    m.className = "label";
    m.style.paddingTop = ".6rem";
    m.textContent = "+" + (rows.length - shown.length) + " earlier, all kept in review";
    wrap.appendChild(m);
  }
  lastCount = rows.length;

  if(focusComposer){
    const c = wrap.querySelector('[data-composer="' + focusComposer + '"] textarea');
    if(c) c.focus();
    focusComposer = null;
  }
}
