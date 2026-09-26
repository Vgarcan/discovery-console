/* 14-map.js
   Relationship map: filtering, force layout, rendering, interaction and linking. */
/* =================== MAP =================== */
const M = {
  tags:[], mode:"any", linked:true, q:"", hidden:[], sel:null,
  layout:"lanes", lanes:[],
  nodes:[], links:[], pos:{}, k:1, tx:0, ty:0,
  alpha:0, raf:0, drag:null, pan:null, W:900, H:640
};

function openMap(){
  $("mapScrim").classList.add("on");
  paintIcons("map");
  M.layout = (S.ui && S.ui.mapLayout) === "free" ? "free" : "lanes";
  sizeMap();
  rebuildMap(true);
  setTimeout(() => $("mapSearch").focus(), 40);
}
/* Everything the map remembers about the open session: filters, selection and
   the layout it settled into. A new session must inherit none of it. */
function resetMap(){
  M.sel = null; M.tags = []; M.q = ""; M.hidden = [];
  M.nodes = []; M.links = []; M.pos = {}; M.lanes = [];
  M.k = 1; M.tx = 0; M.ty = 0;
  $("mapSearch").value = "";
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
  layoutLanes();
  if(M.sel && !byId[M.sel]) M.sel = null;

  paintMapChrome();
  drawMap();
  if(reheat || M.alpha < .25){ M.alpha = reheat ? 1 : .35; runSim(); }
  else tickOnce();
}

/* ---------- labels ---------- */
/* Names are measured, not counted in characters: a fixed slot wide enough for
   the longest name wastes the space of every short one, and the bands grow
   until the whole map has to be zoomed out to fit. Two lines because that is
   what a band has room for, and because it halves the width -- the widest band
   on the sample session goes from 1430px on one line to 639px on two. */
const LABEL_MAX = 112, LABEL_LINE = 12, LABEL_CH = 5.6;
const GAP_MIN = 52, GAP_MAX = 110, LABEL_PAD = 26, LANE_SWEEPS = 10;
const MAP_FIT_PAD = 70;

let measurer;
const labelCache = new Map();

function measureLabel(str){
  if(labelCache.has(str)) return labelCache.get(str);
  if(measurer === undefined){
    try{
      const c = document.createElement("canvas").getContext("2d");
      if(c) c.font = "500 11px " + getComputedStyle(document.body).fontFamily;
      measurer = c || null;
    }catch(e){ measurer = null; }
  }
  const w = measurer ? measurer.measureText(str).width : str.length * LABEL_CH;
  labelCache.set(str, w);
  return w;
}

function clipLabel(str){
  if(measureLabel(str) <= LABEL_MAX) return str;
  let s = str;
  while(s.length > 2 && measureLabel(s + "\u2026") > LABEL_MAX) s = s.slice(0, -1);
  return s + "\u2026";
}

function labelLines(name){
  const words = String(name).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "", cut = false;
  words.forEach(w => {
    if(cut) return;
    const t = cur ? cur + " " + w : w;
    if(!cur || measureLabel(t) <= LABEL_MAX){ cur = t; return; }
    if(lines.length === 1){ cut = true; return; }
    lines.push(cur); cur = w;
  });
  if(cur) lines.push(cur);
  if(cut) lines[lines.length - 1] += " \u2026";
  return lines.map(clipLabel);
}

function labelWidth(n){
  return n.lines.length ? n.lines.reduce((a, l) => Math.max(a, measureLabel(l)), 0) : 0;
}

/* ---------- lanes ---------- */
/* One band per area, in the order the rail shows them, and only for areas that
   have something visible: a filtered map should not leave nine empty rows.

   Ordering, row assignment and band heights are one pass because they depend on
   each other -- a band is only as tall as the labels its own nodes turned out to
   need, and which row a label lands on is not known until the order settles. */
