import{_ as ae}from"./pdf-Dbgi5wV4.js";import{j as e,i as ie,d as f,L as oe,b1 as ne,a$ as le,b2 as de,aY as ce,h as A,n as me}from"./index-DbfJ5iih.js";import{r as c,$ as he,bg as pe,s as xe,b as ue}from"./icons-CrB11qmO.js";import"./react-DXGY7bZi.js";import"./supabase-VuevzHjS.js";const Q=c.memo(function({report:l,formatDate:C,formatTime:k,getInjuryTypeColor:L,getInjuryTypeLabel:g,getStatusColor:u,onViewDetails:S}){const s=()=>S(l),_=N=>{(N.key==="Enter"||N.key===" ")&&(N.preventDefault(),S(l))};return e.jsxs("div",{className:"report-card",onClick:s,onKeyDown:_,role:"button",tabIndex:0,"aria-label":`Injury report for ${l.employee_name} on ${C(l.incident_date)}`,children:[e.jsxs("div",{className:"report-header",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"report-date",children:[C(l.incident_date)," at ",k(l.incident_time)]}),e.jsx("div",{className:"employee-name",children:l.employee_name})]}),e.jsxs("div",{className:"report-badges",children:[e.jsx("span",{className:"badge",style:{backgroundColor:L(l.injury_type)},children:g(l.injury_type)}),e.jsx("span",{className:"badge",style:{backgroundColor:u(l.status)},children:l.status.replace("_"," ")})]})]}),e.jsxs("div",{className:"report-summary report-summary-compact",children:[e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Location:"})," ",l.incident_location]}),l.osha_recordable&&e.jsx("div",{className:"summary-item",children:e.jsx("span",{className:"osha-badge",children:"OSHA Recordable"})})]}),e.jsx("div",{className:"report-footer",children:e.jsx("span",{className:"report-footer-hint",children:"View full details"})})]})}),be=()=>ae(()=>import("./pdf-Dbgi5wV4.js").then(m=>m.j),[]);function _e({project:m,companyId:l,company:C,user:k,onShowToast:L}){const{branding:g}=ie(),[u,S]=c.useState([]),[s,_]=c.useState(null),[N,z]=c.useState(!1),[X,M]=c.useState(!0),[O,q]=c.useState(null),[T,x]=c.useState(null),[h,E]=c.useState("recent"),[P,B]=c.useState(new Set),[p,F]=c.useState({start:"",end:""});c.useEffect(()=>{w();const r=l||m?.company_id,a=r?f.subscribeToInjuryReports?.(r,()=>{w()}):null;return()=>{a&&f.unsubscribe?.(a)}},[m?.id,l]);const w=c.useCallback(async()=>{M(!0),q(null);try{const r=m?await f.getInjuryReports(m.id):await f.getCompanyInjuryReports(l);S(r)}catch(r){console.error("Error loading injury reports:",r),q(r),x({type:"error",message:"Failed to load injury reports"})}finally{M(!1)}},[m?.id,l]),Z=()=>{w(),z(!1),x({type:"success",message:"Injury report created successfully"})},U=r=>{_(r)},W=()=>{_(null)},H=async(r,a)=>{try{a==="closed"?await f.closeInjuryReport(r,k?.id):await f.updateInjuryReport(r,{status:a}),x({type:"success",message:`Report status updated to ${a.replace("_"," ")}`}),_(t=>t?{...t,status:a}:null),w()}catch(t){console.error("Error updating report status:",t),x({type:"error",message:"Failed to update report status"})}},y=r=>r?new Date(r).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}):"",R=r=>r?new Date(`2000-01-01T${r}`).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}):"",D=r=>({minor:"Minor Injury",serious:"Serious Injury",critical:"Critical Injury",near_miss:"Near Miss"})[r]||r,V=r=>({reported:"#fbbf24",under_investigation:"#3b82f6",closed:"#10b981"})[r]||"#9ca3af",I=r=>({minor:"#10b981",serious:"#f59e0b",critical:"#ef4444",near_miss:"#6b7280"})[r]||"#9ca3af",b=c.useMemo(()=>{let r=[...u];if(p.start&&(r=r.filter(a=>(a.incident_date||"").substring(0,10)>=p.start)),p.end&&(r=r.filter(a=>(a.incident_date||"").substring(0,10)<=p.end)),h==="recent"){const a=new Date;a.setDate(a.getDate()-7);const t=a.toISOString().split("T")[0];r=r.filter(d=>(d.incident_date||"").substring(0,10)>=t)}return r},[u,h,p]),j=c.useMemo(()=>{if(h!=="all")return null;const r={};return b.forEach(a=>{const t=new Date(a.incident_date),d=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}`,i=t.toLocaleDateString("en-US",{month:"long",year:"numeric"});r[d]||(r[d]={label:i,reports:[]}),r[d].reports.push(a)}),Object.entries(r).sort((a,t)=>t[0].localeCompare(a[0]))},[b,h]);c.useEffect(()=>{if(j&&j.length>0){const r=j[0][0];B(new Set([r]))}},[j]);const K=r=>{const a=new Set(P);a.has(r)?a.delete(r):a.add(r),B(a)},ee=async()=>{if(b.length===0){x({type:"error",message:"No reports to export"});return}x({type:"info",message:"Generating PDF..."});const a=(await be()).default,t=new a,d=t.internal.pageSize.getWidth(),i=20;let n=i;const Y=A(g?.primary_color||"#3B82F6"),te=A(g?.secondary_color||"#1E40AF");t.setFillColor(...Y),t.rect(0,0,d,45,"F"),t.setFillColor(...te),t.rect(0,42,d,3,"F");let $=i;if(g?.logo_url)try{const o=await me(g.logo_url);o&&(t.addImage(o,"PNG",i,7,30,30),$=i+40)}catch(o){console.error("Error adding logo:",o)}t.setTextColor(255,255,255),t.setFontSize(22),t.setFont("helvetica","bold"),t.text(C?.name||"Company",$,20),t.setFontSize(10),t.setFont("helvetica","normal"),t.text("INJURY & INCIDENT REPORTS",$,30),t.setFontSize(9),t.text(`Generated: ${new Date().toLocaleDateString()}`,d-i,20,{align:"right"}),t.text(`Total Reports: ${b.length}`,d-i,28,{align:"right"}),n=55,m&&(t.setFillColor(248,250,252),t.rect(i,n-5,d-i*2,15,"F"),t.setTextColor(...Y),t.setFontSize(12),t.setFont("helvetica","bold"),t.text(`Project: ${m.name}`,i+5,n+5),n+=20),b.forEach(o=>{n>200&&(t.addPage(),n=i);const se=A(I(o.injury_type));t.setFillColor(...se),t.rect(i,n,d-i*2,12,"F"),t.setTextColor(255,255,255),t.setFontSize(11),t.setFont("helvetica","bold"),t.text(`${o.employee_name} - ${D(o.injury_type)}`,i+5,n+8),t.text(y(o.incident_date),d-i-5,n+8,{align:"right"}),n+=17,t.setTextColor(50,50,50),t.setFontSize(9),t.setFont("helvetica","normal"),t.text(`Location: ${o.incident_location}`,i+5,n),o.incident_time&&t.text(`Time: ${R(o.incident_time)}`,i+100,n),n+=6,t.setFont("helvetica","bold"),t.text("Description:",i+5,n),t.setFont("helvetica","normal"),n+=5;const J=t.splitTextToSize(o.incident_description,d-i*2-10);t.text(J,i+5,n),n+=J.length*4+3;const v=[];o.body_part_affected&&v.push(`Body Part: ${o.body_part_affected}`),o.osha_recordable&&v.push("OSHA Recordable"),o.workers_comp_claim&&v.push("Workers' Comp Filed"),o.medical_treatment_required&&v.push("Medical Treatment Required"),v.length>0&&(t.setFontSize(8),t.setTextColor(100,100,100),t.text(v.join("  |  "),i+5,n),n+=5),t.setFontSize(8),t.text(`Reported by: ${o.reported_by_name} (${o.reported_by_title})`,i+5,n),n+=12});const G=t.internal.getNumberOfPages();for(let o=1;o<=G;o++)t.setPage(o),t.setFontSize(8),t.setTextColor(150,150,150),t.text(`Page ${o} of ${G}`,d/2,t.internal.pageSize.getHeight()-10,{align:"center"}),t.text("CONFIDENTIAL - Injury Report",i,t.internal.pageSize.getHeight()-10);const re=`Injury_Reports_${new Date().toISOString().split("T")[0]}.pdf`;t.save(re),x({type:"success",message:"PDF exported!"})};return X?e.jsxs("div",{className:"loading-container",children:[e.jsx(oe,{}),e.jsx("p",{children:"Loading injury reports..."})]}):O?e.jsx("div",{className:"injury-reports-section card",children:e.jsx(ne,{title:"Unable to load reports",message:"There was a problem loading injury reports. Please try again.",error:O,onRetry:w})}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"injury-reports-section",children:[e.jsxs("div",{className:"section-header",children:[e.jsx("h3",{children:"Injury & Incident Reports"}),e.jsxs("div",{className:"section-header-actions",children:[u.length>0&&e.jsx("button",{className:"btn-secondary",onClick:ee,children:"PDF"}),e.jsx("button",{className:"btn-primary",onClick:()=>z(!0),children:"+ File Injury Report"})]})]}),e.jsxs("div",{className:"view-mode-bar",children:[e.jsxs("div",{className:"view-mode-tabs",children:[e.jsx("button",{className:`view-mode-tab ${h==="recent"?"active":""}`,onClick:()=>{E("recent"),F({start:"",end:""})},children:"Recent (7 days)"}),e.jsxs("button",{className:`view-mode-tab ${h==="all"?"active":""}`,onClick:()=>E("all"),children:["All (",u.length,")"]})]}),h==="all"&&e.jsxs("div",{className:"date-filter",children:[e.jsx(he,{size:16}),e.jsx("input",{type:"date",value:p.start,onChange:r=>F(a=>({...a,start:r.target.value})),placeholder:"Start date"}),e.jsx("span",{children:"to"}),e.jsx("input",{type:"date",value:p.end,onChange:r=>F(a=>({...a,end:r.target.value})),placeholder:"End date"}),(p.start||p.end)&&e.jsx("button",{className:"btn-ghost",onClick:()=>F({start:"",end:""}),children:"Clear"})]})]}),b.length===0?e.jsx(le,{icon:pe,title:`No Injury Reports${h==="recent"?" in the last 7 days":""}`,message:'Click "File Injury Report" to document a workplace incident',action:h==="recent"&&u.length>0?e.jsx("button",{className:"btn btn-secondary btn-small",onClick:()=>E("all"),children:"View All Reports"}):null}):e.jsx("div",{className:"reports-list",children:h==="all"&&j?j.map(([r,a])=>e.jsxs("div",{className:"month-group",children:[e.jsx("div",{className:"month-header",onClick:()=>K(r),children:e.jsxs("div",{className:"month-header-left",children:[P.has(r)?e.jsx(xe,{size:18}):e.jsx(ue,{size:18}),e.jsx("span",{className:"month-label",children:a.label}),e.jsxs("span",{className:"month-count",children:[a.reports.length," reports"]})]})}),P.has(r)&&e.jsx("div",{className:"month-reports",children:a.reports.map(t=>e.jsx(Q,{report:t,formatDate:y,formatTime:R,getInjuryTypeColor:I,getInjuryTypeLabel:D,getStatusColor:V,onViewDetails:U},t.id))})]},r)):b.map(r=>e.jsx(Q,{report:r,formatDate:y,formatTime:R,getInjuryTypeColor:I,getInjuryTypeLabel:D,getStatusColor:V,onViewDetails:U},r.id))}),s&&e.jsx("div",{className:"modal-overlay",onClick:W,children:e.jsxs("div",{className:"modal-content report-details-modal",onClick:r=>r.stopPropagation(),children:[e.jsxs("div",{className:"modal-header",children:[e.jsx("h2",{children:"Injury Report Details"}),e.jsx("button",{className:"close-btn",onClick:W,children:"×"})]}),e.jsxs("div",{className:"modal-body",children:[e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Incident Information"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Date & Time"}),e.jsxs("div",{children:[y(s.incident_date)," at ",R(s.incident_time)]})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Location"}),e.jsx("div",{children:s.incident_location})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Injury Type"}),e.jsx("div",{children:e.jsx("span",{className:"badge",style:{backgroundColor:I(s.injury_type)},children:D(s.injury_type)})})]}),s.body_part_affected&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Body Part Affected"}),e.jsx("div",{children:s.body_part_affected})]})]}),e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Description"}),e.jsx("div",{className:"description-box",children:s.incident_description})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Injured Employee"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Name"}),e.jsx("div",{children:s.employee_name})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Job Title"}),e.jsx("div",{children:s.employee_job_title})]}),s.employee_phone&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Phone"}),e.jsx("div",{children:s.employee_phone})]}),s.employee_email&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Email"}),e.jsx("div",{children:s.employee_email})]}),s.employee_address&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Address"}),e.jsx("div",{children:s.employee_address})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Reported By"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Name"}),e.jsx("div",{children:s.reported_by_name})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Title"}),e.jsx("div",{children:s.reported_by_title})]}),s.reported_by_phone&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Phone"}),e.jsx("div",{children:s.reported_by_phone})]}),s.reported_by_email&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Email"}),e.jsx("div",{children:s.reported_by_email})]})]})]}),s.witnesses&&s.witnesses.length>0&&e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Witnesses"}),s.witnesses.map((r,a)=>e.jsxs("div",{className:"witness-card",children:[e.jsxs("div",{className:"witness-header",children:[e.jsx("strong",{children:r.name}),r.phone&&e.jsxs("span",{children:[" • ",r.phone]}),r.email&&e.jsxs("span",{children:[" • ",r.email]})]}),r.testimony&&e.jsx("div",{className:"witness-testimony",children:e.jsxs("em",{children:['"',r.testimony,'"']})})]},a))]}),s.medical_treatment_required&&e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Medical Treatment"}),e.jsxs("div",{className:"detail-grid",children:[s.medical_facility_name&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Facility"}),e.jsx("div",{children:s.medical_facility_name})]}),s.medical_facility_address&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Address"}),e.jsx("div",{children:s.medical_facility_address})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Hospitalized"}),e.jsx("div",{children:s.hospitalized?"Yes":"No"})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Actions & Safety"}),s.immediate_actions_taken&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Immediate Actions Taken"}),e.jsx("div",{className:"description-box",children:s.immediate_actions_taken})]}),s.corrective_actions_planned&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Corrective Actions Planned"}),e.jsx("div",{className:"description-box",children:s.corrective_actions_planned})]}),e.jsxs("div",{className:"detail-grid",children:[s.safety_equipment_used&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Safety Equipment Used"}),e.jsx("div",{children:s.safety_equipment_used})]}),s.safety_equipment_failed&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Safety Equipment Failed"}),e.jsx("div",{children:s.safety_equipment_failed})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Regulatory & Work Impact"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"OSHA Recordable"}),e.jsx("div",{children:s.osha_recordable?"Yes":"No"})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Workers' Comp Claim"}),e.jsx("div",{children:s.workers_comp_claim?"Yes":"No"})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Days Away From Work"}),e.jsx("div",{children:s.days_away_from_work||0})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Restricted Work Days"}),e.jsx("div",{children:s.restricted_work_days||0})]})]})]}),s.status!=="closed"&&e.jsxs("div",{className:"status-actions",children:[e.jsx("label",{children:"Update Status:"}),e.jsxs("div",{className:"status-buttons",children:[s.status==="reported"&&e.jsx("button",{className:"btn-status investigate",onClick:()=>H(s.id,"under_investigation"),children:"Start Investigation"}),e.jsx("button",{className:"btn-status close",onClick:()=>H(s.id,"closed"),children:"Close Report"})]})]}),e.jsxs("div",{className:"report-meta",children:["Filed on ",y(s.created_at),s.closed_at&&e.jsxs("span",{children:[" • Closed on ",y(s.closed_at)]})]})]})]})}),N&&e.jsx(de,{project:m,companyId:l,user:k,onClose:()=>z(!1),onReportCreated:Z}),T&&e.jsx(ce,{message:T.message,type:T.type,onClose:()=>x(null)})]}),e.jsx("style",{children:`
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
      `})]})}export{_e as default};
//# sourceMappingURL=InjuryReportsList-C9gDs7-3.js.map
