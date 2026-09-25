/* 14-map.js
   Relationship map: filtering, force layout, rendering, interaction and linking. */
/* =================== MAP =================== */
const M = {
  tags:[], mode:"any", linked:true, q:"", hidden:[], sel:null,
  nodes:[], links:[], pos:{}, k:1, tx:0, ty:0,
  alpha:0, raf:0, drag:null, pan:null, W:900, H:640
};

function openMap(){
  $("mapScrim").classList.add("on");
  paintIcons("map");
  sizeMap();
  rebuildMap(true);
  setTimeout(() => $("mapSearch").focus(), 40);
}
function closeMap(){
  $("mapScrim").classList.remove("on");
  cancelAnimationFrame(M.raf); M.raf = 0; M.alpha = 0;
  paintIcons(currentView);
}
function sizeMap(){
  const r = $("mapStage").getBoundingClientRect();
  M.W = Math.max(320, r.width); M.H = Math.max(240, r.height);
  $("mapSvg").setAttribute("viewBox", "0 0 " + M.W + " " + M.H);
}

function mapMatches(i){
  if(M.hidden.includes(i.section)) return false;
  if(M.tags.length){
    const ok = M.mode === "any" ? M.tags.some(t => i.tags.includes(t)) : M.tags.every(t => i.tags.includes(t));
    if(!ok) return false;
  }
  if(M.q){
    const hay = (i.name + " " + i.tags.join(" ")).toLowerCase();
    if(!hay.includes(M.q)) return false;
  }
  return true;
}

function rebuildMap(reheat){
  const core = S.items.filter(mapMatches);
  const coreIds = new Set(core.map(i => i.id));
  const ghostIds = new Set();

  if(M.linked && (M.tags.length || M.q || M.hidden.length)){
    S.items.forEach(i => {
      i.relations.forEach(r => {
        if(coreIds.has(i.id) && !coreIds.has(r.targetId)) ghostIds.add(r.targetId);
        if(coreIds.has(r.targetId) && !coreIds.has(i.id)) ghostIds.add(i.id);
      });
    });
  }

  const nodes = [];
  S.items.forEach(i => {
    const isCore = coreIds.has(i.id);
    const isGhost = !isCore && ghostIds.has(i.id) && !M.hidden.includes(i.section);
    if(!isCore && !isGhost) return;
    const p = M.pos[i.id] || {
      x:M.W/2 + (Math.random()-.5)*Math.min(M.W,M.H)*.6,
      y:M.H/2 + (Math.random()-.5)*Math.min(M.W,M.H)*.6
    };
    M.pos[i.id] = p;
    nodes.push({id:i.id, item:i, ghost:isGhost, x:p.x, y:p.y, vx:0, vy:0, deg:0});
  });

  const byId = {};
  nodes.forEach(n => byId[n.id] = n);
  const links = [];
  S.items.forEach(i => i.relations.forEach(r => {
    if(byId[i.id] && byId[r.targetId]){
      links.push({s:byId[i.id], t:byId[r.targetId], type:r.type});
      byId[i.id].deg++; byId[r.targetId].deg++;
    }
  }));

  M.nodes = nodes; M.links = links;
  if(M.sel && !byId[M.sel]) M.sel = null;

  paintMapChrome();
  drawMap();
  if(reheat || M.alpha < .25){ M.alpha = reheat ? 1 : .35; runSim(); }
  else tickOnce();
}