function layoutLanes(){
  M.nodes.forEach(n => {
    n.r = 5 + Math.min(7, n.deg * 1.6);
    n.lines = labelLines(n.item.name);
    n.lw = labelWidth(n);
  });
  if(M.layout !== "lanes"){
    M.lanes = [];
    M.nodes.forEach(n => { n.lane = -1; n.row = 0; n.ly = null; });
    return;
  }

  const present = SECTIONS.filter(sec => M.nodes.some(n => n.item.section === sec));
  const index = {};
  present.forEach((sec, i) => index[sec] = i);
  M.nodes.forEach(n => { n.lane = index[n.item.section]; });

  const nbr = {};
  M.nodes.forEach(n => nbr[n.id] = []);
  M.links.forEach(l => { nbr[l.s.id].push(l.t); nbr[l.t.id].push(l.s); });

  const bands = present.map((sec, i) => M.nodes.filter(n => n.lane === i));

  /* Labels alternate above and below the dot, so clearance is only needed
     between every other node. That is what lets the dots sit a gap apart
     rather than a label-width apart. */
  function place(band, gap){
    const hot = band.filter(n => nbr[n.id].length);
    const cold = band.filter(n => !nbr[n.id].length);
    const half = Math.ceil(cold.length / 2);
    const seq = cold.slice(0, half).concat(hot, cold.slice(half));
    seq.forEach((n, i) => {
      n.row = i % 2;
      if(!i){ n.lx = 0; return; }
      let x = seq[i-1].lx + gap;
      if(i >= 2) x = Math.max(x, seq[i-2].lx + (seq[i-2].lw + n.lw)/2 + LABEL_PAD);
      n.lx = x;
    });
    if(seq.length){
      const shift = M.W/2 - (seq[0].lx + seq[seq.length-1].lx)/2;
      seq.forEach(n => n.lx += shift);
    }
    band.length = 0;
    seq.forEach(n => band.push(n));
  }

  /* Order the bands at a given gap and stack them. Returns how tall the stack
     came out, which is what the spread pass needs. */
  function settle(gap){
    bands.forEach(b => place(b, gap));
    for(let sweep = 0; sweep < LANE_SWEEPS; sweep++){
      const order = sweep % 2 ? bands.slice().reverse() : bands;
      order.forEach(band => {
        const hot = band.filter(n => nbr[n.id].length);
        hot.forEach(n => {
          n.bary = nbr[n.id].reduce((a, m) => a + m.lx, 0) / nbr[n.id].length;
        });
        hot.sort((a, b) => a.bary - b.bary);
        const settled = hot.concat(band.filter(n => !nbr[n.id].length));
        band.length = 0;
        settled.forEach(n => band.push(n));
        place(band, gap);
      });
    }
    let top = 0;
    M.lanes = present.map((sec, i) => {
      const band = bands[i];
      const need = row => band.reduce((a, n) =>
        n.row === row ? Math.max(a, n.r + 8 + n.lines.length * LABEL_LINE) : a, 18);
      const above = need(0), below = need(1);
      const h = Math.max(74, above + below);
      const lane = {sec:sec, top:top, h:h, mid:top + above};
      top += h;
      return lane;
    });
    return top;
  }

  /* Two passes. The first packs the bands as tightly as the labels allow, and
     that is what decides how tall the stack has to be. The stack height already
     caps how far Fit to view can zoom in, so the second pass spends the width
     that cap leaves unused: the dots spread until the map is as wide as it is
     tall. On both sample sessions this roughly doubles the separation you
     actually see and costs nothing at all in text size, because the zoom was
     being held back by the height either way. */
  const tight = settle(GAP_MIN);
  const fit = M.H / (tight + MAP_FIT_PAD * 2);
  const budget = Math.max(0, M.W / Math.max(.25, fit) - MAP_FIT_PAD * 2);
  let steps = 0;
  bands.forEach(b => { steps = Math.max(steps, b.length - 1); });
  settle(steps ? Math.max(GAP_MIN, Math.min(GAP_MAX, budget / steps)) : GAP_MAX);

  M.nodes.forEach(n => { n.ly = M.lanes[n.lane].mid; });
}

function setLayout(mode){
  if(M.layout === mode) return;
  M.layout = mode;
  S.ui = S.ui || {};
  S.ui.mapLayout = mode;
  save();
  rebuildMap(true);
}
$("layoutLanes").addEventListener("click", () => setLayout("lanes"));
$("layoutFree").addEventListener("click", () => setLayout("free"));

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
  $("layoutLanes").classList.toggle("on", M.layout === "lanes");
  $("layoutFree").classList.toggle("on", M.layout === "free");
  $("mapEmpty").textContent = M.nodes.length ? "" :
    (S.items.length ? "No items match these filters. Clear a tag or turn an area back on."
                    : "Capture a few items first, then the map has something to draw.");
  renderMapDetail();
}

