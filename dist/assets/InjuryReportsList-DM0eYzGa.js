import{_ as se}from"./pdf-aQqpMATS.js";import{as as e,aL as ae,ar as R,aS as ie,aR as ne,aO as A,aP as oe}from"./index-DffI6H_y.js";import{r as c,O as le,q as de,y as ce}from"./icons-B-oSmWeD.js";import{E as me}from"./Dashboard-C4CmpGWc.js";import"./react-DXGY7bZi.js";import"./supabase-VuevzHjS.js";import"./corCalculations-D9qkkIbo.js";const J=c.memo(function({report:i,formatDate:f,formatTime:z,getInjuryTypeColor:L,getInjuryTypeLabel:u,getStatusColor:h,onViewDetails:_}){const s=()=>_(i),N=j=>{(j.key==="Enter"||j.key===" ")&&(j.preventDefault(),_(i))};return e.jsxs("div",{className:"report-card",onClick:s,onKeyDown:N,role:"button",tabIndex:0,"aria-label":`Injury report for ${i.employee_name} on ${f(i.incident_date)}`,children:[e.jsxs("div",{className:"report-header",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"report-date",children:[f(i.incident_date)," at ",z(i.incident_time)]}),e.jsx("div",{className:"employee-name",children:i.employee_name})]}),e.jsxs("div",{className:"report-badges",children:[e.jsx("span",{className:"badge",style:{backgroundColor:L(i.injury_type)},children:u(i.injury_type)}),e.jsx("span",{className:"badge",style:{backgroundColor:h(i.status)},children:i.status.replace("_"," ")})]})]}),e.jsxs("div",{className:"report-summary",children:[e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Location:"})," ",i.incident_location]}),e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Reported by:"})," ",i.reported_by_name," (",i.reported_by_title,")"]}),i.body_part_affected&&e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Body Part:"})," ",i.body_part_affected]}),i.osha_recordable&&e.jsx("div",{className:"summary-item",children:e.jsx("span",{className:"osha-badge",children:"OSHA Recordable"})})]}),e.jsxs("div",{className:"report-description",children:[i.incident_description.substring(0,150),i.incident_description.length>150&&"..."]}),e.jsx("div",{className:"report-footer",children:e.jsx("span",{children:"Click to view full details"})})]})}),he=()=>se(()=>import("./pdf-aQqpMATS.js").then(m=>m.j),[]);function ve({project:m,companyId:i,company:f,user:z,onShowToast:L}){const{branding:u}=ae(),[h,_]=c.useState([]),[s,N]=c.useState(null),[j,I]=c.useState(!1),[Q,M]=c.useState(!0),[O,q]=c.useState(null),[T,g]=c.useState(null),[p,E]=c.useState("recent"),[P,B]=c.useState(new Set),[x,w]=c.useState({start:"",end:""});c.useEffect(()=>{C();const r=i||m?.company_id,a=r?R.subscribeToInjuryReports?.(r,()=>{C()}):null;return()=>{a&&R.unsubscribe?.(a)}},[m?.id,i]);const C=c.useCallback(async()=>{M(!0),q(null);try{const r=m?await R.getInjuryReports(m.id):await R.getCompanyInjuryReports(i);_(r)}catch(r){console.error("Error loading injury reports:",r),q(r),g({type:"error",message:"Failed to load injury reports"})}finally{M(!1)}},[m?.id,i]),X=()=>{C(),I(!1),g({type:"success",message:"Injury report created successfully"})},H=r=>{N(r)},W=()=>{N(null)},v=r=>r?new Date(r).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}):"",k=r=>r?new Date(`2000-01-01T${r}`).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}):"",F=r=>({minor:"Minor Injury",serious:"Serious Injury",critical:"Critical Injury",near_miss:"Near Miss"})[r]||r,U=r=>({reported:"#fbbf24",under_investigation:"#3b82f6",closed:"#10b981"})[r]||"#9ca3af",S=r=>({minor:"#10b981",serious:"#f59e0b",critical:"#ef4444",near_miss:"#6b7280"})[r]||"#9ca3af",D=c.useMemo(()=>{let r=[...h];if(x.start){const a=new Date(x.start);a.setHours(0,0,0,0),r=r.filter(t=>new Date(t.incident_date)>=a)}if(x.end){const a=new Date(x.end);a.setHours(23,59,59,999),r=r.filter(t=>new Date(t.incident_date)<=a)}if(p==="recent"){const a=new Date;a.setDate(a.getDate()-7),a.setHours(0,0,0,0),r=r.filter(t=>new Date(t.incident_date)>=a)}return r},[h,p,x]),b=c.useMemo(()=>{if(p!=="all")return null;const r={};return D.forEach(a=>{const t=new Date(a.incident_date),d=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}`,o=t.toLocaleDateString("en-US",{month:"long",year:"numeric"});r[d]||(r[d]={label:o,reports:[]}),r[d].reports.push(a)}),Object.entries(r).sort((a,t)=>t[0].localeCompare(a[0]))},[D,p]);c.useEffect(()=>{if(b&&b.length>0){const r=b[0][0];B(new Set([r]))}},[b]);const Z=r=>{const a=new Set(P);a.has(r)?a.delete(r):a.add(r),B(a)},K=async()=>{if(h.length===0){g({type:"error",message:"No reports to export"});return}g({type:"info",message:"Generating PDF..."});const a=(await he()).default,t=new a,d=t.internal.pageSize.getWidth(),o=20;let l=o;const V=A(u?.primary_color||"#3B82F6"),ee=A(u?.secondary_color||"#1E40AF");t.setFillColor(...V),t.rect(0,0,d,45,"F"),t.setFillColor(...ee),t.rect(0,42,d,3,"F");let $=o;if(u?.logo_url)try{const n=await oe(u.logo_url);n&&(t.addImage(n,"PNG",o,7,30,30),$=o+40)}catch(n){console.error("Error adding logo:",n)}t.setTextColor(255,255,255),t.setFontSize(22),t.setFont("helvetica","bold"),t.text(f?.name||"Company",$,20),t.setFontSize(10),t.setFont("helvetica","normal"),t.text("INJURY & INCIDENT REPORTS",$,30),t.setFontSize(9),t.text(`Generated: ${new Date().toLocaleDateString()}`,d-o,20,{align:"right"}),t.text(`Total Reports: ${h.length}`,d-o,28,{align:"right"}),l=55,m&&(t.setFillColor(248,250,252),t.rect(o,l-5,d-o*2,15,"F"),t.setTextColor(...V),t.setFontSize(12),t.setFont("helvetica","bold"),t.text(`Project: ${m.name}`,o+5,l+5),l+=20),h.forEach(n=>{l>200&&(t.addPage(),l=o);const re=A(S(n.injury_type));t.setFillColor(...re),t.rect(o,l,d-o*2,12,"F"),t.setTextColor(255,255,255),t.setFontSize(11),t.setFont("helvetica","bold"),t.text(`${n.employee_name} - ${F(n.injury_type)}`,o+5,l+8),t.text(v(n.incident_date),d-o-5,l+8,{align:"right"}),l+=17,t.setTextColor(50,50,50),t.setFontSize(9),t.setFont("helvetica","normal"),t.text(`Location: ${n.incident_location}`,o+5,l),n.incident_time&&t.text(`Time: ${k(n.incident_time)}`,o+100,l),l+=6,t.setFont("helvetica","bold"),t.text("Description:",o+5,l),t.setFont("helvetica","normal"),l+=5;const G=t.splitTextToSize(n.incident_description,d-o*2-10);t.text(G,o+5,l),l+=G.length*4+3;const y=[];n.body_part_affected&&y.push(`Body Part: ${n.body_part_affected}`),n.osha_recordable&&y.push("OSHA Recordable"),n.workers_comp_claim&&y.push("Workers' Comp Filed"),n.medical_treatment_required&&y.push("Medical Treatment Required"),y.length>0&&(t.setFontSize(8),t.setTextColor(100,100,100),t.text(y.join("  |  "),o+5,l),l+=5),t.setFontSize(8),t.text(`Reported by: ${n.reported_by_name} (${n.reported_by_title})`,o+5,l),l+=12});const Y=t.internal.getNumberOfPages();for(let n=1;n<=Y;n++)t.setPage(n),t.setFontSize(8),t.setTextColor(150,150,150),t.text(`Page ${n} of ${Y}`,d/2,t.internal.pageSize.getHeight()-10,{align:"center"}),t.text("CONFIDENTIAL - Injury Report",o,t.internal.pageSize.getHeight()-10);const te=`Injury_Reports_${new Date().toISOString().split("T")[0]}.pdf`;t.save(te),g({type:"success",message:"PDF exported!"})};return Q?e.jsxs("div",{className:"loading-container",children:[e.jsx("div",{className:"spinner"}),e.jsx("p",{children:"Loading injury reports..."})]}):O?e.jsx("div",{className:"injury-reports-section card",children:e.jsx(me,{title:"Unable to load reports",message:"There was a problem loading injury reports. Please try again.",error:O,onRetry:C})}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"injury-reports-section",children:[e.jsxs("div",{className:"section-header",children:[e.jsx("h3",{children:"Injury & Incident Reports"}),e.jsxs("div",{className:"section-header-actions",children:[h.length>0&&e.jsx("button",{className:"btn-secondary",onClick:K,children:"PDF"}),e.jsx("button",{className:"btn-primary",onClick:()=>I(!0),children:"+ File Injury Report"})]})]}),e.jsxs("div",{className:"view-mode-bar",children:[e.jsxs("div",{className:"view-mode-tabs",children:[e.jsx("button",{className:`view-mode-tab ${p==="recent"?"active":""}`,onClick:()=>{E("recent"),w({start:"",end:""})},children:"Recent (7 days)"}),e.jsxs("button",{className:`view-mode-tab ${p==="all"?"active":""}`,onClick:()=>E("all"),children:["All (",h.length,")"]})]}),p==="all"&&e.jsxs("div",{className:"date-filter",children:[e.jsx(le,{size:16}),e.jsx("input",{type:"date",value:x.start,onChange:r=>w(a=>({...a,start:r.target.value})),placeholder:"Start date"}),e.jsx("span",{children:"to"}),e.jsx("input",{type:"date",value:x.end,onChange:r=>w(a=>({...a,end:r.target.value})),placeholder:"End date"}),(x.start||x.end)&&e.jsx("button",{className:"btn-ghost",onClick:()=>w({start:"",end:""}),children:"Clear"})]})]}),D.length===0?e.jsxs("div",{className:"empty-state",children:[e.jsx("div",{className:"empty-state-icon",children:"🏥"}),e.jsxs("h4",{children:["No Injury Reports",p==="recent"?" in the last 7 days":""]}),e.jsx("p",{children:'Click "File Injury Report" to document a workplace incident'}),p==="recent"&&h.length>0&&e.jsx("button",{className:"btn-secondary",onClick:()=>E("all"),children:"View All Reports"})]}):e.jsx("div",{className:"reports-list",children:p==="all"&&b?b.map(([r,a])=>e.jsxs("div",{className:"month-group",children:[e.jsx("div",{className:"month-header",onClick:()=>Z(r),children:e.jsxs("div",{className:"month-header-left",children:[P.has(r)?e.jsx(de,{size:18}):e.jsx(ce,{size:18}),e.jsx("span",{className:"month-label",children:a.label}),e.jsxs("span",{className:"month-count",children:[a.reports.length," reports"]})]})}),P.has(r)&&e.jsx("div",{className:"month-reports",children:a.reports.map(t=>e.jsx(J,{report:t,formatDate:v,formatTime:k,getInjuryTypeColor:S,getInjuryTypeLabel:F,getStatusColor:U,onViewDetails:H},t.id))})]},r)):D.map(r=>e.jsx(J,{report:r,formatDate:v,formatTime:k,getInjuryTypeColor:S,getInjuryTypeLabel:F,getStatusColor:U,onViewDetails:H},r.id))}),s&&e.jsx("div",{className:"modal-overlay",onClick:W,children:e.jsxs("div",{className:"modal-content report-details-modal",onClick:r=>r.stopPropagation(),children:[e.jsxs("div",{className:"modal-header",children:[e.jsx("h2",{children:"Injury Report Details"}),e.jsx("button",{className:"close-btn",onClick:W,children:"×"})]}),e.jsxs("div",{className:"modal-body",children:[e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Incident Information"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Date & Time"}),e.jsxs("div",{children:[v(s.incident_date)," at ",k(s.incident_time)]})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Location"}),e.jsx("div",{children:s.incident_location})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Injury Type"}),e.jsx("div",{children:e.jsx("span",{className:"badge",style:{backgroundColor:S(s.injury_type)},children:F(s.injury_type)})})]}),s.body_part_affected&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Body Part Affected"}),e.jsx("div",{children:s.body_part_affected})]})]}),e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Description"}),e.jsx("div",{className:"description-box",children:s.incident_description})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Injured Employee"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Name"}),e.jsx("div",{children:s.employee_name})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Job Title"}),e.jsx("div",{children:s.employee_job_title})]}),s.employee_phone&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Phone"}),e.jsx("div",{children:s.employee_phone})]}),s.employee_email&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Email"}),e.jsx("div",{children:s.employee_email})]}),s.employee_address&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Address"}),e.jsx("div",{children:s.employee_address})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Reported By"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Name"}),e.jsx("div",{children:s.reported_by_name})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Title"}),e.jsx("div",{children:s.reported_by_title})]}),s.reported_by_phone&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Phone"}),e.jsx("div",{children:s.reported_by_phone})]}),s.reported_by_email&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Email"}),e.jsx("div",{children:s.reported_by_email})]})]})]}),s.witnesses&&s.witnesses.length>0&&e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Witnesses"}),s.witnesses.map((r,a)=>e.jsxs("div",{className:"witness-card",children:[e.jsxs("div",{className:"witness-header",children:[e.jsx("strong",{children:r.name}),r.phone&&e.jsxs("span",{children:[" • ",r.phone]}),r.email&&e.jsxs("span",{children:[" • ",r.email]})]}),r.testimony&&e.jsx("div",{className:"witness-testimony",children:e.jsxs("em",{children:['"',r.testimony,'"']})})]},a))]}),s.medical_treatment_required&&e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Medical Treatment"}),e.jsxs("div",{className:"detail-grid",children:[s.medical_facility_name&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Facility"}),e.jsx("div",{children:s.medical_facility_name})]}),s.medical_facility_address&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Address"}),e.jsx("div",{children:s.medical_facility_address})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Hospitalized"}),e.jsx("div",{children:s.hospitalized?"Yes":"No"})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Actions & Safety"}),s.immediate_actions_taken&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Immediate Actions Taken"}),e.jsx("div",{className:"description-box",children:s.immediate_actions_taken})]}),s.corrective_actions_planned&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Corrective Actions Planned"}),e.jsx("div",{className:"description-box",children:s.corrective_actions_planned})]}),e.jsxs("div",{className:"detail-grid",children:[s.safety_equipment_used&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Safety Equipment Used"}),e.jsx("div",{children:s.safety_equipment_used})]}),s.safety_equipment_failed&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Safety Equipment Failed"}),e.jsx("div",{children:s.safety_equipment_failed})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Regulatory & Work Impact"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"OSHA Recordable"}),e.jsx("div",{children:s.osha_recordable?"Yes":"No"})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Workers' Comp Claim"}),e.jsx("div",{children:s.workers_comp_claim?"Yes":"No"})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Days Away From Work"}),e.jsx("div",{children:s.days_away_from_work||0})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Restricted Work Days"}),e.jsx("div",{children:s.restricted_work_days||0})]})]})]}),e.jsxs("div",{className:"report-meta",children:["Filed on ",v(s.created_at)]})]})]})}),j&&e.jsx(ie,{project:m,companyId:i,user:z,onClose:()=>I(!1),onReportCreated:X}),T&&e.jsx(ne,{message:T.message,type:T.type,onClose:()=>g(null)})]}),e.jsx("style",{children:`
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
      `})]})}export{ve as default};
//# sourceMappingURL=InjuryReportsList-DM0eYzGa.js.map
