/* 16-pdd.js
   PDD draft: maps captured evidence onto the approved PDD template, renders it and exports Markdown. */
/* =================== PDD DRAFT =================== */
/* Two ways a field can be empty, and the difference matters to whoever reads
   the draft. TBC: the question belongs to the walkthrough and has not been
   answered yet, so chase it. NA: the console has no field that could ever
   carry it, so it falls to the analyst to fill in by hand. Both print as TBC
   in the template; only TBC counts against the evidence score. */
const TBC = null;

/* A cell the console has no way to capture. It still carries a key, because the
   analyst can type into it in the draft itself and that has to land somewhere
   that survives a reload and an export. Keys are built from item ids rather
   than names, so renaming a system keeps whatever was filed against it. */
function NA(key){
  return {byHand:true, key:key, value:(S.manual && S.manual[key]) || ""};
}

function byTag(sec, ...tags){
  return inSection(sec).filter(i => tags.some(t => i.tags.includes(t)));
}
function firstReply(i){
  return (i.replies && i.replies[0]) ? i.replies[0].text : "";
}
function joinNames(items){
  return items.length ? items.map(i => i.name + (firstReply(i) ? " (" + firstReply(i) + ")" : "")).join("; ") : TBC;
}
function today(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

/* Screenshots hang off whatever they were captured against -- a system, a
   note, a marked moment, a reply in a thread -- and 2.9 is where the template
   asks for all of them, so it collects from everywhere rather than only from
   the Evidence area. */
function shotOwners(){
  const out = [];
  const add = (label, e) => {
    const ids = (e.shots || []).slice();
    (e.replies || []).forEach(r => (r.shots || []).forEach(id => ids.push(id)));
    if(ids.length) out.push({name:label, note:firstReply(e), shots:ids});
  };
  S.items.forEach(i => add(i.name + " — " + i.section.toLowerCase(), i));
  S.notes.forEach(n => add("Parked note", n));
  S.marks.forEach((m, i) => add((m.label || "").trim() || "Moment " + (i + 1), m));
  return out;
}

/* What the analyst has placed into one document slot by hand. */
const PDD_MAP_SLOT = "2.2|map";
function slotShots(key){
  return ((S.pddShots && S.pddShots[key]) || []).filter(id => S.shots[id]);
}

function pddModel(){
  const sys = inSection("Systems"), data = inSection("Data"), proc = inSection("Process"),
        ops = inSection("Operations"), rules = inSection("Rules"), ppl = inSection("People"),
        exc = inSection("Exceptions"), dep = inSection("Dependencies"), ev = inSection("Evidence");

  /* Remote belongs to accessOf only. Letting it answer both columns made one
     captured tag assert an environment the client never stated. */
  const envOf = i => (i.tags.find(t => ["Cloud","On-prem"].includes(t))) || TBC;
  const accessOf = i => (i.tags.find(t => ["Web UI","Desktop UI","Terminal UI","API","File transfer","Remote"].includes(t))) || TBC;
  const ownerOf = i => (i.tags.find(t => ["Internal","Third party","Custom"].includes(t))) || TBC;
  const formatOf = i => (i.tags.find(t => ["Excel","CSV","PDF","Email","Database record","Document"].includes(t))) || TBC;

  const inputs = byTag("Data","Input");
  const outputs = byTag("Data","Output");
  const flow = byTag("Process","Flow cue","Trigger","End","Variation");

  return [
   {no:"1", title:"Process Information", head:true},

   {no:"1.1", title:"Version Control", blocks:[
     {type:"table", columns:["Version No.","Change Description","Date","Author"],
      rows:[["1.0","Initial Documentation", today(), NA("1.1|author")]]}
   ]},

   {no:"1.2", title:"RPA Projects Team", blocks:[
     {type:"table", columns:["Role","Organization","Name","Contact No. / Email Address"],
      rows: ppl.length ? ppl.map(p => [
        p.tags.find(t => ["SME","Process owner","Team","Approval","Escalation"].includes(t)) || TBC,
        p.tags.includes("External") ? "External" : (p.tags.includes("Internal") ? "Internal" : TBC),
        p.name, NA("1.2|contact|" + p.id)
      ]) : [[TBC,TBC,TBC,NA("1.2|contact|none")]]}
   ]},

   {no:"1.3", title:"General Process Information", blocks:[
     {type:"field", label:"Process frequency", value:joinNames(byTag("Operations","Frequency"))},
     {type:"field", label:"Manual processing time per item", value:joinNames(byTag("Operations","Manual effort"))},
     {type:"field", label:"Expected volumes", value:joinNames(byTag("Operations","Volume","Peak"))},
     {type:"field", label:"Schedule and Time Constraints", value:joinNames(byTag("Operations","Schedule","Cutoff"))},
     {type:"list", label:"Dependencies", items:dep.map(d =>
        d.name + (d.tags.length ? " — " + d.tags.join(", ") : "") + (firstReply(d) ? ". " + firstReply(d) : ""))},
     {type:"field", label:"Exception Rate", value:joinNames(byTag("Operations","Exception rate"))},
     {type:"field", label:"Orchestrator Available/Link", value:NA("1.3|orchestrator"),
      hint:"Platform detail, not a walkthrough question."},
     {type:"field", label:"Attended/Unattended Process(es)", value:NA("1.3|attended"),
      hint:"Agreed classification, not a Business Analyst decision."},
     {type:"field", label:"(In)Stability Factors", value:NA("1.3|stability"),
      hint:"Known slow reports or intermittent application behaviour."},
     {type:"list", label:"External Sources of Information",
      items:byTag("Process","External source","External").concat(byTag("Dependencies","Third party","External"))
        .map(i => i.name)}
   ]},

   {no:"1.4", title:"Applications & Environments", blocks:[
     {type:"table", columns:["App/System","Environment","Access Type","Access Granted","URL/Details","User Details","Owner"],
      rows: sys.length ? sys.map(s => [s.name, envOf(s), accessOf(s), NA("1.4|granted|" + s.id),
                                       firstReply(s) || TBC, NA("1.4|user|" + s.id), ownerOf(s)])
                       : [[TBC,TBC,TBC,NA("1.4|granted|none"),TBC,NA("1.4|user|none"),TBC]],
      note:"Never record passwords, MFA codes or tokens here. Document the access method or credential store instead."}
   ]},

   {no:"1.5", title:"Specific Infrastructure/Environment Requirements", blocks:[
     {type:"list", label:"", items:byTag("Dependencies","Environment","Approval")
        .concat(byTag("Systems","Remote","On-prem"))
        .map(i => i.name + (firstReply(i) ? " — " + firstReply(i) : ""))}
   ]},

   {no:"2", title:"Process Design", head:true},

   {no:"2.1", title:"Process Description", blocks:[
     {type:"field", label:"Business purpose", value:joinNames(byTag("Process","Purpose"))},
     {type:"field", label:"Trigger / initiation", value:joinNames(byTag("Process","Trigger"))},
     {type:"field", label:"Result / end state", value:joinNames(byTag("Process","End"))},
     {type:"field", label:"Principal systems", value: sys.length ? sys.map(s => s.name).join(", ") : TBC},
     {type:"hint", text:"Write this up as one short paragraph: trigger, objective, major phases, final result."}
   ]},

   /* This section is the authoritative As-Is map, not a pile of whatever was
      screenshotted during the call. It used to fill itself from every piece of
      evidence in the session, which put green-screen captures where a process
      diagram belongs. It is a by-hand slot now, like the fields the console
      has no way to capture: the analyst puts the map there. */
   {no:"2.2", title:"Process Map(s)", blocks:[
     {type:"figures", key:PDD_MAP_SLOT, label:"Process map",
      hint:"Paste or choose the map itself — a diagram, or a picture of the " +
           "relationship map. Nothing lands here on its own."},
     {type:"list", label:"Available references",
      items:byTag("Evidence","Recording","URL","SOP","Screenshot").map(e => e.name + (firstReply(e) ? " — " + firstReply(e) : ""))},
     {type:"hint", text:"Insert the authoritative As-Is map only when the real current-project file exists. Never fabricate a link."}
   ]},

   {no:"2.3", title:"Detailed AS IS Process Steps Breakdown", blocks:[
     {type:"numbered", label:"Captured flow markers", items:flow.map(f =>
        f.name + (f.tags.length ? " [" + f.tags.join(", ") + "]" : "") + (firstReply(f) ? ". " + firstReply(f) : ""))},
     {type:"hint", text:"High-to-mid level only, derived from the validated As-Is map. Do not transcribe click by click."}
   ]},

   {no:"2.4", title:"Process Scope", blocks:[
     {type:"list", label:"In-Scope", items:byTag("Process","In scope").map(i => i.name)},
     {type:"list", label:"Out-of-Scope", items:byTag("Process","Out of scope").map(i => i.name)}
   ]},

   {no:"2.5", title:"Inputs/Outputs", blocks:[
     {type:"table", label:"Inputs", columns:["Name","Description","Format","Location","Owner","Provider"],
      rows: inputs.length ? inputs.map(i => [i.name, firstReply(i) || TBC, formatOf(i),
              NA("2.5|loc|" + i.id), NA("2.5|owner|" + i.id), NA("2.5|prov|" + i.id)])
                          : [[TBC,TBC,TBC,NA("2.5|loc|none"),NA("2.5|owner|none"),NA("2.5|prov|none")]]},
     {type:"table", label:"Outputs", columns:["Name","Description","Format","Location","Owner","Provider"],
      rows: outputs.length ? outputs.map(i => [i.name, firstReply(i) || TBC, formatOf(i),
              NA("2.5|loc|" + i.id), NA("2.5|owner|" + i.id), NA("2.5|prov|" + i.id)])
                           : [[TBC,TBC,TBC,NA("2.5|loc|none"),NA("2.5|owner|none"),NA("2.5|prov|none")]],
      note:"Business-level artifacts only. Granular runtime values belong in the IOE."}
   ]},

   {no:"2.6", title:"Process Exceptions / Business Rules", blocks:[
     {type:"table", label:"Exceptions", columns:["No.","Exception Type","Exception Code / Message","Process / Business Action"],
      rows: exc.length ? exc.map((e,idx) => [
        String(idx+1),
        e.tags.find(t => DEF.Exceptions.tags.includes(t)) || TBC,
        e.name,
        firstReply(e) || TBC
      ]) : [[TBC,TBC,TBC,TBC]],
      note:"A reply on an exception in the tape becomes its business action here."},
     {type:"list", label:"Business rules", items:rules.map(r =>
        r.name + (r.tags.length ? " [" + r.tags.join(", ") + "]" : "") + (firstReply(r) ? ". " + firstReply(r) : ""))}
   ]},

   {no:"2.7", title:"SLAs and Deadlines", blocks:[
     {type:"list", label:"", items:byTag("Operations","SLA","Cutoff","Schedule").map(o =>
        o.name + (firstReply(o) ? " — " + firstReply(o) : ""))}
   ]},

   {no:"2.8", title:"Business Reporting Requirements", blocks:[
     {type:"list", label:"", items:byTag("Evidence","Report").concat(byTag("Data","Report"))
        .map(i => i.name + (firstReply(i) ? " — " + firstReply(i) : ""))}
   ]},

   {no:"2.9", title:"Screenshots/Video", blocks:[
     {type:"gallery", items:shotOwners(),
      note:"Captured during the walkthrough. Each one is filed under the project id, " +
           "not the process name, so a renamed session keeps its evidence."},
     {type:"list", label:"Other references", items:ev.map(e => e.name + (e.tags.length ? " [" + e.tags.join(", ") + "]" : ""))}
   ]},

   {no:"2.10", title:"Sign Off", blocks:[
     {type:"table", columns:["Name","Role","Signature","Date"], rows:[["","","",""]],
      note:"Intentionally blank until sign-off. Not a TBC."}
   ]}
  ];
}

/* ----- render ----- */
/* Every cell the template asks for is scored on its own. Scoring a table as a
   single unit let one system name stand in for sixteen empty cells, which is how
   the draft came to report 89% of a document that was 73% filled. Version Control
   and Sign Off stay out of the count, as they always did. */
function pddStats(model){
  let filled = 0, total = 0, byHand = 0;

  function score(v){
    /* Typed by hand counts as neither captured evidence nor still outstanding,
       so the second figure counts down as the analyst works through them. */
    if(v && v.byHand){ if(!v.value) byHand++; return; }
    if(v === "") return;
    total++;
    if(v) filled++;
  }

  model.forEach(s => {
    if(s.head || s.no === "1.1" || s.no === "2.10") return;
    (s.blocks||[]).forEach(b => {
      if(b.type === "field"){ score(b.value); return; }
      if(b.type === "list" || b.type === "numbered"){ score(b.items && b.items.length ? true : TBC); return; }
      /* 2.9 gathers what was captured, so it is not a field anybody answers.
         2.2 is a slot somebody has to fill, so it is scored exactly like the
         other by-hand fields: outstanding until it has something in it. */
      if(b.type === "gallery") return;
      if(b.type === "figures"){ score({byHand:true, value:slotShots(b.key).length}); return; }
      if(b.type === "table") b.rows.forEach(r => r.forEach(c => score(c)));
    });
  });
  return {filled:filled, total:total, byHand:byHand};
}

/* Per-section fill, so Review can report what the template actually holds
   instead of how many items happened to be captured near it. */
function pddSectionFill(){
  const out = {};
  pddModel().forEach(s => { if(!s.head) out[s.no] = pddStats([s]); });
  return out;
}

function cell(v){
  if(v && v.byHand){
    const attrs = ' data-mk="' + esc(v.key) + '" tabindex="0" role="button"';
    return v.value
      ? '<span class="pdd-hand"' + attrs + ' title="Typed by hand. Click to change.">' +
        esc(v.value) + "</span>"
      : '<span class="tbc byhand"' + attrs +
        ' title="The console has no field for this. Click to type it in.">TBC</span>';
  }
  return v ? esc(v) : '<span class="tbc">TBC</span>';
}

/* Click a by-hand cell and it becomes an input where it stands. Everything in
   the draft is derived from the session, so the typed value lives in the
   session too and the draft is rebuilt from it. */
let editingCell = null;

function editManualCell(host){
  if(editingCell) return;
  const key = host.dataset.mk;
  editingCell = key;
  const input = document.createElement("input");
  input.className = "pdd-input";
  input.value = (S.manual && S.manual[key]) || "";
  input.placeholder = "Type it in";
  host.replaceWith(input);
  input.focus();
  input.select();

  let closed = false;
  const close = keep => {
    if(closed) return;
    closed = true;
    editingCell = null;
    if(keep){
      const val = input.value.trim();
      S.manual = S.manual || {};
      if(val) S.manual[key] = val; else delete S.manual[key];
      save();
    }
    renderPDD();
  };
  input.addEventListener("keydown", e => {
    if(e.key === "Enter"){ e.preventDefault(); close(true); }
    if(e.key === "Escape"){ e.preventDefault(); close(false); }
  });
  input.addEventListener("blur", () => close(true));
}

/* ----- images placed into a document slot ----- */
function addSlotShot(key, file){
  if(!file) return;
  takeShot(file).then(id => {
    if(!id) return;
    S.pddShots = S.pddShots || {};
    S.pddShots[key] = (S.pddShots[key] || []).concat(id);
    save();
    renderPDD();
  });
}

$("pddDoc").addEventListener("click", e => {
  const drop = e.target.closest("[data-drop]");
  if(drop){
    const key = drop.dataset.drop, id = drop.dataset.id;
    /* Taking a picture out of the document is not deleting it: it may still be
       hanging off the item it was captured against. The prune is what decides
       whether the bytes go, and it counts every other reference first. */
    confirmAction(drop, "×?", () => {
      S.pddShots[key] = (S.pddShots[key] || []).filter(x => x !== id);
      if(!S.pddShots[key].length) delete S.pddShots[key];
      save(); renderPDD();
    });
    return;
  }

  const paste = e.target.closest("[data-paste]");
  if(paste){
    const key = paste.dataset.paste;
    clipboardImageFile().then(file => {
      if(!file){ toast("Nothing to paste. Copy an image first."); return; }
      addSlotShot(key, file);
    });
    return;
  }

  const host = e.target.closest("[data-mk]");
  if(host){ editManualCell(host); return; }

  /* The draft draws its own thumbnails rather than going through shotThumbs,
     so it has to hand the click on as well. At this size a picture is not
     much use until it can be opened. */
  const img = e.target.closest("img.shot-img");
  if(img && img.dataset.shot) openShot(img.dataset.shot);
});

$("pddDoc").addEventListener("change", e => {
  const pick = e.target.closest("[data-pick]");
  if(!pick || !pick.files || !pick.files[0]) return;
  addSlotShot(pick.dataset.pick, pick.files[0]);
  pick.value = "";
});
$("pddDoc").addEventListener("keydown", e => {
  if(e.key !== "Enter" && e.key !== " ") return;
  const host = e.target.closest && e.target.closest("[data-mk]");
  if(!host) return;
  e.preventDefault();
  editManualCell(host);
});

function renderPDD(){
  const model = pddModel();
  const st = pddStats(model);
  $("pddTitle").textContent = S.name || "Process Definition Document";
  $("pddMeta").innerHTML =
    '<b>' + st.filled + " of " + st.total + "</b><span>fields carrying captured evidence</span>" +
    (st.byHand ? '<b class="byhand-count">' + st.byHand +
      "</b><span>still to fill in by hand</span>" : "");

  const wrap = $("pddDoc");
  wrap.innerHTML = "";

  model.forEach(sec => {
    if(sec.head){
      const h = document.createElement("h2");
      h.className = "pdd-h1";
      h.textContent = sec.no + ". " + sec.title;
      wrap.appendChild(h);
      return;
    }
    const s = document.createElement("section");
    s.className = "pdd-sec";
    s.innerHTML = "<h3>" + esc(sec.no) + " " + esc(sec.title) + "</h3>";

    sec.blocks.forEach(b => {
      if(b.type === "hint"){
        s.insertAdjacentHTML("beforeend", '<p class="pdd-hint">' + esc(b.text) + "</p>");
        return;
      }
      if(b.type === "field"){
        s.insertAdjacentHTML("beforeend",
          '<div class="pdd-field"><span class="pdd-key">' + esc(b.label) + "</span>" +
          '<span class="pdd-val">' + cell(b.value) +
          (b.hint ? ' <em class="pdd-note">' + esc(b.hint) + "</em>" : "") + "</span></div>");
        return;
      }
      if(b.type === "list" || b.type === "numbered"){
        const tag = b.type === "numbered" ? "ol" : "ul";
        s.insertAdjacentHTML("beforeend",
          (b.label ? '<div class="pdd-key pdd-sublabel">' + esc(b.label) + "</div>" : "") +
          (b.items && b.items.length
            ? "<" + tag + ' class="pdd-list">' + b.items.map(x => "<li>" + esc(x) + "</li>").join("") + "</" + tag + ">"
            : '<div class="pdd-val"><span class="tbc">TBC</span></div>'));
        return;
      }
      if(b.type === "gallery"){
        if(!b.items.length) return;
        const figs = [];
        b.items.forEach(g => g.shots.forEach(id => {
          figs.push('<figure class="pdd-fig"><img class="shot-img" data-shot="' + esc(id) +
            '" alt="' + esc(g.name) + '"><figcaption>' + esc(g.name) +
            (g.note ? " — " + esc(g.note) : "") + "</figcaption></figure>");
        }));
        s.insertAdjacentHTML("beforeend",
          '<div class="pdd-gallery">' + figs.join("") + "</div>" +
          (b.note ? '<p class="pdd-note">' + esc(b.note) + "</p>" : ""));
        return;
      }
      if(b.type === "figures"){
        const ids = slotShots(b.key);
        s.insertAdjacentHTML("beforeend",
          '<div class="pdd-key pdd-sublabel">' + esc(b.label) + "</div>" +
          (ids.length
            ? '<div class="pdd-figures">' + ids.map(id =>
                '<figure class="pdd-fig"><img class="shot-img" data-shot="' + esc(id) +
                '" alt="' + esc(b.label) + '">' +
                '<button class="pdd-fig-x" type="button" data-drop="' + esc(b.key) +
                '" data-id="' + esc(id) + '" title="Take this out of the document">' +
                "×</button></figure>").join("") + "</div>"
            : '<div class="pdd-val"><span class="tbc byhand">TBC</span></div>') +
          '<div class="pdd-figbar">' +
            '<button class="btn" type="button" data-paste="' + esc(b.key) + '">Paste image</button>' +
            '<label class="btn" for="pddFile-' + esc(b.key) + '">Choose file</label>' +
            '<input type="file" accept="image/*" hidden id="pddFile-' + esc(b.key) +
            '" data-pick="' + esc(b.key) + '">' +
            '<span class="pdd-fighint">' + esc(b.hint) + "</span>" +
          "</div>");
        return;
      }
      if(b.type === "table"){
        s.insertAdjacentHTML("beforeend",
          (b.label ? '<div class="pdd-key pdd-sublabel">' + esc(b.label) + "</div>" : "") +
          '<div class="pdd-tablewrap"><table class="pdd-table"><thead><tr>' +
          b.columns.map(c => "<th>" + esc(c) + "</th>").join("") + "</tr></thead><tbody>" +
          b.rows.map(r => "<tr>" + r.map(c => "<td>" + (c === "" ? "" : cell(c)) + "</td>").join("") + "</tr>").join("") +
          "</tbody></table></div>" +
          (b.note ? '<p class="pdd-note">' + esc(b.note) + "</p>" : ""));
      }
    });
    wrap.appendChild(s);
  });
  hydrateShots();
}

/* ----- markdown ----- */
function pddMarkdown(){
  const model = pddModel();
  const L = ["# Process Definition Document — draft", "", "Process: " + (S.name || "TBC"),
             "Source: Process Discovery Console capture, " + today(), "",
             "Every TBC below is an unanswered field, not an omission. A TBC marked",
             "(by hand) is one the console has no way to capture; fill those in yourself.", ""];
  /* A reply is free text: Shift+Enter puts newlines in it and a pipe is an
     ordinary character. Either one used to break the table it landed in. */
  const flat = x => String(x).replace(/\r?\n/g, " ");
  const piped = x => String(x).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  const hand = x => x.value ? flat(x.value) : "TBC (by hand)";
  const v = x => (x && x.byHand) ? hand(x) : (x ? flat(x) : "TBC");
  const cellv = x => x === "" ? " "
                   : (x && x.byHand) ? (x.value ? piped(x.value) : "TBC (by hand)")
                   : (x ? piped(x) : "TBC");
  model.forEach(sec => {
    if(sec.head){ L.push("# " + sec.no + ". " + sec.title, ""); return; }
    L.push("## " + sec.no + " " + sec.title, "");
    sec.blocks.forEach(b => {
      if(b.type === "hint"){ L.push("> " + b.text, ""); return; }
      if(b.type === "field"){ L.push("- **" + b.label + ":** " + v(b.value)); return; }
      if(b.type === "list" || b.type === "numbered"){
        if(b.label) L.push("", "**" + b.label + "**", "");
        if(b.items && b.items.length) b.items.forEach((x,i) => L.push((b.type === "numbered" ? (i+1)+". " : "- ") + flat(x)));
        else L.push("- TBC");
        L.push("");
        return;
      }
      if(b.type === "figures"){
        const ids = slotShots(b.key);
        L.push("", "**" + b.label + "**", "");
        if(!ids.length){ L.push("TBC (by hand)", ""); return; }
        ids.forEach(id => L.push("![" + flat(b.label) + "](assets/shots/" +
          shotPrj(id) + "/" + id + shotExt(id) + ")"));
        L.push("");
        return;
      }
      if(b.type === "gallery"){
        if(!b.items.length) return;
        /* Relative to the project root, which is where the folder lives. Drop
           the exported file there and the pictures resolve; anywhere else it
           still says which file belongs to which caption. */
        b.items.forEach(g => g.shots.forEach(id =>
          L.push("![" + flat(g.name) + "](assets/shots/" + shotPrj(id) + "/" + id + shotExt(id) + ")")));
        L.push("");
        return;
      }
      if(b.type === "table"){
        if(b.label) L.push("", "**" + b.label + "**", "");
        L.push("| " + b.columns.join(" | ") + " |");
        L.push("|" + b.columns.map(() => "---").join("|") + "|");
        b.rows.forEach(r => L.push("| " + r.map(cellv).join(" | ") + " |"));
        if(b.note) L.push("", "> " + b.note);
        L.push("");
      }
    });
    L.push("");
  });
  const open = buildGaps().filter(g => !g.done);
  if(open.length){
    L.push("## Still to confirm with the client", "");
    open.forEach(g => L.push("- [" + g.sec + "] " + g.text));
  }
  return L.join("\n");
}

$("copyPddBtn").addEventListener("click", () => copyText(pddMarkdown(), "PDD draft copied as Markdown"));
/* Thumbnails are filled in from the store after the draft is drawn, so print
   without waiting and the PDF comes out with empty frames where the evidence
   should be. */
function shotsDrawn(root){
  const imgs = [...root.querySelectorAll("img.shot-img")];
  if(!imgs.length) return Promise.resolve();
  return Promise.all(imgs.map(img => img.complete && img.naturalWidth
    ? null
    : new Promise(resolve => {
        const done = () => resolve();
        img.addEventListener("load", done, {once:true});
        img.addEventListener("error", done, {once:true});
        setTimeout(done, 2500);
      })));
}

$("printPddBtn").addEventListener("click", () => {
  hydrateShots();
  shotsDrawn($("pddDoc")).then(() => window.print());
});
