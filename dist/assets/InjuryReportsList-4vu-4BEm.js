import{_ as se}from"./pdf-Bj9PxjIU.js";import{j as e,i as ae,d as _,bs as ie,Q as ne,bt as oe,b7 as le,n as de}from"./index-DsUKUVqA.js";import{b as d,af as ce,bo as me,w as pe,d as he}from"./icons-QfUrUjv8.js";import{r as xe,l as ue,d as be,a as ge,b as ye}from"./pdfBranding-4vjfU7b_.js";import"./react-Dmg9LnoR.js";import"./supabase-DRKLkoQk.js";const Y=d.memo(function({report:o,formatDate:b,formatTime:k,getInjuryTypeColor:A,getInjuryTypeLabel:y,getStatusColor:g,onViewDetails:S}){const s=()=>S(o),N=w=>{(w.key==="Enter"||w.key===" ")&&(w.preventDefault(),S(o))};return e.jsxs("div",{className:"report-card",onClick:s,onKeyDown:N,role:"button",tabIndex:0,"aria-label":`Injury report for ${o.employee_name} on ${b(o.incident_date)}`,children:[e.jsxs("div",{className:"report-header",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"report-date",children:[b(o.incident_date)," at ",k(o.incident_time)]}),e.jsx("div",{className:"employee-name",children:o.employee_name})]}),e.jsxs("div",{className:"report-badges",children:[e.jsx("span",{className:"badge",style:{backgroundColor:A(o.injury_type)},children:y(o.injury_type)}),e.jsx("span",{className:"badge",style:{backgroundColor:g(o.status)},children:o.status.replace("_"," ")})]})]}),e.jsxs("div",{className:"report-summary report-summary-compact",children:[e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Location:"})," ",o.incident_location]}),o.osha_recordable&&e.jsx("div",{className:"summary-item",children:e.jsx("span",{className:"osha-badge",children:"OSHA Recordable"})})]}),e.jsx("div",{className:"report-footer",children:e.jsx("span",{className:"report-footer-hint",children:"View full details"})})]})}),je=()=>se(()=>import("./pdf-Bj9PxjIU.js").then(c=>c.j),[]);function ke({project:c,companyId:o,company:b,user:k,onShowToast:A}){const{branding:y}=ae(),[g,S]=d.useState([]),[s,N]=d.useState(null),[w,z]=d.useState(!1),[G,L]=d.useState(!0),[M,O]=d.useState(null),[T,x]=d.useState(null),[m,E]=d.useState("recent"),[P,U]=d.useState(new Set),[h,F]=d.useState({start:"",end:""});d.useEffect(()=>{C();const t=o||c?.company_id,a=t?_.subscribeToInjuryReports?.(t,()=>{C()}):null;return()=>{a&&_.unsubscribe?.(a)}},[c?.id,o]);const C=d.useCallback(async()=>{L(!0),O(null);try{const t=c?await _.getInjuryReports(c.id):await _.getCompanyInjuryReports(o);S(t)}catch(t){console.error("Error loading injury reports:",t),O(t),x({type:"error",message:"Failed to load injury reports"})}finally{L(!1)}},[c?.id,o]),Q=()=>{C(),z(!1),x({type:"success",message:"Injury report created successfully"})},q=t=>{N(t)},W=()=>{N(null)},B=async(t,a)=>{try{a==="closed"?await _.closeInjuryReport(t,k?.id):await _.updateInjuryReport(t,{status:a}),x({type:"success",message:`Report status updated to ${a.replace("_"," ")}`}),N(r=>r?{...r,status:a}:null),C()}catch(r){console.error("Error updating report status:",r),x({type:"error",message:"Failed to update report status"})}},j=t=>t?new Date(t).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}):"",R=t=>t?new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}):"",D=t=>({minor:"Minor Injury",serious:"Serious Injury",critical:"Critical Injury",near_miss:"Near Miss"})[t]||t,H=t=>({reported:"#fbbf24",under_investigation:"#3b82f6",closed:"#10b981"})[t]||"#9ca3af",I=t=>({minor:"#10b981",serious:"#f59e0b",critical:"#ef4444",near_miss:"#6b7280"})[t]||"#9ca3af",u=d.useMemo(()=>{let t=[...g];if(h.start&&(t=t.filter(a=>(a.incident_date||"").substring(0,10)>=h.start)),h.end&&(t=t.filter(a=>(a.incident_date||"").substring(0,10)<=h.end)),m==="recent"){const a=new Date;a.setDate(a.getDate()-7);const r=a.toISOString().split("T")[0];t=t.filter(p=>(p.incident_date||"").substring(0,10)>=r)}return t},[g,m,h]),v=d.useMemo(()=>{if(m!=="all")return null;const t={};return u.forEach(a=>{const r=new Date(a.incident_date),p=`${r.getFullYear()}-${String(r.getMonth()+1).padStart(2,"0")}`,l=r.toLocaleDateString("en-US",{month:"long",year:"numeric"});t[p]||(t[p]={label:l,reports:[]}),t[p].reports.push(a)}),Object.entries(t).sort((a,r)=>r[0].localeCompare(a[0]))},[u,m]);d.useEffect(()=>{if(v&&v.length>0){const t=v[0][0];U(new Set([t]))}},[v]);const X=t=>{const a=new Set(P);a.has(t)?a.delete(t):a.add(t),U(a)},Z=async()=>{if(u.length===0){x({type:"error",message:"No reports to export"});return}x({type:"info",message:"Generating PDF..."});const a=(await je()).default,r=new a,p=r.internal.pageSize.getWidth(),l=18,V={primaryColor:y?.primary_color||y?.primaryColor,logoUrl:y?.logo_url||y?.logoUrl},$=xe({branding:V,company:b}),K=await ue({branding:V,company:b});let i=be(r,{title:"Injury & Incident Reports",subtitle:`${u.length} report${u.length!==1?"s":""}`,context:{company:b},brandLogo:K,primary:$});if(c){r.setFillColor(248,250,252),r.roundedRect(l,i,p-l*2,11,2,2,"F"),r.setFontSize(7.5),r.setFont("helvetica","bold"),r.setTextColor(71,85,105),r.text("PROJECT",l+5,i+4.5),r.setFontSize(9.5),r.setFont("helvetica","bold"),r.setTextColor(15,23,42);const n=(c.name||"Untitled")+(c.job_number?`   ·   Job #${c.job_number}`:"");r.text(n,l+22,i+7.5),i+=17}u.forEach(n=>{i>200&&(r.addPage(),i=l);const re=de(I(n.injury_type));r.setFillColor(...re),r.rect(l,i,p-l*2,12,"F"),r.setTextColor(255,255,255),r.setFontSize(11),r.setFont("helvetica","bold"),r.text(`${n.employee_name} - ${D(n.injury_type)}`,l+5,i+8),r.text(j(n.incident_date),p-l-5,i+8,{align:"right"}),i+=17,r.setTextColor(50,50,50),r.setFontSize(9),r.setFont("helvetica","normal"),r.text(`Location: ${n.incident_location}`,l+5,i),n.incident_time&&r.text(`Time: ${R(n.incident_time)}`,l+100,i),i+=6,r.setFont("helvetica","bold"),r.text("Description:",l+5,i),r.setFont("helvetica","normal"),i+=5;const J=r.splitTextToSize(n.incident_description,p-l*2-10);r.text(J,l+5,i),i+=J.length*4+3;const f=[];n.body_part_affected&&f.push(`Body Part: ${n.body_part_affected}`),n.osha_recordable&&f.push("OSHA Recordable"),n.workers_comp_claim&&f.push("Workers' Comp Filed"),n.medical_treatment_required&&f.push("Medical Treatment Required"),f.length>0&&(r.setFontSize(8),r.setTextColor(100,100,100),r.text(f.join("  |  "),l+5,i),i+=5),r.setFontSize(8),r.text(`Reported by: ${n.reported_by_name} (${n.reported_by_title})`,l+5,i),i+=12});const ee=r.internal.getNumberOfPages();for(let n=2;n<=ee;n++)r.setPage(n),ge(r,{primary:$});ye(r,{documentLabel:"CONFIDENTIAL · Injury & Incident Report",context:{company:b},primary:$});const te=`Injury_Reports_${new Date().toISOString().split("T")[0]}.pdf`;r.save(te),x({type:"success",message:"PDF exported!"})};return G?e.jsxs("div",{className:"loading-container",children:[e.jsx("div",{className:"spinner"}),e.jsx("p",{children:"Loading injury reports..."})]}):M?e.jsx("div",{className:"injury-reports-section card",children:e.jsx(ie,{title:"Unable to load reports",message:"There was a problem loading injury reports. Please try again.",error:M,onRetry:C})}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"injury-reports-section",children:[e.jsxs("div",{className:"section-header",children:[e.jsx("h3",{children:"Injury & Incident Reports"}),e.jsxs("div",{className:"section-header-actions",children:[g.length>0&&e.jsx("button",{className:"btn-secondary",onClick:Z,children:"PDF"}),e.jsx("button",{className:"btn-primary",onClick:()=>z(!0),children:"+ File Injury Report"})]})]}),e.jsxs("div",{className:"view-mode-bar",children:[e.jsxs("div",{className:"view-mode-tabs",children:[e.jsx("button",{className:`view-mode-tab ${m==="recent"?"active":""}`,onClick:()=>{E("recent"),F({start:"",end:""})},children:"Recent (7 days)"}),e.jsxs("button",{className:`view-mode-tab ${m==="all"?"active":""}`,onClick:()=>E("all"),children:["All (",g.length,")"]})]}),m==="all"&&e.jsxs("div",{className:"date-filter",children:[e.jsx(ce,{size:16}),e.jsx("input",{type:"date",value:h.start,onChange:t=>F(a=>({...a,start:t.target.value})),placeholder:"Start date"}),e.jsx("span",{children:"to"}),e.jsx("input",{type:"date",value:h.end,onChange:t=>F(a=>({...a,end:t.target.value})),placeholder:"End date"}),(h.start||h.end)&&e.jsx("button",{className:"btn-ghost",onClick:()=>F({start:"",end:""}),children:"Clear"})]})]}),u.length===0?e.jsx(ne,{icon:me,title:`No Injury Reports${m==="recent"?" in the last 7 days":""}`,message:'Click "File Injury Report" to document a workplace incident',action:m==="recent"&&g.length>0?e.jsx("button",{className:"btn btn-secondary btn-small",onClick:()=>E("all"),children:"View All Reports"}):null}):e.jsx("div",{className:"reports-list",children:m==="all"&&v?v.map(([t,a])=>e.jsxs("div",{className:"month-group",children:[e.jsx("div",{className:"month-header",onClick:()=>X(t),children:e.jsxs("div",{className:"month-header-left",children:[P.has(t)?e.jsx(pe,{size:18}):e.jsx(he,{size:18}),e.jsx("span",{className:"month-label",children:a.label}),e.jsxs("span",{className:"month-count",children:[a.reports.length," reports"]})]})}),P.has(t)&&e.jsx("div",{className:"month-reports",children:a.reports.map(r=>e.jsx(Y,{report:r,formatDate:j,formatTime:R,getInjuryTypeColor:I,getInjuryTypeLabel:D,getStatusColor:H,onViewDetails:q},r.id))})]},t)):u.map(t=>e.jsx(Y,{report:t,formatDate:j,formatTime:R,getInjuryTypeColor:I,getInjuryTypeLabel:D,getStatusColor:H,onViewDetails:q},t.id))}),s&&e.jsx("div",{className:"modal-overlay",onClick:W,children:e.jsxs("div",{className:"modal-content report-details-modal",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"modal-header",children:[e.jsx("h2",{children:"Injury Report Details"}),e.jsx("button",{className:"close-btn",onClick:W,children:"×"})]}),e.jsxs("div",{className:"modal-body",children:[e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Incident Information"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Date & Time"}),e.jsxs("div",{children:[j(s.incident_date)," at ",R(s.incident_time)]})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Location"}),e.jsx("div",{children:s.incident_location})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Injury Type"}),e.jsx("div",{children:e.jsx("span",{className:"badge",style:{backgroundColor:I(s.injury_type)},children:D(s.injury_type)})})]}),s.body_part_affected&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Body Part Affected"}),e.jsx("div",{children:s.body_part_affected})]})]}),e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Description"}),e.jsx("div",{className:"description-box",children:s.incident_description})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Injured Employee"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Name"}),e.jsx("div",{children:s.employee_name})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Job Title"}),e.jsx("div",{children:s.employee_job_title})]}),s.employee_phone&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Phone"}),e.jsx("div",{children:s.employee_phone})]}),s.employee_email&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Email"}),e.jsx("div",{children:s.employee_email})]}),s.employee_address&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Address"}),e.jsx("div",{children:s.employee_address})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Reported By"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Name"}),e.jsx("div",{children:s.reported_by_name})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Title"}),e.jsx("div",{children:s.reported_by_title})]}),s.reported_by_phone&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Phone"}),e.jsx("div",{children:s.reported_by_phone})]}),s.reported_by_email&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Email"}),e.jsx("div",{children:s.reported_by_email})]})]})]}),s.witnesses&&s.witnesses.length>0&&e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Witnesses"}),s.witnesses.map((t,a)=>e.jsxs("div",{className:"witness-card",children:[e.jsxs("div",{className:"witness-header",children:[e.jsx("strong",{children:t.name}),t.phone&&e.jsxs("span",{children:[" • ",t.phone]}),t.email&&e.jsxs("span",{children:[" • ",t.email]})]}),t.testimony&&e.jsx("div",{className:"witness-testimony",children:e.jsxs("em",{children:['"',t.testimony,'"']})})]},a))]}),s.medical_treatment_required&&e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Medical Treatment"}),e.jsxs("div",{className:"detail-grid",children:[s.medical_facility_name&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Facility"}),e.jsx("div",{children:s.medical_facility_name})]}),s.medical_facility_address&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Address"}),e.jsx("div",{children:s.medical_facility_address})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Hospitalized"}),e.jsx("div",{children:s.hospitalized?"Yes":"No"})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Actions & Safety"}),s.immediate_actions_taken&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Immediate Actions Taken"}),e.jsx("div",{className:"description-box",children:s.immediate_actions_taken})]}),s.corrective_actions_planned&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Corrective Actions Planned"}),e.jsx("div",{className:"description-box",children:s.corrective_actions_planned})]}),e.jsxs("div",{className:"detail-grid",children:[s.safety_equipment_used&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Safety Equipment Used"}),e.jsx("div",{children:s.safety_equipment_used})]}),s.safety_equipment_failed&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Safety Equipment Failed"}),e.jsx("div",{children:s.safety_equipment_failed})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Regulatory & Work Impact"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"OSHA Recordable"}),e.jsx("div",{children:s.osha_recordable?"Yes":"No"})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Workers' Comp Claim"}),e.jsx("div",{children:s.workers_comp_claim?"Yes":"No"})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Days Away From Work"}),e.jsx("div",{children:s.days_away_from_work||0})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Restricted Work Days"}),e.jsx("div",{children:s.restricted_work_days||0})]})]})]}),s.status!=="closed"&&e.jsxs("div",{className:"status-actions",children:[e.jsx("label",{children:"Update Status:"}),e.jsxs("div",{className:"status-buttons",children:[s.status==="reported"&&e.jsx("button",{className:"btn-status investigate",onClick:()=>B(s.id,"under_investigation"),children:"Start Investigation"}),e.jsx("button",{className:"btn-status close",onClick:()=>B(s.id,"closed"),children:"Close Report"})]})]}),e.jsxs("div",{className:"report-meta",children:["Filed on ",j(s.created_at),s.closed_at&&e.jsxs("span",{children:[" • Closed on ",j(s.closed_at)]})]})]})]})}),w&&e.jsx(oe,{project:c,companyId:o,user:k,onClose:()=>z(!1),onReportCreated:Q}),T&&e.jsx(le,{message:T.message,type:T.type,onClose:()=>x(null)})]}),e.jsx("style",{children:`
        .injury-reports-section {
          margin-top: 2rem;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .section-header h3 {
          margin: 0;
          font-size: 1.25rem;
          color: var(--text-primary);
        }

        .view-mode-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: var(--bg-elevated);
          border-radius: 8px;
          flex-wrap: wrap;
        }

        .view-mode-tabs {
          display: flex;
          gap: 0.5rem;
        }

        .view-mode-tab {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          font-size: 0.875rem;
          cursor: pointer;
          background: transparent;
          color: var(--text-secondary);
          transition: all 0.2s;
        }

        .view-mode-tab:hover {
          background: var(--bg-tertiary);
        }

        .view-mode-tab.active {
          background: var(--primary-color, #3b82f6);
          color: white;
        }

        .date-filter {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--text-secondary);
        }

        .date-filter input[type="date"] {
          padding: 0.4rem 0.5rem;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 0.875rem;
          background: var(--bg-card);
          color: var(--text-primary);
        }

        .btn-ghost {
          background: transparent;
          border: none;
          padding: 0.4rem 0.75rem;
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .btn-ghost:hover {
          background: var(--bg-tertiary);
        }

        .month-group {
          margin-bottom: 0.5rem;
        }

        .month-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: var(--bg-elevated);
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .month-header:hover {
          background: var(--bg-tertiary);
        }

        .month-header-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .month-label {
          font-weight: 600;
          color: var(--text-primary);
        }

        .month-count {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .month-reports {
          margin-top: 0.5rem;
          padding-left: 0.5rem;
        }

        .reports-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .report-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .report-card:hover {
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
          border-color: var(--accent-primary);
        }

        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 1rem;
        }

        .report-date {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-bottom: 0.25rem;
        }

        .employee-name {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .report-badges {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          color: white;
          text-transform: capitalize;
        }

        .osha-badge {
          background-color: #dc2626;
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .report-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
          padding: 1rem;
          background-color: var(--bg-elevated);
          border-radius: 6px;
        }

        .summary-item {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .summary-item strong {
          color: var(--text-primary);
        }

        .report-description {
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 1rem;
        }

        .report-footer {
          text-align: right;
          font-size: 0.875rem;
          color: var(--primary-color, #3b82f6);
        }

        .report-details-modal {
          max-width: 900px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .details-section {
          margin-bottom: 2rem;
          padding-bottom: 2rem;
          border-bottom: 1px solid var(--border-color);
        }

        .details-section:last-child {
          border-bottom: none;
        }

        .details-section h3 {
          margin-top: 0;
          margin-bottom: 1rem;
          font-size: 1.125rem;
          color: var(--text-primary);
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .detail-item label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 0.25rem;
        }

        .detail-item div {
          color: var(--text-primary);
        }

        .detail-item.full-width {
          grid-column: 1 / -1;
        }

        .description-box {
          background-color: var(--bg-elevated);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 1rem;
          white-space: pre-wrap;
          line-height: 1.6;
          color: var(--text-primary);
        }

        .witness-card {
          background-color: var(--bg-elevated);
          border-radius: 6px;
          padding: 1rem;
          margin-bottom: 0.5rem;
        }

        .witness-header {
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .witness-testimony {
          color: var(--text-secondary);
          font-size: 0.875rem;
          padding-left: 1rem;
          border-left: 3px solid var(--border-color);
        }

        .status-actions {
          padding: 1.5rem 0;
          border-top: 1px solid var(--border-color);
        }

        .status-actions label {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 0.75rem;
        }

        .status-buttons {
          display: flex;
          gap: 0.75rem;
        }

        .btn-status {
          padding: 0.5rem 1.25rem;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          font-size: 0.875rem;
        }

        .btn-status.investigate {
          background-color: #3b82f6;
          color: white;
        }

        .btn-status.investigate:hover {
          background-color: #2563eb;
        }

        .btn-status.close {
          background-color: #10b981;
          color: white;
        }

        .btn-status.close:hover {
          background-color: #059669;
        }

        .report-meta {
          text-align: center;
          font-size: 0.875rem;
          color: var(--text-secondary);
          padding-top: 1rem;
          border-top: 1px solid var(--border-color);
        }

        .empty-state {
          text-align: center;
          padding: 3rem 1rem;
        }

        .empty-state-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .empty-state h4 {
          margin: 0 0 0.5rem 0;
          color: var(--text-primary);
        }

        .empty-state p {
          margin: 0;
          color: var(--text-secondary);
        }

        .section-header-actions {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .btn-primary, .btn-secondary {
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

        .btn-secondary {
          background-color: var(--bg-elevated);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
        }

        .btn-primary:hover, .btn-secondary:hover {
          opacity: 0.9;
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 3rem;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid var(--border-color);
          border-top-color: var(--accent-primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .report-header {
            flex-direction: column;
            gap: 0.5rem;
          }

          .report-summary {
            grid-template-columns: 1fr;
          }

          .detail-grid {
            grid-template-columns: 1fr;
          }

          .report-details-modal {
            max-width: 100%;
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
          }
        }
      `})]})}export{ke as default};
