/* 03-areas.js
   Area rail: channel strips, coverage meters, area switching and the quick-type grid. */
/* ---------- channels ---------- */
function channelFill(sec){
  const items = inSection(sec).length;
  if(!items) return 0;
  const gaps = GAPS[sec] || [];
  if(!gaps.length) return 1;
  const done = gaps.filter(g => S.resolved.includes(gapKey(sec,g))).length;
  return Math.max(.08, done / gaps.length);
}

function renderChannels(){
  const wrap = $("channels");
  wrap.innerHTML = "";
  SECTIONS.forEach((sec,i) => {
    const b = document.createElement("button");
    b.className = "channel" + (sec === S.active ? " active" : "") + (DEF[sec].risk ? " risk" : "");
    b.type = "button";
    b.innerHTML =
      '<span class="channel-top"><span class="channel-idx">' + (i+1) + '</span>' +
      '<span class="channel-name">' + esc(sec) + '</span>' +
      '<span class="channel-count">' + inSection(sec).length + '</span></span>' +
      '<span class="meter"><i style="width:' + Math.round(channelFill(sec)*100) + '%"></i></span>';
    b.addEventListener("click", () => selectSection(sec));
    wrap.appendChild(b);
  });
}

function selectSection(sec, focusInput){
  S.active = sec;
  seed = null;
  stageTags = [];
  const d = DEF[sec];
  $("stageLabel").textContent = sec.toLowerCase();
  $("stageTitle").textContent = d.title;
  $("stageHelp").textContent = d.help;
  $("listLabel").textContent = "captured in " + sec.toLowerCase();
  renderChannels();
  renderTypes();
  renderTagBar();
  renderItems();
  renderSeed();
  if(focusInput) $("captureInput").focus();
  save();
}

/* ---------- types ---------- */
function renderTypes(){
  const wrap = $("types");
  wrap.innerHTML = "";
  DEF[S.active].actions.forEach(([name,desc]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "type" + (seed === name ? " on" : "");
    b.innerHTML = "<b>" + esc(name) + "</b><small>" + esc(desc) + "</small>";
    b.addEventListener("click", () => {
      seed = (seed === name) ? null : name;
      renderTypes();
      renderSeed();
      $("captureInput").focus();
    });
    wrap.appendChild(b);
  });
}

function renderSeed(){
  const el = $("captureSeed");
  if(seed){
    el.classList.add("on");
    $("captureSeedText").textContent = seed;
    $("captureInput").placeholder = placeholderFor(S.active, seed);
  }else{
    el.classList.remove("on");
    $("captureInput").placeholder = "Type a name and press Enter";
  }
}

function placeholderFor(sec, type){
  if(sec === "Operations"){
    const m = {"Frequency":"e.g. daily, every weekday","Average volume":"e.g. 350 cases a day","Peak volume":"e.g. 500 a day at month end","Manual effort":"e.g. 4 minutes a case","Schedule":"e.g. weekdays from 7am","SLA":"e.g. same day","Cutoff":"e.g. 4pm ET","Exception rate":"e.g. around 10 percent"};
    return m[type] || "Enter the value you heard";
  }
  if(sec === "Systems") return "e.g. Certitude 70";
  if(sec === "Data") return "e.g. Daily trigger workbook";
  if(sec === "Exceptions") return "e.g. Account not found";
  if(sec === "People") return "e.g. Payments operations team";
  return "Name it in a few words";
}