function paintMapChrome(){
  const core = M.nodes.filter(n => !n.ghost).length;
  const ghosts = M.nodes.length - core;
  $("mapCount").textContent = core + (core === 1 ? " item" : " items") +
    (ghosts ? " plus " + ghosts + " linked" : "") + ", " + M.links.length +
    (M.links.length === 1 ? " relation" : " relations");

  const counts = tagCounts(S.items);
  const tl = $("mapTags");
  tl.innerHTML = "";
  if(!counts.length){
    tl.innerHTML = '<span class="label">no tags yet</span>';
  }else{
    counts.forEach(([t,n]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tagf" + (M.tags.includes(t) ? " on" : "");
      b.innerHTML = "#" + esc(t) + "<u>" + n + "</u>";
      b.addEventListener("click", () => {
        M.tags = M.tags.includes(t) ? M.tags.filter(x => x !== t) : M.tags.concat(t);
        rebuildMap(true);
      });
      tl.appendChild(b);
    });
  }

  const lg = $("mapLegend");
  lg.innerHTML = "";
  SECTIONS.forEach(sec => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = M.hidden.includes(sec) ? "off" : "";
    b.innerHTML = '<i style="background:' + SEC_COLOR[sec] + '"></i>' + esc(sec) +
                  "<u>" + inSection(sec).length + "</u>";
    b.addEventListener("click", () => {
      M.hidden = M.hidden.includes(sec) ? M.hidden.filter(x => x !== sec) : M.hidden.concat(sec);
      rebuildMap(true);
    });
    lg.appendChild(b);
  });

  $("modeAny").classList.toggle("on", M.mode === "any");
  $("modeAll").classList.toggle("on", M.mode === "all");
  $("mapEmpty").textContent = M.nodes.length ? "" :
    (S.items.length ? "No items match these filters. Clear a tag or turn an area back on."
                    : "Capture a few items first, then the map has something to draw.");
  renderMapDetail();
}

function drawMap(){
  const eg = $("mapEdges"), ng = $("mapNodes");
  eg.innerHTML = ""; ng.innerHTML = "";
  const NS = "http://www.w3.org/2000/svg";

  M.links.forEach(l => {
    const line = document.createElementNS(NS,"line");
    line.setAttribute("class","edge");
    const lab = document.createElementNS(NS,"text");
    lab.setAttribute("class","elabel");
    lab.setAttribute("text-anchor","middle");
    lab.style.opacity = "0";
    lab.textContent = l.type;
    eg.appendChild(line); eg.appendChild(lab);
    l.el = line; l.lab = lab;
  });

  M.nodes.forEach(n => {
    const g = document.createElementNS(NS,"g");
    g.setAttribute("class","node" + (n.ghost ? " ghost" : "") + (M.sel === n.id ? " sel" : ""));
    const c = document.createElementNS(NS,"circle");
    const r = 5 + Math.min(7, n.deg * 1.6);
    c.setAttribute("r", r);
    c.setAttribute("fill", SEC_COLOR[n.item.section]);
    const t = document.createElementNS(NS,"text");
    t.setAttribute("text-anchor","middle");
    t.setAttribute("dy", -(r + 6));
    t.textContent = n.item.name.length > 26 ? n.item.name.slice(0,25) + "…" : n.item.name;
    g.appendChild(c); g.appendChild(t);
    g.addEventListener("pointerdown", e => startDrag(e, n));
    g.addEventListener("pointerenter", () => hotEdges(n.id, true));
    g.addEventListener("pointerleave", () => hotEdges(n.id, false));
    ng.appendChild(g);
    n.el = g; n.r = r;
  });
  applyTransform();
  tickOnce();
}

function hotEdges(id, on){
  M.links.forEach(l => {
    if(l.s.id === id || l.t.id === id){
      l.el.classList.toggle("hot", on || M.sel === l.s.id || M.sel === l.t.id);
      l.lab.style.opacity = (on || M.sel === l.s.id || M.sel === l.t.id) ? "1" : "0";
    }
  });
}

function applyTransform(){
  $("mapG").setAttribute("transform","translate(" + M.tx + "," + M.ty + ") scale(" + M.k + ")");
}

function tickOnce(){
  M.links.forEach(l => {
    l.el.setAttribute("x1", l.s.x); l.el.setAttribute("y1", l.s.y);
    l.el.setAttribute("x2", l.t.x); l.el.setAttribute("y2", l.t.y);
    l.lab.setAttribute("x", (l.s.x + l.t.x)/2);
    l.lab.setAttribute("y", (l.s.y + l.t.y)/2 - 3);
  });
  M.nodes.forEach(n => {
    n.el.setAttribute("transform","translate(" + n.x + "," + n.y + ")");
    M.pos[n.id] = {x:n.x, y:n.y};
  });
}

