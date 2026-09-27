/* 13-tags.js
   Tag filtering on the stage, area colours and incoming-relation lookup. */
/* =================== TAGS AS FILTERS =================== */
const SEC_COLOR = {
  Systems:"#4BD3F2", Data:"#CCFD7F", Process:"#62FFCF", Operations:"#FFCF56",
  Rules:"#8B6CF0", People:"#DBDBD2", Exceptions:"#EF6461",
  Dependencies:"#2E9BB5", Evidence:"#9A9A93"
};
/* A session can name an area this build has never heard of -- renamed
   upstream, hand edited, written by a later version. It still has to be
   drawable, so it gets the neutral ink rather than `undefined`. */
function secColor(sec){ return SEC_COLOR[sec] || "var(--ink-3)"; }

let stageTags = [];

function tagCounts(items){
  const m = new Map();
  items.forEach(i => i.tags.forEach(t => m.set(t, (m.get(t)||0) + 1)));
  return [...m.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
}

function renderTagBar(){
  const bar = $("tagBar");
  const counts = tagCounts(inSection(S.active));
  stageTags = stageTags.filter(t => counts.some(c => c[0] === t));
  if(!counts.length){ bar.innerHTML = ""; return; }
  bar.innerHTML = '<span class="label">filter by tag</span>';
  counts.forEach(([t,n]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tagf" + (stageTags.includes(t) ? " on" : "");
    b.innerHTML = "#" + esc(t) + "<u>" + n + "</u>";
    b.addEventListener("click", () => {
      stageTags = stageTags.includes(t) ? stageTags.filter(x => x !== t) : stageTags.concat(t);
      renderTagBar(); renderItems();
    });
    bar.appendChild(b);
  });
  if(stageTags.length){
    const c = document.createElement("button");
    c.type = "button"; c.className = "tagf"; c.textContent = "clear";
    c.addEventListener("click", () => { stageTags = []; renderTagBar(); renderItems(); });
    bar.appendChild(c);
  }
}

function incoming(id){
  const out = [];
  S.items.forEach(i => i.relations.forEach(r => { if(r.targetId === id) out.push({from:i, type:r.type}); }));
  return out;
}