function drawLanes(){
  const g = $("mapLanes");
  g.innerHTML = "";
  if(M.layout !== "lanes" || !M.lanes.length) return;
  const NS = "http://www.w3.org/2000/svg";
  /* Wide enough that a band never ends inside the viewport, whatever the pan. */
  const x0 = -3000, w = M.W + 6000;
  M.lanes.forEach((l, i) => {
    const band = document.createElementNS(NS,"rect");
    band.setAttribute("class", "lane" + (i % 2 ? " alt" : ""));
    band.setAttribute("x", x0); band.setAttribute("y", l.top);
    band.setAttribute("width", w); band.setAttribute("height", l.h);
    g.appendChild(band);
    if(i){
      const div = document.createElementNS(NS,"line");
      div.setAttribute("class","lane-div");
      div.setAttribute("x1", x0); div.setAttribute("x2", x0 + w);
      div.setAttribute("y1", l.top); div.setAttribute("y2", l.top);
      g.appendChild(div);
    }
  });
}

/* The band names live outside the zoomable group, so they hold their size and
   stay on screen when the graph is panned sideways. Built once per rebuild;
   panning and zooming only move them, which is why this runs per frame. */
function buildLaneLabels(){
  const wrap = $("mapLaneLabels");
  wrap.innerHTML = "";
  if(M.layout !== "lanes" || !M.lanes.length) return;
  const counts = {};
  M.nodes.forEach(n => { if(!n.ghost) counts[n.item.section] = (counts[n.item.section]||0) + 1; });
  M.lanes.forEach(l => {
    const el = document.createElement("span");
    el.style.color = SEC_COLOR[l.sec];
    el.innerHTML = esc(l.sec.toLowerCase()) + "<u>" + (counts[l.sec] || 0) + "</u>";
    wrap.appendChild(el);
    l.el = el;
  });
}

function paintLaneLabels(){
  if(M.layout !== "lanes") return;
  M.lanes.forEach(l => { if(l.el) l.el.style.top = (l.mid * M.k + M.ty) + "px"; });
}

function drawMap(){
  const eg = $("mapEdges"), ng = $("mapNodes");
  eg.innerHTML = ""; ng.innerHTML = "";
  drawLanes();
  buildLaneLabels();
  const NS = "http://www.w3.org/2000/svg";

  M.links.forEach(l => {
    const line = document.createElementNS(NS,"line");
    line.setAttribute("class","edge");
    line.setAttribute("marker-end","url(#arrowEdge)");
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
    const hit = document.createElementNS(NS,"circle");
    hit.setAttribute("class","hit");
    hit.setAttribute("r", Math.max(17, n.r + 8));
    g.appendChild(hit);

    const c = document.createElementNS(NS,"circle");
    c.setAttribute("r", n.r);
    c.setAttribute("fill", SEC_COLOR[n.item.section]);
    g.appendChild(c);

    /* Alternate rows put every other label under its dot, which is the whole
       reason the dots can sit closer together than the labels are wide. */
    const t = document.createElementNS(NS,"text");
    t.setAttribute("text-anchor","middle");
    const first = n.row === 1
      ? n.r + 5 + LABEL_LINE
      : -(n.r + 6 + (n.lines.length - 1) * LABEL_LINE);
    n.lines.forEach((line, i) => {
      const ts = document.createElementNS(NS,"tspan");
      ts.setAttribute("x", 0);
      ts.setAttribute("dy", i ? LABEL_LINE : first);
      ts.textContent = line;
      t.appendChild(ts);
    });
    g.appendChild(t);
    g.addEventListener("pointerdown", e => startDrag(e, n));
    g.addEventListener("pointerenter", () => hotEdges(n.id, true));
    g.addEventListener("pointerleave", () => hotEdges(n.id, false));
    ng.appendChild(g);
    n.el = g;
  });
  applyTransform();
  tickOnce();
}

function markEdge(l, hot){
  l.el.classList.toggle("hot", !!hot);
  l.el.setAttribute("marker-end", hot ? "url(#arrowHot)" : "url(#arrowEdge)");
  l.lab.style.opacity = hot ? "1" : "0";
}

function hotEdges(id, on){
  M.links.forEach(l => {
    if(l.s.id !== id && l.t.id !== id) return;
    markEdge(l, on || M.sel === l.s.id || M.sel === l.t.id);
  });
}

function applyTransform(){
  $("mapG").setAttribute("transform","translate(" + M.tx + "," + M.ty + ") scale(" + M.k + ")");
  paintLaneLabels();
}