function physics(){
  const n = M.nodes, cx = M.W/2, cy = M.H/2;
  for(let i=0;i<n.length;i++){
    for(let j=i+1;j<n.length;j++){
      let dx = n[j].x - n[i].x, dy = n[j].y - n[i].y;
      let d2 = dx*dx + dy*dy;
      if(d2 < 1){ dx = Math.random()-.5; dy = Math.random()-.5; d2 = 1; }
      if(d2 > 360000) continue;
      const f = 6000 / d2;
      const d = Math.sqrt(d2);
      const ux = dx/d, uy = dy/d;
      n[i].vx -= ux*f; n[i].vy -= uy*f;
      n[j].vx += ux*f; n[j].vy += uy*f;
    }
  }
  M.links.forEach(l => {
    const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
    const d = Math.max(1, Math.sqrt(dx*dx + dy*dy));
    const f = (d - 130) * 0.015;
    const ux = dx/d, uy = dy/d;
    l.s.vx += ux*f; l.s.vy += uy*f;
    l.t.vx -= ux*f; l.t.vy -= uy*f;
  });
  n.forEach(p => {
    p.vx += (cx - p.x) * 0.006;
    p.vy += (cy - p.y) * 0.006;
    if(M.drag && M.drag.node === p){ p.vx = 0; p.vy = 0; return; }
    p.vx *= .82; p.vy *= .82;
    p.x += Math.max(-24, Math.min(24, p.vx)) * M.alpha;
    p.y += Math.max(-24, Math.min(24, p.vy)) * M.alpha;
  });
}

function runSim(){
  cancelAnimationFrame(M.raf);
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if(reduce){
    for(let i=0;i<220;i++){ M.alpha = 1 - i/220; physics(); }
    M.alpha = 0; tickOnce(); fitMap(); return;
  }
  let first = true;
  const step = () => {
    physics(); tickOnce();
    M.alpha -= .012;
    if(M.alpha > 0){ M.raf = requestAnimationFrame(step); }
    else { M.alpha = 0; if(first){ first = false; fitMap(); } }
  };
  M.raf = requestAnimationFrame(step);
}

function fitMap(){
  if(!M.nodes.length){ M.k = 1; M.tx = 0; M.ty = 0; applyTransform(); return; }
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  M.nodes.forEach(n => { x0=Math.min(x0,n.x); y0=Math.min(y0,n.y); x1=Math.max(x1,n.x); y1=Math.max(y1,n.y); });
  const pad = 70;
  const w = Math.max(80, x1-x0) + pad*2, h = Math.max(80, y1-y0) + pad*2;
  M.k = Math.max(.25, Math.min(1.7, Math.min(M.W/w, M.H/h)));
  M.tx = M.W/2 - ((x0+x1)/2) * M.k;
  M.ty = M.H/2 - ((y0+y1)/2) * M.k;
  applyTransform();
}

/* ----- interactions ----- */
function toGraph(e){
  const r = $("mapSvg").getBoundingClientRect();
  return {
    x:((e.clientX - r.left) * (M.W/r.width) - M.tx)/M.k,
    y:((e.clientY - r.top) * (M.H/r.height) - M.ty)/M.k
  };
}
function grab(e){
  const svg = $("mapSvg");
  try{ if(svg.setPointerCapture && e.pointerId != null) svg.setPointerCapture(e.pointerId); }catch(err){}
}
function startDrag(e, n){
  e.preventDefault(); e.stopPropagation();
  const p = toGraph(e);
  M.drag = {node:n, dx:n.x - p.x, dy:n.y - p.y, moved:false};
  grab(e);
}
$("mapSvg").addEventListener("pointerdown", e => {
  if(M.drag) return;
  M.pan = {x:e.clientX, y:e.clientY, tx:M.tx, ty:M.ty};
  $("mapSvg").classList.add("grabbing");
  grab(e);
});
$("mapSvg").addEventListener("pointermove", e => {
  if(M.drag){
    const p = toGraph(e);
    M.drag.node.x = p.x + M.drag.dx;
    M.drag.node.y = p.y + M.drag.dy;
    M.drag.moved = true;
    tickOnce();
  }else if(M.pan){
    const r = $("mapSvg").getBoundingClientRect();
    M.tx = M.pan.tx + (e.clientX - M.pan.x) * (M.W/r.width);
    M.ty = M.pan.ty + (e.clientY - M.pan.y) * (M.H/r.height);
    applyTransform();
  }
});
function endPointer(e){
  if(M.drag){
    if(!M.drag.moved) selectNode(M.drag.node.id);
    M.drag = null;
  }
  M.pan = null;
  $("mapSvg").classList.remove("grabbing");
}
$("mapSvg").addEventListener("pointerup", endPointer);
$("mapSvg").addEventListener("pointercancel", endPointer);
$("mapSvg").addEventListener("wheel", e => {
  e.preventDefault();
  const p = toGraph(e);
  const k = Math.max(.2, Math.min(3, M.k * (e.deltaY < 0 ? 1.12 : .89)));
  M.tx += p.x * (M.k - k); M.ty += p.y * (M.k - k);
  M.k = k; applyTransform();
}, {passive:false});

