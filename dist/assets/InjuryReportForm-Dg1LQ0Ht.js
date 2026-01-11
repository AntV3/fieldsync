import{c as g,r,d as I,j as e,b as Ve,i as Be}from"./index-BqaJgZWc.js";import{X as qe,C as ue,a as He}from"./x-DFpqJIi-.js";import{a as me}from"./imageUtils-ZisjP09f.js";import{T as Oe}from"./wrench-DYIT4dnR.js";const Ge=[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]],ms=g("chevron-up",Ge);const Ue=[["rect",{width:"8",height:"4",x:"8",y:"2",rx:"1",ry:"1",key:"tgr4d6"}],["path",{d:"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",key:"116196"}],["path",{d:"M12 11h4",key:"1jrz19"}],["path",{d:"M12 16h4",key:"n85exb"}],["path",{d:"M8 11h.01",key:"1dfujw"}],["path",{d:"M8 16h.01",key:"18s6g9"}]],hs=g("clipboard-list",Ue);const Ye=[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]],he=g("copy",Ye);const Je=[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"M10 14 21 3",key:"gplh6r"}],["path",{d:"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",key:"a6xqqp"}]],pe=g("external-link",Je);const Xe=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 16v-4",key:"1dtifu"}],["path",{d:"M12 8h.01",key:"e9boi3"}]],ps=g("info",Xe);const Ke=[["path",{d:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",key:"1cjeqo"}],["path",{d:"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",key:"19qd67"}]],Qe=g("link",Ke);const Ze=[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],gs=g("loader-circle",Ze);const es=[["path",{d:"M5 12h14",key:"1ays0h"}]],xs=g("minus",es);const ss=[["path",{d:"M13 21h8",key:"1jsn5i"}],["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}]],ys=g("pen-line",ss);const ts=[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]],bs=g("refresh-cw",ts);const as=[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]],fs=g("search",as);const rs=[["path",{d:"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",key:"1ffxy3"}],["path",{d:"m21.854 2.147-10.94 10.939",key:"12cjpa"}]],vs=g("send",rs);const ns=[["path",{d:"M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344",key:"2acyp4"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]],js=g("square-check-big",ns);function ks(t){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:0}).format(t)}function Ns(t){if(!t||t.length===0)return 0;let o=0;return t.forEach(d=>{d.status==="done"&&(o+=d.weight)}),Math.round(o)}function ws(t){if(!t||t.length===0)return{progress:0,earnedValue:0,totalValue:0,isValueBased:!1};if(t.some(a=>a.scheduled_value>0)){const a=t.reduce((i,h)=>i+(h.scheduled_value||0),0),l=t.filter(i=>i.status==="done").reduce((i,h)=>i+(h.scheduled_value||0),0);return{progress:a>0?Math.round(l/a*100):0,earnedValue:l,totalValue:a,isValueBased:!0}}const d=t.filter(a=>a.status==="done").reduce((a,l)=>a+(l.weight||0),0);return{progress:Math.round(d),earnedValue:0,totalValue:0,isValueBased:!1}}function is(t){if(!t||t.length===0)return"not_started";const o=t.some(l=>l.status==="working"),d=t.some(l=>l.status==="done");return t.every(l=>l.status==="done")?"done":o||d?"working":"not_started"}function _s(t){const o=is(t);return o==="done"?"Complete":o==="working"?"In Progress":"Not Started"}function Ss(t,o=0){const d=new Date;d.setHours(0,0,0,0);const a={scheduleStatus:"on_track",scheduleVariance:0,scheduleLabel:"On Track",laborStatus:"on_track",laborVariance:0,laborLabel:null,hasScheduleData:!1,hasLaborData:!1};if(t.start_date&&t.end_date){const l=new Date(t.start_date),m=new Date(t.end_date);l.setHours(0,0,0,0),m.setHours(0,0,0,0);const i=Math.max(1,Math.ceil((m-l)/(1e3*60*60*24))),h=Math.max(0,Math.ceil((d-l)/(1e3*60*60*24))),u=Math.min(100,h/i*100),x=(t.progress||0)-u;a.scheduleVariance=Math.round(x),a.hasScheduleData=!0,x>5?(a.scheduleStatus="ahead",a.scheduleLabel=`Ahead of Schedule (+${a.scheduleVariance}%)`):x<-5?(a.scheduleStatus="behind",a.scheduleLabel=`Behind Schedule (${a.scheduleVariance}%)`):(a.scheduleStatus="on_track",a.scheduleLabel="On Track")}if(t.planned_man_days&&t.planned_man_days>0){const m=(t.progress||0)/100*t.planned_man_days;if(m>0&&o>0){const i=(o-m)/m*100;a.laborVariance=Math.round(i),a.hasLaborData=!0,i>10?(a.laborStatus="over",a.laborLabel=`Over Planned (+${a.laborVariance}% man-days)`):i<-10?(a.laborStatus="under",a.laborLabel=`Under Planned (${a.laborVariance}% man-days)`):(a.laborStatus="on_track",a.laborLabel="Labor On Track")}else o>0&&(a.hasLaborData=!0,a.laborLabel=`${o} man-days used`)}return a}function Cs(t,o=30){if(t.status==="archived"||t.progress<100)return!1;const d=t.areas||[];if(d.length===0||!d.every(i=>i.status==="done"))return!1;const l=d.reduce((i,h)=>{const u=new Date(h.updated_at);return u>i?u:i},new Date(0));return l.getTime()===0?!1:Math.floor((Date.now()-l.getTime())/(1e3*60*60*24))>=o}function ls(){r.useEffect(()=>{const t=window.scrollY;return document.body.style.overflow="hidden",document.body.style.position="fixed",document.body.style.top=`-${t}px`,document.body.style.width="100%",()=>{document.body.style.overflow="",document.body.style.position="",document.body.style.top="",document.body.style.width="",window.scrollTo(0,t)}},[])}const ge=t=>t?new Date(t).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"Never";function Ds({documentType:t,documentId:o,companyId:d,projectId:a,documentTitle:l="",onClose:m,onShowToast:i}){const[h,u]=r.useState(!0),[c,x]=r.useState(!1),[N,T]=r.useState([]),[b,P]=r.useState(null),[v,C]=r.useState(!1),j="7";ls(),r.useEffect(()=>{w()},[t,o]);const w=async()=>{try{u(!0);const n=await I.getSignatureRequestsForDocument(t,o);T(n||[])}catch(n){console.error("Error loading signature requests:",n)}finally{u(!1)}},D=async()=>{try{x(!0);let n=null;if(j!=="never"){const y=parseInt(j);n=new Date,n.setDate(n.getDate()+y),n=n.toISOString()}const p=await I.createSignatureRequest(t,o,d,a,null,n);if(p){const y=`${window.location.origin}/sign/${p.signature_token}`;P(y),await w(),i?.("Signature link created","success")}}catch(n){console.error("Error generating signature link:",n),i?.("Failed to create signature link","error")}finally{x(!1)}},M=async n=>{try{await navigator.clipboard.writeText(n),C(!0),i?.("Link copied to clipboard","success"),setTimeout(()=>C(!1),2e3)}catch(p){console.error("Error copying to clipboard:",p)}},L=async n=>{if(confirm("Are you sure you want to revoke this signature link? It will no longer be usable."))try{await I.revokeSignatureRequest(n),await w(),i?.("Signature link revoked","success")}catch(p){console.error("Error revoking signature request:",p),i?.("Failed to revoke link","error")}},F=n=>{switch(n){case"pending":return{label:"Awaiting Signatures",color:"#f59e0b",bg:"#fef3c7"};case"partially_signed":return{label:"1 of 2 Signed",color:"#3b82f6",bg:"#dbeafe"};case"completed":return{label:"Fully Signed",color:"#10b981",bg:"#d1fae5"};case"revoked":return{label:"Revoked",color:"#ef4444",bg:"#fee2e2"};case"expired":return{label:"Expired",color:"#6b7280",bg:"#f3f4f6"};default:return{label:n,color:"#6b7280",bg:"#f3f4f6"}}},k=t==="cor"?"Change Order":"T&M Ticket";return e.jsx("div",{className:"modal-overlay",onClick:m,role:"dialog","aria-modal":"true",children:e.jsxs("div",{className:"modal-content signature-link-modal",onClick:n=>n.stopPropagation(),children:[e.jsxs("div",{className:"modal-header",children:[e.jsxs("div",{children:[e.jsx("h2",{children:"Get Signature Link"}),l&&e.jsx("span",{className:"modal-subtitle",children:l})]}),e.jsx("button",{className:"close-btn",onClick:m,"aria-label":"Close",children:e.jsx(qe,{size:20})})]}),e.jsxs("div",{className:"modal-body",children:[e.jsxs("div",{className:"signature-link-section",children:[e.jsxs("h3",{children:[e.jsx(Qe,{size:16}),"Create New Signature Link"]}),e.jsxs("p",{className:"section-description",children:["Generate a secure link that allows GC/Client to sign this ",k," without logging in."]}),e.jsxs("div",{className:"link-options",children:[e.jsxs("div",{className:"link-expiration-info",children:[e.jsx(me,{size:14}),e.jsx("span",{children:"Link expires in 7 days"})]}),e.jsx("button",{className:"btn btn-primary",onClick:D,disabled:c,children:c?"Generating...":"Generate Link"})]}),b&&e.jsxs("div",{className:"new-link-box",children:[e.jsxs("div",{className:"link-display",children:[e.jsx("input",{type:"text",value:b,readOnly:!0,className:"link-input"}),e.jsxs("button",{className:"btn btn-secondary copy-btn",onClick:()=>M(b),children:[v?e.jsx(ue,{size:16}):e.jsx(he,{size:16}),v?"Copied!":"Copy"]})]}),e.jsxs("a",{href:b,target:"_blank",rel:"noopener noreferrer",className:"preview-link",children:[e.jsx(pe,{size:14}),"Preview link"]})]})]}),e.jsxs("div",{className:"signature-link-section",children:[e.jsxs("h3",{children:[e.jsx(me,{size:16}),"Existing Signature Links"]}),h?e.jsx("div",{className:"loading-inline",children:"Loading..."}):N.length===0?e.jsxs("p",{className:"empty-state",children:["No signature links have been created for this ",k,"."]}):e.jsx("div",{className:"existing-links-list",children:N.map(n=>{const p=F(n.status),y=`${window.location.origin}/sign/${n.signature_token}`,E=n.signatures?.length||0;return e.jsxs("div",{className:"existing-link-card",children:[e.jsxs("div",{className:"link-card-header",children:[e.jsx("span",{className:"status-badge",style:{color:p.color,backgroundColor:p.bg},children:p.label}),e.jsxs("span",{className:"link-created",children:["Created ",ge(n.created_at)]})]}),e.jsxs("div",{className:"link-card-body",children:[e.jsxs("div",{className:"link-info",children:[e.jsxs("span",{className:"link-token",children:["...",n.signature_token.slice(-8)]}),n.expires_at&&e.jsxs("span",{className:"link-expires",children:["Expires ",ge(n.expires_at)]}),e.jsxs("span",{className:"link-views",children:[n.view_count," view",n.view_count!==1?"s":""]})]}),E>0&&e.jsx("div",{className:"signatures-summary",children:n.signatures.map(f=>e.jsxs("div",{className:"sig-item",children:[e.jsx(ue,{size:12}),e.jsxs("span",{children:["Slot ",f.signature_slot,": ",f.signer_name,f.signer_company&&` (${f.signer_company})`]})]},f.id))})]}),e.jsxs("div",{className:"link-card-actions",children:[n.status!=="revoked"&&n.status!=="expired"&&e.jsxs(e.Fragment,{children:[e.jsxs("button",{className:"btn btn-ghost btn-small",onClick:()=>M(y),children:[e.jsx(he,{size:14})," Copy"]}),e.jsxs("a",{href:y,target:"_blank",rel:"noopener noreferrer",className:"btn btn-ghost btn-small",children:[e.jsx(pe,{size:14})," Open"]})]}),n.status!=="completed"&&n.status!=="revoked"&&e.jsxs("button",{className:"btn btn-ghost btn-small btn-danger",onClick:()=>L(n.id),children:[e.jsx(Oe,{size:14})," Revoke"]})]})]},n.id)})})]}),e.jsxs("div",{className:"signature-info-box",children:[e.jsx(He,{size:16}),e.jsxs("div",{children:[e.jsx("strong",{children:"How it works:"}),e.jsxs("ul",{children:[e.jsx("li",{children:"Share the link with your GC or Client"}),e.jsx("li",{children:"They can view the document and sign without logging in"}),e.jsx("li",{children:"Supports 2 signatures (GC + Client)"}),e.jsx("li",{children:"Signatures are recorded with name, title, company, date, and IP"})]})]})]})]}),e.jsx("div",{className:"modal-footer",children:e.jsx("button",{className:"btn btn-secondary",onClick:m,children:"Close"})})]})})}function Ms({project:t,companyId:o,user:d,onClose:a,onReportCreated:l}){const[m,i]=r.useState(!1),[h,u]=r.useState(null),[c,x]=r.useState(1),[N,T]=r.useState(new Date().toISOString().split("T")[0]),[b,P]=r.useState(new Date().toTimeString().split(" ")[0].substring(0,5)),[v,C]=r.useState(""),[j,w]=r.useState(""),[D,M]=r.useState("minor"),[L,F]=r.useState(""),[k,n]=r.useState(""),[p,y]=r.useState(""),[E,f]=r.useState(""),[V,xe]=r.useState(""),[A,ye]=r.useState(""),[B,be]=r.useState(""),[z,fe]=r.useState(d?.name||""),[R,ve]=r.useState(""),[q,je]=r.useState(""),[H,ke]=r.useState(d?.email||""),[_,O]=r.useState([]),[$,G]=r.useState(""),[U,Y]=r.useState(""),[J,X]=r.useState(""),[K,Q]=r.useState(""),[W,Ne]=r.useState(!1),[Z,we]=r.useState(""),[ee,_e]=r.useState(""),[se,Se]=r.useState(!1),[te,Ce]=r.useState(""),[ae,De]=r.useState(""),[re,Me]=r.useState(""),[ne,Le]=r.useState(""),[ie,Ee]=r.useState(!1),[le,Ie]=r.useState(!1),[oe,Te]=r.useState(0),[ce,Pe]=r.useState(0),Fe=()=>{if(!$.trim()){u({type:"error",message:"Please enter witness name"});return}const s={name:$,phone:U,email:J,testimony:K};O([..._,s]),G(""),Y(""),X(""),Q(""),u({type:"success",message:"Witness added"})},Ae=s=>{O(_.filter((S,We)=>We!==s))},de=s=>{switch(s){case 1:if(!v.trim()||!j.trim())return u({type:"error",message:"Please fill in all incident details"}),!1;break;case 2:if(!k.trim()||!A.trim())return u({type:"error",message:"Please fill in employee name and job title"}),!1;break;case 3:if(!z.trim()||!R.trim())return u({type:"error",message:"Please fill in supervisor name and title"}),!1;break}return!0},ze=()=>{de(c)&&x(c+1)},Re=()=>{x(c-1)},$e=async()=>{if(de(c)){if(!Be){u({type:"info",message:"Demo Mode: Report saved locally only - won't reach office"}),setTimeout(()=>{a()},1500);return}i(!0);try{const s={project_id:t.id,company_id:o,incident_date:N,incident_time:b,incident_location:v,incident_description:j,injury_type:D,body_part_affected:L||null,employee_name:k,employee_phone:p||null,employee_email:E||null,employee_address:V||null,employee_job_title:A,employee_hire_date:B||null,medical_treatment_required:W,medical_facility_name:Z||null,medical_facility_address:ee||null,hospitalized:se,reported_by_name:z,reported_by_title:R,reported_by_phone:q||null,reported_by_email:H||null,witnesses:_,immediate_actions_taken:te||null,corrective_actions_planned:ae||null,safety_equipment_used:re||null,safety_equipment_failed:ne||null,osha_recordable:ie,workers_comp_claim:le,days_away_from_work:parseInt(oe)||0,restricted_work_days:parseInt(ce)||0,status:"reported",created_by:d?.id},S=await I.createInjuryReport(s);u({type:"success",message:"Injury report submitted successfully"}),l&&l(S),setTimeout(()=>{a()},1500)}catch(s){console.error("Error submitting injury report:",s),u({type:"error",message:"Failed to submit injury report"})}finally{i(!1)}}};return e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"modal-overlay",onClick:a,children:e.jsxs("div",{className:"modal-content injury-report-modal",onClick:s=>s.stopPropagation(),children:[e.jsxs("div",{className:"modal-header",children:[e.jsx("h2",{children:"Workplace Injury/Incident Report"}),e.jsx("button",{className:"close-btn",onClick:a,children:"×"})]}),e.jsxs("div",{className:"progress-steps",children:[e.jsx("div",{className:`step ${c>=1?"active":""}`,children:"1. Incident"}),e.jsx("div",{className:`step ${c>=2?"active":""}`,children:"2. Employee"}),e.jsx("div",{className:`step ${c>=3?"active":""}`,children:"3. Supervisor"}),e.jsx("div",{className:`step ${c>=4?"active":""}`,children:"4. Witnesses"}),e.jsx("div",{className:`step ${c>=5?"active":""}`,children:"5. Medical & Safety"})]}),e.jsxs("div",{className:"modal-body",children:[c===1&&e.jsxs("div",{className:"form-step",children:[e.jsx("h3",{children:"Incident Details"}),e.jsxs("div",{className:"form-row",children:[e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Date of Incident *"}),e.jsx("input",{type:"date",value:N,onChange:s=>T(s.target.value),max:new Date().toISOString().split("T")[0]})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Time of Incident *"}),e.jsx("input",{type:"time",value:b,onChange:s=>P(s.target.value)})]})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Location on Site *"}),e.jsx("input",{type:"text",value:v,onChange:s=>C(s.target.value),placeholder:"e.g., Floor 2, near elevator shaft"})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Incident Description *"}),e.jsx("textarea",{value:j,onChange:s=>w(s.target.value),rows:4,placeholder:"Describe what happened in detail..."})]}),e.jsxs("div",{className:"form-row",children:[e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Injury Type *"}),e.jsxs("select",{value:D,onChange:s=>M(s.target.value),children:[e.jsx("option",{value:"minor",children:"Minor Injury"}),e.jsx("option",{value:"serious",children:"Serious Injury"}),e.jsx("option",{value:"critical",children:"Critical Injury"}),e.jsx("option",{value:"near_miss",children:"Near Miss (No Injury)"})]})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Body Part Affected"}),e.jsx("input",{type:"text",value:L,onChange:s=>F(s.target.value),placeholder:"e.g., Left hand, lower back"})]})]})]}),c===2&&e.jsxs("div",{className:"form-step",children:[e.jsx("h3",{children:"Injured Employee Information"}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Full Name *"}),e.jsx("input",{type:"text",value:k,onChange:s=>n(s.target.value),placeholder:"First and last name"})]}),e.jsxs("div",{className:"form-row",children:[e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Phone Number"}),e.jsx("input",{type:"tel",value:p,onChange:s=>y(s.target.value),placeholder:"(555) 123-4567"})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Email Address"}),e.jsx("input",{type:"email",value:E,onChange:s=>f(s.target.value),placeholder:"email@example.com"})]})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Home Address"}),e.jsx("input",{type:"text",value:V,onChange:s=>xe(s.target.value),placeholder:"Street address, city, state, zip"})]}),e.jsxs("div",{className:"form-row",children:[e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Job Title *"}),e.jsx("input",{type:"text",value:A,onChange:s=>ye(s.target.value),placeholder:"e.g., Carpenter, Electrician"})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Hire Date"}),e.jsx("input",{type:"date",value:B,onChange:s=>be(s.target.value)})]})]})]}),c===3&&e.jsxs("div",{className:"form-step",children:[e.jsx("h3",{children:"Foreman/Supervisor Making Report"}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Your Name *"}),e.jsx("input",{type:"text",value:z,onChange:s=>fe(s.target.value),placeholder:"Full name"})]}),e.jsxs("div",{className:"form-row",children:[e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Your Title *"}),e.jsx("input",{type:"text",value:R,onChange:s=>ve(s.target.value),placeholder:"e.g., Site Foreman, Project Manager"})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Your Phone Number"}),e.jsx("input",{type:"tel",value:q,onChange:s=>je(s.target.value),placeholder:"(555) 123-4567"})]})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Your Email Address"}),e.jsx("input",{type:"email",value:H,onChange:s=>ke(s.target.value),placeholder:"email@example.com"})]})]}),c===4&&e.jsxs("div",{className:"form-step",children:[e.jsx("h3",{children:"Witness Testimonies (Optional)"}),_.length>0&&e.jsx("div",{className:"witnesses-list",children:_.map((s,S)=>e.jsxs("div",{className:"witness-item",children:[e.jsxs("div",{className:"witness-info",children:[e.jsx("strong",{children:s.name}),s.phone&&e.jsxs("span",{children:[" • ",s.phone]}),s.testimony&&e.jsxs("p",{className:"witness-testimony",children:['"',s.testimony,'"']})]}),e.jsx("button",{className:"btn-danger btn-small",onClick:()=>Ae(S),children:"Remove"})]},S))}),e.jsxs("div",{className:"add-witness-form",children:[e.jsxs("div",{className:"form-row",children:[e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Witness Name"}),e.jsx("input",{type:"text",value:$,onChange:s=>G(s.target.value),placeholder:"Full name"})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Phone Number"}),e.jsx("input",{type:"tel",value:U,onChange:s=>Y(s.target.value),placeholder:"(555) 123-4567"})]})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Email Address"}),e.jsx("input",{type:"email",value:J,onChange:s=>X(s.target.value),placeholder:"email@example.com"})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Witness Testimony"}),e.jsx("textarea",{value:K,onChange:s=>Q(s.target.value),rows:3,placeholder:"What did the witness see or hear?"})]}),e.jsx("button",{className:"btn-secondary",onClick:Fe,children:"+ Add Witness"})]})]}),c===5&&e.jsxs("div",{className:"form-step",children:[e.jsx("h3",{children:"Medical Treatment & Safety"}),e.jsx("div",{className:"form-group checkbox-group",children:e.jsxs("label",{children:[e.jsx("input",{type:"checkbox",checked:W,onChange:s=>Ne(s.target.checked)}),"Medical treatment required"]})}),W&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Medical Facility Name"}),e.jsx("input",{type:"text",value:Z,onChange:s=>we(s.target.value),placeholder:"Hospital or clinic name"})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Medical Facility Address"}),e.jsx("input",{type:"text",value:ee,onChange:s=>_e(s.target.value),placeholder:"Street address"})]}),e.jsx("div",{className:"form-group checkbox-group",children:e.jsxs("label",{children:[e.jsx("input",{type:"checkbox",checked:se,onChange:s=>Se(s.target.checked)}),"Employee was hospitalized"]})})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Immediate Actions Taken"}),e.jsx("textarea",{value:te,onChange:s=>Ce(s.target.value),rows:2,placeholder:"What was done immediately after the incident?"})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Corrective Actions Planned"}),e.jsx("textarea",{value:ae,onChange:s=>De(s.target.value),rows:2,placeholder:"What will be done to prevent this in the future?"})]}),e.jsxs("div",{className:"form-row",children:[e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Safety Equipment Used"}),e.jsx("input",{type:"text",value:re,onChange:s=>Me(s.target.value),placeholder:"e.g., Hard hat, gloves, harness"})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Safety Equipment Failed"}),e.jsx("input",{type:"text",value:ne,onChange:s=>Le(s.target.value),placeholder:"Equipment that failed, if any"})]})]}),e.jsxs("div",{className:"form-row",children:[e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Days Away From Work"}),e.jsx("input",{type:"number",min:"0",value:oe,onChange:s=>Te(s.target.value)})]}),e.jsxs("div",{className:"form-group",children:[e.jsx("label",{children:"Restricted Work Days"}),e.jsx("input",{type:"number",min:"0",value:ce,onChange:s=>Pe(s.target.value)})]})]}),e.jsx("div",{className:"form-group checkbox-group",children:e.jsxs("label",{children:[e.jsx("input",{type:"checkbox",checked:ie,onChange:s=>Ee(s.target.checked)}),"OSHA Recordable Incident"]})}),e.jsx("div",{className:"form-group checkbox-group",children:e.jsxs("label",{children:[e.jsx("input",{type:"checkbox",checked:le,onChange:s=>Ie(s.target.checked)}),"Workers' Compensation Claim Filed"]})})]})]}),e.jsx("div",{className:"modal-footer",children:e.jsxs("div",{className:"form-actions",children:[c>1&&e.jsx("button",{className:"btn-secondary",onClick:Re,children:"← Back"}),e.jsx("button",{className:"btn-secondary",onClick:a,children:"Cancel"}),c<5?e.jsx("button",{className:"btn-primary",onClick:ze,children:"Next →"}):e.jsx("button",{className:"btn-primary",onClick:$e,disabled:m,children:m?"Submitting...":"Submit Report"})]})})]})}),h&&e.jsx(Ve,{message:h.message,type:h.type,onClose:()=>u(null)}),e.jsx("style",{children:`
        .injury-report-modal {
          max-width: 800px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .progress-steps {
          display: flex;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--border-color);
          background-color: var(--bg-elevated);
          overflow-x: auto;
        }

        .progress-steps .step {
          font-size: 0.875rem;
          color: var(--text-muted);
          font-weight: 500;
          white-space: nowrap;
          padding: 0.5rem;
        }

        .progress-steps .step.active {
          color: var(--accent-primary);
          font-weight: 600;
        }

        .form-step h3 {
          margin-top: 0;
          margin-bottom: 1.5rem;
          color: var(--text-primary);
          font-size: 1.25rem;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 1rem;
          background: var(--bg-card);
          color: var(--text-primary);
        }

        .form-group textarea {
          resize: vertical;
        }

        .checkbox-group label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: normal;
          cursor: pointer;
        }

        .checkbox-group input[type="checkbox"] {
          width: auto;
          margin: 0;
        }

        .witnesses-list {
          margin-bottom: 1.5rem;
        }

        .witness-item {
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 1rem;
          margin-bottom: 0.5rem;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .witness-info {
          flex: 1;
          color: var(--text-primary);
        }

        .witness-testimony {
          margin-top: 0.5rem;
          color: var(--text-secondary);
          font-style: italic;
          font-size: 0.875rem;
        }

        .add-witness-form {
          border: 2px dashed var(--border-color);
          border-radius: 6px;
          padding: 1rem;
          background-color: var(--bg-elevated);
        }

        .modal-footer {
          border-top: 1px solid var(--border-color);
          padding: 1rem 1.5rem;
        }

        .form-actions {
          display: flex;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .btn-primary,
        .btn-secondary,
        .btn-danger {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          border: none;
        }

        .btn-primary {
          background-color: var(--primary-color, #3b82f6);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          background-color: var(--bg-elevated);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
          background-color: var(--bg-tertiary);
        }

        .btn-danger {
          background-color: #ef4444;
          color: white;
        }

        .btn-danger:hover {
          background-color: #dc2626;
        }

        .btn-small {
          padding: 0.25rem 0.75rem;
          font-size: 0.875rem;
        }

        @media (max-width: 768px) {
          .injury-report-modal {
            max-width: 100%;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
          }

          .form-row {
            grid-template-columns: 1fr;
          }

          .progress-steps .step {
            font-size: 0.75rem;
            padding: 0.25rem;
          }
        }
      `})]})}export{he as C,Ms as I,gs as L,xs as M,ys as P,bs as R,fs as S,vs as a,Ds as b,ms as c,Ns as d,ps as e,js as f,hs as g,Qe as h,ws as i,Ss as j,ks as k,is as l,_s as m,Cs as s};
