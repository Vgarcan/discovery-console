/* 01-model.js
   Static domain model: the nine discovery areas, their types and tags, the gap rules and the PDD coverage map. No DOM, no state.

   An action is [label, description] or [label, description, tag]. The label is what
   the grid shows; the tag is what gets stored and what the PDD looks up. They are
   the same word unless a third element says otherwise, and tools/audit.py fails if
   any action resolves to a tag the area does not declare. */
const DEF = {
  Systems:{
    title:"What system just appeared?",
    help:"Name the thing first. Detail can wait until review.",
    actions:[["Web UI","Browser-based application"],["Desktop UI","Installed or local application"],["Terminal UI","Green screen or text host"],["Database","Database or data store"],["API / Service","Service or integration endpoint","API"],["File transfer","SFTP, FTP or transfer service"],["Remote / VDI","Citrix, RDP or virtual session","Remote"],["Custom build","Internally built system","Custom"]],
    tags:["Web UI","Desktop UI","Terminal UI","Database","API","File transfer","Custom","Third party","Internal","Cloud","On-prem","Remote"]
  },
  Data:{
    title:"What input or output just appeared?",
    help:"Files, documents, records and generated data all count as objects.",
    actions:[["Input","Consumed by the process"],["Output","Produced or updated"],["Excel","Spreadsheet or workbook"],["CSV","Delimited file"],["PDF","PDF document"],["Email","Email content or attachment"],["Database record","Record or table data"],["Document","Any other document type"],["Report","Existing or generated report"]],
    tags:["Input","Output","Excel","CSV","PDF","Email","Database record","Document","Report","Structured","Unstructured","Internal","External"]
  },
  Process:{
    title:"What did you just learn about the flow?",
    help:"High-level facts only. Formal steps come later.",
    actions:[["Trigger","What starts the process"],["End condition","What means it is finished","End"],["Flow cue","A useful as-is sequence marker"],["Variation","Alternate route or scenario"],["In scope","Included scenario"],["Out of scope","Excluded scenario"],["Purpose","Why the process exists"],["External source","Information from outside","External"]],
    tags:["Trigger","End","Flow cue","Variation","In scope","Out of scope","Purpose","External"]
  },
  Operations:{
    title:"What operational fact just appeared?",
    help:"Volume and timing usually arrive as a number in passing. Catch it.",
    actions:[["Frequency","Daily, weekly or ad hoc"],["Average volume","Normal case volume","Volume"],["Peak volume","Peak or seasonal maximum","Peak"],["Manual effort","Human processing time"],["Schedule","Run window"],["SLA","Service deadline"],["Cutoff","Hard cutoff time"],["Exception rate","Expected manual fallout"]],
    tags:["Frequency","Volume","Peak","Manual effort","Schedule","SLA","Cutoff","Exception rate"]
  },
  Rules:{
    title:"What rule or decision appeared?",
    help:"Capture the rule now. The precise criteria can be confirmed later.",
    actions:[["Business rule","Deterministic rule"],["Decision","Branch or choice"],["Validation","Check or eligibility test"],["Calculation","Formula or derived value"],["Matching","Reconciliation or lookup"],["Filter","Include or exclude logic"],["Approval rule","Requires approval","Approval"],["Judgement","Human judgement involved"]],
    tags:["Business rule","Decision","Validation","Calculation","Matching","Filter","Approval","Judgement"]
  },
  People:{
    title:"Who just became relevant?",
    help:"Roles, teams and every point where a human touches the work.",
    actions:[["SME","Subject matter expert"],["Process owner","Owns the business process"],["Team","Internal team"],["Manual review","Human validation step"],["Approval","Human approval"],["Correction","Human correction"],["Handoff","Transfer to another actor"],["Escalation","Exception escalation"]],
    tags:["SME","Process owner","Team","Manual review","Approval","Correction","Handoff","Escalation","Internal","External"]
  },
  Exceptions:{
    title:"What can go wrong here?",
    help:"Record the exception now. How it is handled can stay unknown.",
    risk:true,
    actions:[["Business exception","Expected business condition"],["System exception","Application or infrastructure failure"],["Data exception","Bad, missing or invalid data"],["Access exception","Credential or permission problem"],["Timeout","Timing or response failure"],["Not found","Missing case or record"],["Manual referral","Sent to a human"],["Unclassified","Not yet understood"]],
    tags:["Business exception","System exception","Data exception","Access exception","Timeout","Not found","Manual referral","Unclassified"]
  },
  Dependencies:{
    title:"What does this depend on?",
    help:"Anything that must be available for the process to run at all.",
    actions:[["System","Another system"],["Team","Internal team dependency"],["Third party","External provider"],["File","Required file or feed"],["Approval","Required approval"],["Upstream process","Must happen before","Upstream"],["Downstream process","Consumes the result","Downstream"],["Environment","Infrastructure dependency"]],
    tags:["System","Team","Third party","File","Approval","Upstream","Downstream","Environment","External","Internal"]
  },
  Evidence:{
    title:"What evidence did you get?",
    help:"Proof and source material, logged without breaking the conversation.",
    actions:[["Screenshot","Useful screenshot"],["Recording","Walkthrough recording"],["Sample file","Example input or output"],["SOP / document","Existing documentation","SOP"],["URL","Application or source link"],["Report","Existing report"],["Email","Email evidence"],["To verify","Needs evidence later","Needs verification"]],
    tags:["Screenshot","Recording","Sample file","SOP","URL","Report","Email","Needs verification"]
  }
};