function zoomBy(f){
  const k = Math.max(.2, Math.min(3, M.k * f));
  const cx = M.W/2, cy = M.H/2;
  M.tx = cx - (cx - M.tx) * (k/M.k);
  M.ty = cy - (cy - M.ty) * (k/M.k);
  M.k = k; applyTransform();
}
$("zoomIn").addEventListener("click", () => zoomBy(1.2));
$("zoomOut").addEventListener("click", () => zoomBy(.83));
$("mapFit").addEventListener("click", fitMap);
$("mapClose").addEventListener("click", closeMap);
$("mapScrim").addEventListener("mousedown", e => { if(e.target === $("mapScrim")) closeMap(); });
$("mapClear").addEventListener("click", () => {
  M.tags = []; M.q = ""; M.hidden = []; $("mapSearch").value = "";
  rebuildMap(true);
});
$("mapSearch").addEventListener("input", e => { M.q = e.target.value.trim().toLowerCase(); rebuildMap(false); });
$("modeAny").addEventListener("click", () => { M.mode = "any"; rebuildMap(true); });
$("modeAll").addEventListener("click", () => { M.mode = "all"; rebuildMap(true); });
$("mapLinked").addEventListener("change", e => { M.linked = e.target.checked; rebuildMap(true); });

function selectNode(id){
  M.sel = M.sel === id ? null : id;
  M.nodes.forEach(n => n.el.classList.toggle("sel", n.id === M.sel));
  M.links.forEach(l => {
    const hot = M.sel && (l.s.id === M.sel || l.t.id === M.sel);
    l.el.classList.toggle("hot", !!hot);
    l.lab.style.opacity = hot ? "1" : "0";
  });
  renderMapDetail();
}

