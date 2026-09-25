/* 16-pdd.js
   PDD draft: maps captured evidence onto the approved Velera template, renders it and exports Markdown. */
/* =================== PDD DRAFT =================== */
const TBC = null;

function byTag(sec, ...tags){
  return inSection(sec).filter(i => tags.some(t => i.tags.includes(t)));
}
function firstReply(i){
  return (i.replies && i.replies[0]) ? i.replies[0].text : "";
}
function allReplies(i){
  return (i.replies || []).map(r => r.text).join(" ");
}
function joinNames(items){
  return items.length ? items.map(i => i.name + (firstReply(i) ? " (" + firstReply(i) + ")" : "")).join("; ") : TBC;
}
function today(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}

function pddModel(){
  const sys = inSection("Systems"), data = inSection("Data"), proc = inSection("Process"),
        ops = inSection("Operations"), rules = inSection("Rules"), ppl = inSection("People"),
        exc = inSection("Exceptions"), dep = inSection("Dependencies"), ev = inSection("Evidence");

  const envOf = i => (i.tags.find(t => ["Cloud","On-prem","Remote"].includes(t))) || TBC;
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
      rows:[["1.0","Initial Documentation", today(), TBC]]}
   ]},

   {no:"1.2", title:"RPA Projects Team", blocks:[
     {type:"table", columns:["Role","Organization","Name","Contact No. / Email Address"],
      rows: ppl.length ? ppl.map(p => [
        p.tags.find(t => ["SME","Process owner","Team","Approval","Escalation"].includes(t)) || TBC,
        p.tags.includes("External") ? "External" : (p.tags.includes("Internal") ? "Internal" : TBC),
        p.name, TBC
      ]) : [[TBC,TBC,TBC,TBC]]}
   ]},

   {no:"1.3", title:"General Process Information", blocks:[
     {type:"field", label:"Process frequency", value:joinNames(byTag("Operations","Frequency"))},
     {type:"field", label:"Manual processing time per item", value:joinNames(byTag("Operations","Manual effort"))},
     {type:"field", label:"Expected volumes", value:joinNames(byTag("Operations","Volume","Peak"))},
     {type:"field", label:"Schedule and Time Constraints", value:joinNames(byTag("Operations","Schedule","Cutoff"))},
     {type:"list", label:"Dependencies", items:dep.map(d =>
        d.name + (d.tags.length ? " — " + d.tags.join(", ") : "") + (firstReply(d) ? ". " + firstReply(d) : ""))},
     {type:"field", label:"Exception Rate", value:joinNames(byTag("Operations","Exception rate"))},
     {type:"field", label:"Orchestrator Available/Link", value:TBC},
     {type:"field", label:"Attended/Unattended Process(es)", value:TBC,
      hint:"Agreed classification, not a Business Analyst decision."},
     {type:"field", label:"(In)Stability Factors", value:TBC,
      hint:"Known slow reports or intermittent application behaviour."},
     {type:"list", label:"External Sources of Information",
      items:byTag("Process","External source","External").concat(byTag("Dependencies","Third party","External"))
        .map(i => i.name)}
   ]},

   {no:"1.4", title:"Applications & Environments", blocks:[
     {type:"table", columns:["App/System","Environment","Access Type","Access Granted","URL/Details","User Details","Owner"],
      rows: sys.length ? sys.map(s => [s.name, envOf(s), accessOf(s), TBC, firstReply(s) || TBC, TBC, ownerOf(s)])
                       : [[TBC,TBC,TBC,TBC,TBC,TBC,TBC]],
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

   {no:"2.2", title:"Process Map(s)", blocks:[
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
      rows: inputs.length ? inputs.map(i => [i.name, firstReply(i) || TBC, formatOf(i), TBC, TBC, TBC])
                          : [[TBC,TBC,TBC,TBC,TBC,TBC]]},
     {type:"table", label:"Outputs", columns:["Name","Description","Format","Location","Owner","Provider"],
      rows: outputs.length ? outputs.map(i => [i.name, firstReply(i) || TBC, formatOf(i), TBC, TBC, TBC])
                           : [[TBC,TBC,TBC,TBC,TBC,TBC]],
      note:"Business-level artifacts only. Granular runtime values belong in the IOE."}
   ]},

   {no:"2.6", title:"Process Exceptions / Business Rules", blocks:[
     {type:"table", label:"Exceptions", columns:["No.","Exception Type","Exception Code / Message","Process / Business Action"],
      rows: exc.length ? exc.map((e,idx) => [
        String(idx+1),
        e.tags.find(t => t.indexOf("exception") > -1 || t === "Timeout" || t === "Not found" || t === "Manual referral") || TBC,
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
     {type:"list", label:"", items:ev.map(e => e.name + (e.tags.length ? " [" + e.tags.join(", ") + "]" : ""))}
   ]},

   {no:"2.10", title:"Sign Off", blocks:[
     {type:"table", columns:["Name","Role","Signature","Date"], rows:[["","","",""]],
      note:"Intentionally blank until sign-off. Not a TBC."}
   ]}
  ];
}

/* ----- render ----- */
function pddStats(model){
  let filled = 0, total = 0;
  model.forEach(s => (s.blocks||[]).forEach(b => {
    if(b.type === "field"){ total++; if(b.value) filled++; }
    if(b.type === "list" || b.type === "numbered"){ total++; if(b.items && b.items.length) filled++; }
    if(b.type === "table" && s.no !== "2.10" && s.no !== "1.1"){
      total++; if(b.rows.some(r => r.some(c => c && c !== ""))) filled++;
    }
  }));
  return {filled:filled, total:total};
}

function cell(v){
  return v ? esc(v) : '<span class="tbc">TBC</span>';
}

function renderPDD(){
  const model = pddModel();
  const st = pddStats(model);
  $("pddTitle").textContent = S.name || "Process Definition Document";
  $("pddMeta").innerHTML = '<b>' + st.filled + " of " + st.total + "</b><span>fields carrying captured evidence</span>";

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
}

/* ----- markdown ----- */
function pddMarkdown(){
  const model = pddModel();
  const L = ["# Process Definition Document — draft", "", "Process: " + (S.name || "TBC"),
             "Source: TQA Discovery Console capture, " + today(), "",
             "Every TBC below is an unanswered field, not an omission.", ""];
  const v = x => x ? x : "TBC";
  model.forEach(sec => {
    if(sec.head){ L.push("# " + sec.no + ". " + sec.title, ""); return; }
    L.push("## " + sec.no + " " + sec.title, "");
    sec.blocks.forEach(b => {
      if(b.type === "hint"){ L.push("> " + b.text, ""); return; }
      if(b.type === "field"){ L.push("- **" + b.label + ":** " + v(b.value)); return; }
      if(b.type === "list" || b.type === "numbered"){
        if(b.label) L.push("", "**" + b.label + "**", "");
        if(b.items && b.items.length) b.items.forEach((x,i) => L.push((b.type === "numbered" ? (i+1)+". " : "- ") + x));
        else L.push("- TBC");
        L.push("");
        return;
      }
      if(b.type === "table"){
        if(b.label) L.push("", "**" + b.label + "**", "");
        L.push("| " + b.columns.join(" | ") + " |");
        L.push("|" + b.columns.map(() => "---").join("|") + "|");
        b.rows.forEach(r => L.push("| " + r.map(c => c === "" ? " " : v(c)).join(" | ") + " |"));
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
$("printPddBtn").addEventListener("click", () => { document.body.classList.add("printing"); setTimeout(() => { window.print(); document.body.classList.remove("printing"); }, 60); });