function tickOnce(){
  M.links.forEach(l => {
    const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
    const d = Math.max(1, Math.sqrt(dx*dx + dy*dy));
    /* Stop short of both dots, so the arrowhead lands in the gap rather than
       underneath the node it is pointing at. On a very short edge there is no
       gap to leave, so draw it centre to centre and let the arrow overlap. */
    const gs = l.s.r + 2, gt = l.t.r + 5;
    const room = d > gs + gt + 8;
    const ux = dx/d, uy = dy/d;
    const x1 = room ? l.s.x + ux*gs : l.s.x, y1 = room ? l.s.y + uy*gs : l.s.y;
    const x2 = room ? l.t.x - ux*gt : l.t.x, y2 = room ? l.t.y - uy*gt : l.t.y;
    l.el.setAttribute("x1", x1); l.el.setAttribute("y1", y1);
    l.el.setAttribute("x2", x2); l.el.setAttribute("y2", y2);
    l.lab.setAttribute("x", (x1 + x2)/2);
    l.lab.setAttribute("y", (y1 + y2)/2 - 3);
  });
  M.nodes.forEach(n => {
    n.el.setAttribute("transform","translate(" + n.x + "," + n.y + ")");
    M.pos[n.id] = {x:n.x, y:n.y};
  });
}

function physics(){
  if(M.layout === "lanes"){ physicsLanes(); return; }
  physicsFree();
}

/* orderLanes() already decided where every node goes, so there is nothing to
   relax here. This only eases each node into its slot, which is what makes
   switching layout, filtering or capturing mid-session animate rather than
   jump. It runs outside M.alpha so a node always arrives. */
function physicsLanes(){
  M.nodes.forEach(p => {
    if(M.drag && M.drag.node === p) return;
    p.vx = 0; p.vy = 0;
    p.x += (p.lx - p.x) * 0.25;
    p.y += (p.ly - p.y) * 0.25;
  });
}

function physicsFree(){
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
  if(M.layout === "lanes" && M.lanes.length){
    /* Fit the bands, not just the dots: a row holding one node still has to show
       as a row, and the band names have to land inside the view. */
    const last = M.lanes[M.lanes.length-1];
    y0 = Math.min(y0, 0); y1 = Math.max(y1, last.top + last.h);
  }
  const pad = MAP_FIT_PAD;
  const w = Math.max(80, x1-x0) + pad*2, h = Math.max(80, y1-y0) + pad*2;
  M.k = Math.max(.25, Math.min(1.7, Math.min(M.W/w, M.H/h)));
  M.tx = M.W/2 - ((x0+x1)/2) * M.k;
  M.ty = M.H/2 - ((y0+y1)/2) * M.k;
  applyTransform();
}

/* ----- interactions -----
   One pointer at a time over the stage. What a press will do is decided on
   pointerdown -- drag a node, or pan the canvas -- and neither is committed
   until the pointer has travelled DRAG_SLOP, so a click that wobbles by a pixel
   is still a click and still selects. */
const DRAG_SLOP = 4;
const ZOOM_MIN = 0.2, ZOOM_MAX = 3;

function clampZoom(k){
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, k));
}

/* Client pixels to graph units. The stage can report a zero-sized rect -- laid
   out but not yet painted, or measured while hidden -- and dividing by it turned
   every coordinate into Infinity, which then stuck to the node positions. */
function stageScale(r){
  return {x: r.width ? M.W/r.width : 1, y: r.height ? M.H/r.height : 1};
}

function toGraph(e){
  const r = $("mapSvg").getBoundingClientRect();
  const s = stageScale(r);
  return {
    x:((e.clientX - r.left) * s.x - M.tx)/M.k,
    y:((e.clientY - r.top) * s.y - M.ty)/M.k
  };
}
function grab(e){
  const svg = $("mapSvg");
  try{ if(svg.setPointerCapture && e.pointerId != null) svg.setPointerCapture(e.pointerId); }catch(err){}
}
/* Left button drags and pans; middle does the same, which is the habit from
   every other canvas. Right is left alone so the context menu still works. */
function usable(e){ return e.button === 0 || e.button === 1; }

function startDrag(e, n){
  if(M.drag || M.pan || !usable(e)) return;
  e.preventDefault(); e.stopPropagation();
  const p = toGraph(e);
  M.drag = {node:n, dx:n.x - p.x, dy:n.y - p.y, moved:false,
            x0:e.clientX, y0:e.clientY, ox:n.x, oy:n.y};
  $("mapSvg").classList.add("grabbing");
  grab(e);
}