/* ----- detail panel and many-to-many linking ----- */
let linkPicks = [];
function renderMapDetail(){
  const body = $("mapBody"), panel = $("mapDetail");
  const item = M.sel ? S.items.find(i => i.id === M.sel) : null;
  if(!item){ body.classList.remove("detail"); panel.innerHTML = ""; return; }
  body.classList.add("detail");

  const out = item.relations.map(r => ({dir:"out", type:r.type, other:S.items.find(i => i.id === r.targetId)})).filter(r => r.other);
  const inc = incoming(item.id).map(r => ({dir:"in", type:r.type, other:r.from}));

  panel.innerHTML =
    '<span class="label">' + esc(item.section.toLowerCase()) + "</span>" +
    "<h3>" + esc(item.name) + "</h3>" +
    '<div class="taglist" id="dTags" style="margin:.5rem 0 1rem"></div>' +
    '<span class="label">relations (' + (out.length + inc.length) + ")</span>" +
    '<div id="dLinks" style="margin-bottom:1rem"></div>' +
    '<span class="label">link to other items</span>' +
    '<select class="inp" id="dType" style="margin-top:.4rem">' +
      '<option value="">Pick a relation type</option>' +
      ["reads from","writes to","connects to","sends to","receives from","depends on","owned by","triggered by","used by","relates to"]
        .map(o => "<option>" + o + "</option>").join("") +
    "</select>" +
    '<input class="mapsearch" id="dFind" placeholder="Filter the list" style="margin-top:.4rem">' +
    '<div class="picker" id="dPicker"></div>' +
    '<button class="btn btn-solid" id="dLink" style="width:100%;margin-top:.5rem">Create links</button>';

  const dt = $("dTags");
  if(!item.tags.length) dt.innerHTML = '<span class="label">untagged</span>';
  item.tags.forEach(t => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tagf" + (M.tags.includes(t) ? " on" : "");
    b.textContent = "#" + t;
    b.title = "Filter the map by this tag";
    b.addEventListener("click", () => {
      M.tags = M.tags.includes(t) ? M.tags.filter(x => x !== t) : M.tags.concat(t);
      rebuildMap(true);
    });
    dt.appendChild(b);
  });

  const dl = $("dLinks");
  if(!out.length && !inc.length) dl.innerHTML = '<div class="empty" style="padding:.5rem 0;font-size:.79rem">No relations yet.</div>';
  out.concat(inc).forEach(r => {
    const row = document.createElement("div");
    row.className = "linkrow";
    row.innerHTML = '<span class="dir">' + (r.dir === "out" ? "→" : "←") + "</span>" +
                    "<span><em>" + esc(r.type) + "</em> " + esc(r.other.name) + "</span>";
    const rm = document.createElement("button");
    rm.className = "icon-btn danger"; rm.type = "button"; rm.textContent = "×";
    rm.title = "Remove this relation";
    rm.addEventListener("click", () => confirmAction(rm, "Confirm", () => {
      const src = r.dir === "out" ? item : r.other;
      const tgt = r.dir === "out" ? r.other : item;
      src.relations = src.relations.filter(x => !(x.targetId === tgt.id && x.type === r.type));
      save(); renderAll(); rebuildMap(false);
    }));
    row.appendChild(rm);
    dl.appendChild(row);
  });

  linkPicks = [];
  paintPicker("");
  $("dFind").addEventListener("input", e => paintPicker(e.target.value.trim().toLowerCase()));
  $("dLink").addEventListener("click", () => {
    const type = $("dType").value;
    if(!type){ toast("Pick a relation type first"); return; }
    if(!linkPicks.length){ toast("Tick at least one item"); return; }
    linkPicks.forEach(id => {
      if(id === item.id) return;
      if(!item.relations.some(r => r.targetId === id && r.type === type)) item.relations.push({type:type, targetId:id});
    });
    toast(linkPicks.length + (linkPicks.length === 1 ? " link created" : " links created"));
    linkPicks = [];
    save(); renderAll(); rebuildMap(false);
  });

  function paintPicker(q){
    const p = $("dPicker");
    p.innerHTML = "";
    const list = S.items.filter(i => i.id !== item.id &&
      (!q || (i.name + " " + i.tags.join(" ")).toLowerCase().includes(q)));
    if(!list.length){ p.innerHTML = '<div class="empty" style="padding:.5rem;font-size:.78rem">Nothing to link to.</div>'; return; }
    list.forEach(i => {
      const l = document.createElement("label");
      l.innerHTML = '<input type="checkbox"' + (linkPicks.includes(i.id) ? " checked" : "") + ">" +
                    "<span>" + esc(i.name) + "</span><em>" + esc(i.section.toLowerCase()) + "</em>";
      l.querySelector("input").addEventListener("change", e => {
        linkPicks = e.target.checked ? linkPicks.concat(i.id) : linkPicks.filter(x => x !== i.id);
      });
      p.appendChild(l);
    });
  }
}

window.addEventListener("resize", () => {
  if(!$("mapScrim").classList.contains("on")) return;
  sizeMap(); fitMap();
});
document.addEventListener("keydown", e => {
  if(e.key === "Escape" && $("mapScrim").classList.contains("on")) closeMap();
  if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g"){
    e.preventDefault();
    $("mapScrim").classList.contains("on") ? closeMap() : openMap();
  }
});