/* The tag an action stores, which is not always the label it shows. */
function tagOf(sec, label){
  const a = ((DEF[sec] || {}).actions || []).find(x => x[0] === label);
  return a ? (a[2] || a[0]) : label;
}

const GAPS = {
  Systems:["Confirm the purpose of each system","Confirm environment for each system","Confirm access and authentication","Confirm the owner of each system","Confirm URLs, paths or connection details","Confirm infrastructure or access restrictions"],
  Data:["Confirm a description for each input","Confirm the format of each input","Confirm where each input arrives","Confirm who provides each input","Confirm the destination of each output"],
  Process:["Confirm the high-level process description","Confirm what triggers the process","Confirm the end condition","Confirm in-scope scenarios","Confirm out-of-scope scenarios"],
  Operations:["Confirm process frequency","Confirm average volume","Confirm peak or seasonal volume","Confirm manual effort per case","Confirm schedule and time constraints","Confirm SLAs and deadlines","Confirm the exception rate"],
  Rules:["Confirm the source or owner of each rule","Confirm the decision criteria","Confirm whether human judgement is required"],
  People:["Confirm the SME and process owner","Confirm manual reviews and approvals","Confirm ownership of each step"],
  Exceptions:["Confirm the type of each exception","Confirm the cause of each exception","Confirm the business action for each exception","Confirm retry, escalation and stop behaviour"],
  Dependencies:["Confirm upstream dependencies","Confirm third-party dependencies","Confirm the impact if a dependency fails"],
  Evidence:["Capture a walkthrough recording or screenshots","Collect representative sample files","Link the existing SOP or supporting documentation"]
};

const PDD = [
  ["1.3 General process information",["Operations","Dependencies"]],
  ["1.4 Applications and environments",["Systems","People"]],
  ["1.5 Infrastructure requirements",["Systems","Dependencies"]],
  ["2.1 Process description",["Process"]],
  ["2.3 As-is process detail",["Process"]],
  ["2.4 Process scope",["Process"]],
  ["2.5 Inputs and outputs",["Data"]],
  ["2.6 Exceptions and business rules",["Exceptions","Rules"]],
  ["2.7 SLAs and deadlines",["Operations"]],
  ["2.8 Reporting requirements",["Data","Evidence"]],
  ["2.9 Screenshots and video",["Evidence"]]
];