$("mapSvg").addEventListener("pointerdown", e => {
  if(M.drag || !usable(e)) return;
  /* Stops the browser from starting a text selection under the cursor. */
  e.preventDefault();
  M.pan = {x:e.clientX, y:e.clientY, tx:M.tx, ty:M.ty, moved:false};
  $("mapSvg").classList.add("grabbing");
  grab(e);
});

$("mapSvg").addEventListener("pointermove", e => {
  if(M.drag){
    if(!M.drag.moved &&
       Math.abs(e.clientX - M.drag.x0) < DRAG_SLOP &&
       Math.abs(e.clientY - M.drag.y0) < DRAG_SLOP) return;
    M.drag.moved = true;
    const p = toGraph(e);
    M.drag.node.x = p.x + M.drag.dx;
    M.drag.node.y = p.y + M.drag.dy;
    if(M.layout === "lanes" && M.drag.node.lane > -1){
      /* Free along the band, held inside it: dragging must not undo the one
         thing the layout is there to show. */
      const l = M.lanes[M.drag.node.lane];
      M.drag.node.y = Math.max(l.top + 14, Math.min(l.top + l.h - 14, M.drag.node.y));
    }
    tickOnce();
  }else if(M.pan){
    const dx = e.clientX - M.pan.x, dy = e.clientY - M.pan.y;
    if(!M.pan.moved && Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
    M.pan.moved = true;
    const s = stageScale($("mapSvg").getBoundingClientRect());
    M.tx = M.pan.tx + dx * s.x;
    M.ty = M.pan.ty + dy * s.y;
    applyTransform();
  }
});

function endPointer(e){
  if(M.drag){
    if(!M.drag.moved) selectNode(M.drag.node.id);
    M.drag = null;
  }else if(M.pan && !M.pan.moved && M.sel){
    /* A press that landed on the canvas and went nowhere clears the selection,
       the way clicking off a thing does everywhere else. */
    selectNode(null);
  }
  M.pan = null;
  $("mapSvg").classList.remove("grabbing");
}
$("mapSvg").addEventListener("pointerup", endPointer);
$("mapSvg").addEventListener("pointercancel", endPointer);

/* Put a dropped drag back where it started. */
function cancelDrag(){
  if(!M.drag) return false;
  M.drag.node.x = M.drag.ox;
  M.drag.node.y = M.drag.oy;
  M.drag = null; M.pan = null;
  $("mapSvg").classList.remove("grabbing");
  tickOnce();
  return true;
}

$("mapSvg").addEventListener("wheel", e => {
  e.preventDefault();
  /* Firefox reports lines, Chrome pixels; normalise before either is used. */
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
  const dx = e.deltaX * unit, dy = e.deltaY * unit;

  /* A wheel event whose travel is mostly sideways is a two-finger swipe on a
     trackpad, and it should move the map rather than zoom it. A mouse wheel
     reports no horizontal travel at all, so it never lands here. A trackpad
     pinch arrives as a wheel event with ctrlKey set, and zooms. */
  if(!e.ctrlKey && Math.abs(dx) > Math.abs(dy)){
    const s = stageScale($("mapSvg").getBoundingClientRect());
    M.tx -= dx * s.x;
    M.ty -= dy * s.y;
    applyTransform();
    return;
  }

  /* Exponential, so one notch of a mouse wheel and the many small steps a
     trackpad pinch sends both feel like the same gesture. */
  const p = toGraph(e);
  const k = clampZoom(M.k * Math.exp(-Math.max(-240, Math.min(240, dy)) * 0.0016));
  M.tx += p.x * (M.k - k); M.ty += p.y * (M.k - k);
  M.k = k; applyTransform();
}, {passive:false});

function zoomBy(f){
  const k = clampZoom(M.k * f);
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
  M.links.forEach(l => markEdge(l, M.sel && (l.s.id === M.sel || l.t.id === M.sel)));
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
  /* Escape gets you out of whatever you are in the middle of: a drag first,
     and only then the map itself. */
  if(e.key === "Escape" && $("mapScrim").classList.contains("on") && !cancelDrag()) closeMap();
  if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g"){
    e.preventDefault();
    $("mapScrim").classList.contains("on") ? closeMap() : openMap();
  }
});
