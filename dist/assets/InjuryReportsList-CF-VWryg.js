import{u as K,d as C,j as e,I as ee,T as te,k as z,l as re}from"./index-UDxcK7mb.js";import{r as l,y as se,q as ae,x as ie}from"./icons-_xHNNQgF.js";import{al as ne}from"./Dashboard-BbceU_wI.js";import{E as le}from"./pdf-ChZ1zkDw.js";import"./react-DXGY7bZi.js";import"./supabase-VuevzHjS.js";import"./corCalculations-D9qkkIbo.js";function be({project:c,companyId:g,company:H,user:O,onShowToast:oe}){const{branding:u}=K(),[m,W]=l.useState([]),[a,T]=l.useState(null),[U,k]=l.useState(!1),[Y,I]=l.useState(!0),[E,P]=l.useState(null),[S,h]=l.useState(null),[o,F]=l.useState("recent"),[D,$]=l.useState(new Set),[d,j]=l.useState({start:"",end:""});l.useEffect(()=>{y();const t=g||c?.company_id,s=t?C.subscribeToInjuryReports?.(t,()=>{y()}):null;return()=>{s&&C.unsubscribe?.(s)}},[c?.id,g]);const y=l.useCallback(async()=>{I(!0),P(null);try{const t=c?await C.getInjuryReports(c.id):await C.getCompanyInjuryReports(g);W(t)}catch(t){console.error("Error loading injury reports:",t),P(t),h({type:"error",message:"Failed to load injury reports"})}finally{I(!1)}},[c?.id,g]),G=()=>{y(),k(!1),h({type:"success",message:"Injury report created successfully"})},A=t=>{T(t)},L=()=>{T(null)},b=t=>t?new Date(t).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}):"",v=t=>t?new Date(`2000-01-01T${t}`).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}):"",f=t=>({minor:"Minor Injury",serious:"Serious Injury",critical:"Critical Injury",near_miss:"Near Miss"})[t]||t,M=t=>({reported:"#fbbf24",under_investigation:"#3b82f6",closed:"#10b981"})[t]||"#9ca3af",_=t=>({minor:"#10b981",serious:"#f59e0b",critical:"#ef4444",near_miss:"#6b7280"})[t]||"#9ca3af",N=l.useMemo(()=>{let t=[...m];if(d.start){const s=new Date(d.start);s.setHours(0,0,0,0),t=t.filter(r=>new Date(r.incident_date)>=s)}if(d.end){const s=new Date(d.end);s.setHours(23,59,59,999),t=t.filter(r=>new Date(r.incident_date)<=s)}if(o==="recent"){const s=new Date;s.setDate(s.getDate()-7),s.setHours(0,0,0,0),t=t.filter(r=>new Date(r.incident_date)>=s)}return t},[m,o,d]),p=l.useMemo(()=>{if(o!=="all")return null;const t={};return N.forEach(s=>{const r=new Date(s.incident_date),i=`${r.getFullYear()}-${String(r.getMonth()+1).padStart(2,"0")}`,w=r.toLocaleDateString("en-US",{month:"long",year:"numeric"});t[i]||(t[i]={label:w,reports:[]}),t[i].reports.push(s)}),Object.entries(t).sort((s,r)=>r[0].localeCompare(s[0]))},[N,o]);l.useEffect(()=>{if(p&&p.length>0){const t=p[0][0];$(new Set([t]))}},[p]);const V=t=>{const s=new Set(D);s.has(t)?s.delete(t):s.add(t),$(s)},J=async()=>{if(m.length===0){h({type:"error",message:"No reports to export"});return}h({type:"info",message:"Generating PDF..."});const t=new le,s=t.internal.pageSize.getWidth(),r=20;let i=r;const w=z(u?.primary_color||"#3B82F6"),Q=z(u?.secondary_color||"#1E40AF");t.setFillColor(...w),t.rect(0,0,s,45,"F"),t.setFillColor(...Q),t.rect(0,42,s,3,"F");let R=r;if(u?.logo_url)try{const n=await re(u.logo_url);n&&(t.addImage(n,"PNG",r,7,30,30),R=r+40)}catch(n){console.error("Error adding logo:",n)}t.setTextColor(255,255,255),t.setFontSize(22),t.setFont("helvetica","bold"),t.text(H?.name||"Company",R,20),t.setFontSize(10),t.setFont("helvetica","normal"),t.text("INJURY & INCIDENT REPORTS",R,30),t.setFontSize(9),t.text(`Generated: ${new Date().toLocaleDateString()}`,s-r,20,{align:"right"}),t.text(`Total Reports: ${m.length}`,s-r,28,{align:"right"}),i=55,c&&(t.setFillColor(248,250,252),t.rect(r,i-5,s-r*2,15,"F"),t.setTextColor(...w),t.setFontSize(12),t.setFont("helvetica","bold"),t.text(`Project: ${c.name}`,r+5,i+5),i+=20),m.forEach(n=>{i>200&&(t.addPage(),i=r);const Z=z(_(n.injury_type));t.setFillColor(...Z),t.rect(r,i,s-r*2,12,"F"),t.setTextColor(255,255,255),t.setFontSize(11),t.setFont("helvetica","bold"),t.text(`${n.employee_name} - ${f(n.injury_type)}`,r+5,i+8),t.text(b(n.incident_date),s-r-5,i+8,{align:"right"}),i+=17,t.setTextColor(50,50,50),t.setFontSize(9),t.setFont("helvetica","normal"),t.text(`Location: ${n.incident_location}`,r+5,i),n.incident_time&&t.text(`Time: ${v(n.incident_time)}`,r+100,i),i+=6,t.setFont("helvetica","bold"),t.text("Description:",r+5,i),t.setFont("helvetica","normal"),i+=5;const B=t.splitTextToSize(n.incident_description,s-r*2-10);t.text(B,r+5,i),i+=B.length*4+3;const x=[];n.body_part_affected&&x.push(`Body Part: ${n.body_part_affected}`),n.osha_recordable&&x.push("OSHA Recordable"),n.workers_comp_claim&&x.push("Workers' Comp Filed"),n.medical_treatment_required&&x.push("Medical Treatment Required"),x.length>0&&(t.setFontSize(8),t.setTextColor(100,100,100),t.text(x.join("  |  "),r+5,i),i+=5),t.setFontSize(8),t.text(`Reported by: ${n.reported_by_name} (${n.reported_by_title})`,r+5,i),i+=12});const q=t.internal.getNumberOfPages();for(let n=1;n<=q;n++)t.setPage(n),t.setFontSize(8),t.setTextColor(150,150,150),t.text(`Page ${n} of ${q}`,s/2,t.internal.pageSize.getHeight()-10,{align:"center"}),t.text("CONFIDENTIAL - Injury Report",r,t.internal.pageSize.getHeight()-10);const X=`Injury_Reports_${new Date().toISOString().split("T")[0]}.pdf`;t.save(X),h({type:"success",message:"PDF exported!"})};return Y?e.jsxs("div",{className:"loading-container",children:[e.jsx("div",{className:"spinner"}),e.jsx("p",{children:"Loading injury reports..."})]}):E?e.jsx("div",{className:"injury-reports-section card",children:e.jsx(ne,{title:"Unable to load reports",message:"There was a problem loading injury reports. Please try again.",error:E,onRetry:y})}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"injury-reports-section",children:[e.jsxs("div",{className:"section-header",children:[e.jsx("h3",{children:"Injury & Incident Reports"}),e.jsxs("div",{className:"section-header-actions",children:[m.length>0&&e.jsx("button",{className:"btn-secondary",onClick:J,children:"PDF"}),e.jsx("button",{className:"btn-primary",onClick:()=>k(!0),children:"+ File Injury Report"})]})]}),e.jsxs("div",{className:"view-mode-bar",children:[e.jsxs("div",{className:"view-mode-tabs",children:[e.jsx("button",{className:`view-mode-tab ${o==="recent"?"active":""}`,onClick:()=>{F("recent"),j({start:"",end:""})},children:"Recent (7 days)"}),e.jsxs("button",{className:`view-mode-tab ${o==="all"?"active":""}`,onClick:()=>F("all"),children:["All (",m.length,")"]})]}),o==="all"&&e.jsxs("div",{className:"date-filter",children:[e.jsx(se,{size:16}),e.jsx("input",{type:"date",value:d.start,onChange:t=>j(s=>({...s,start:t.target.value})),placeholder:"Start date"}),e.jsx("span",{children:"to"}),e.jsx("input",{type:"date",value:d.end,onChange:t=>j(s=>({...s,end:t.target.value})),placeholder:"End date"}),(d.start||d.end)&&e.jsx("button",{className:"btn-ghost",onClick:()=>j({start:"",end:""}),children:"Clear"})]})]}),N.length===0?e.jsxs("div",{className:"empty-state",children:[e.jsx("div",{className:"empty-state-icon",children:"🏥"}),e.jsxs("h4",{children:["No Injury Reports",o==="recent"?" in the last 7 days":""]}),e.jsx("p",{children:'Click "File Injury Report" to document a workplace incident'}),o==="recent"&&m.length>0&&e.jsx("button",{className:"btn-secondary",onClick:()=>F("all"),children:"View All Reports"})]}):e.jsx("div",{className:"reports-list",children:o==="all"&&p?p.map(([t,s])=>e.jsxs("div",{className:"month-group",children:[e.jsx("div",{className:"month-header",onClick:()=>V(t),children:e.jsxs("div",{className:"month-header-left",children:[D.has(t)?e.jsx(ae,{size:18}):e.jsx(ie,{size:18}),e.jsx("span",{className:"month-label",children:s.label}),e.jsxs("span",{className:"month-count",children:[s.reports.length," reports"]})]})}),D.has(t)&&e.jsx("div",{className:"month-reports",children:s.reports.map(r=>e.jsxs("div",{className:"report-card",onClick:()=>A(r),children:[e.jsxs("div",{className:"report-header",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"report-date",children:[b(r.incident_date)," at ",v(r.incident_time)]}),e.jsx("div",{className:"employee-name",children:r.employee_name})]}),e.jsxs("div",{className:"report-badges",children:[e.jsx("span",{className:"badge",style:{backgroundColor:_(r.injury_type)},children:f(r.injury_type)}),e.jsx("span",{className:"badge",style:{backgroundColor:M(r.status)},children:r.status.replace("_"," ")})]})]}),e.jsxs("div",{className:"report-summary",children:[e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Location:"})," ",r.incident_location]}),e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Reported by:"})," ",r.reported_by_name," (",r.reported_by_title,")"]}),r.body_part_affected&&e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Body Part:"})," ",r.body_part_affected]}),r.osha_recordable&&e.jsx("div",{className:"summary-item",children:e.jsx("span",{className:"osha-badge",children:"OSHA Recordable"})})]}),e.jsxs("div",{className:"report-description",children:[r.incident_description.substring(0,150),r.incident_description.length>150&&"..."]}),e.jsx("div",{className:"report-footer",children:e.jsx("span",{children:"Click to view full details"})})]},r.id))})]},t)):N.map(t=>e.jsxs("div",{className:"report-card",onClick:()=>A(t),children:[e.jsxs("div",{className:"report-header",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"report-date",children:[b(t.incident_date)," at ",v(t.incident_time)]}),e.jsx("div",{className:"employee-name",children:t.employee_name})]}),e.jsxs("div",{className:"report-badges",children:[e.jsx("span",{className:"badge",style:{backgroundColor:_(t.injury_type)},children:f(t.injury_type)}),e.jsx("span",{className:"badge",style:{backgroundColor:M(t.status)},children:t.status.replace("_"," ")})]})]}),e.jsxs("div",{className:"report-summary",children:[e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Location:"})," ",t.incident_location]}),e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Reported by:"})," ",t.reported_by_name," (",t.reported_by_title,")"]}),t.body_part_affected&&e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Body Part:"})," ",t.body_part_affected]}),t.osha_recordable&&e.jsx("div",{className:"summary-item",children:e.jsx("span",{className:"osha-badge",children:"OSHA Recordable"})})]}),e.jsxs("div",{className:"report-description",children:[t.incident_description.substring(0,150),t.incident_description.length>150&&"..."]}),e.jsx("div",{className:"report-footer",children:e.jsx("span",{children:"Click to view full details"})})]},t.id))}),a&&e.jsx("div",{className:"modal-overlay",onClick:L,children:e.jsxs("div",{className:"modal-content report-details-modal",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"modal-header",children:[e.jsx("h2",{children:"Injury Report Details"}),e.jsx("button",{className:"close-btn",onClick:L,children:"×"})]}),e.jsxs("div",{className:"modal-body",children:[e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Incident Information"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Date & Time"}),e.jsxs("div",{children:[b(a.incident_date)," at ",v(a.incident_time)]})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Location"}),e.jsx("div",{children:a.incident_location})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Injury Type"}),e.jsx("div",{children:e.jsx("span",{className:"badge",style:{backgroundColor:_(a.injury_type)},children:f(a.injury_type)})})]}),a.body_part_affected&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Body Part Affected"}),e.jsx("div",{children:a.body_part_affected})]})]}),e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Description"}),e.jsx("div",{className:"description-box",children:a.incident_description})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Injured Employee"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Name"}),e.jsx("div",{children:a.employee_name})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Job Title"}),e.jsx("div",{children:a.employee_job_title})]}),a.employee_phone&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Phone"}),e.jsx("div",{children:a.employee_phone})]}),a.employee_email&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Email"}),e.jsx("div",{children:a.employee_email})]}),a.employee_address&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Address"}),e.jsx("div",{children:a.employee_address})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Reported By"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Name"}),e.jsx("div",{children:a.reported_by_name})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Title"}),e.jsx("div",{children:a.reported_by_title})]}),a.reported_by_phone&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Phone"}),e.jsx("div",{children:a.reported_by_phone})]}),a.reported_by_email&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Email"}),e.jsx("div",{children:a.reported_by_email})]})]})]}),a.witnesses&&a.witnesses.length>0&&e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Witnesses"}),a.witnesses.map((t,s)=>e.jsxs("div",{className:"witness-card",children:[e.jsxs("div",{className:"witness-header",children:[e.jsx("strong",{children:t.name}),t.phone&&e.jsxs("span",{children:[" • ",t.phone]}),t.email&&e.jsxs("span",{children:[" • ",t.email]})]}),t.testimony&&e.jsx("div",{className:"witness-testimony",children:e.jsxs("em",{children:['"',t.testimony,'"']})})]},s))]}),a.medical_treatment_required&&e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Medical Treatment"}),e.jsxs("div",{className:"detail-grid",children:[a.medical_facility_name&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Facility"}),e.jsx("div",{children:a.medical_facility_name})]}),a.medical_facility_address&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Address"}),e.jsx("div",{children:a.medical_facility_address})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Hospitalized"}),e.jsx("div",{children:a.hospitalized?"Yes":"No"})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Actions & Safety"}),a.immediate_actions_taken&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Immediate Actions Taken"}),e.jsx("div",{className:"description-box",children:a.immediate_actions_taken})]}),a.corrective_actions_planned&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Corrective Actions Planned"}),e.jsx("div",{className:"description-box",children:a.corrective_actions_planned})]}),e.jsxs("div",{className:"detail-grid",children:[a.safety_equipment_used&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Safety Equipment Used"}),e.jsx("div",{children:a.safety_equipment_used})]}),a.safety_equipment_failed&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Safety Equipment Failed"}),e.jsx("div",{children:a.safety_equipment_failed})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Regulatory & Work Impact"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"OSHA Recordable"}),e.jsx("div",{children:a.osha_recordable?"Yes":"No"})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Workers' Comp Claim"}),e.jsx("div",{children:a.workers_comp_claim?"Yes":"No"})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Days Away From Work"}),e.jsx("div",{children:a.days_away_from_work||0})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Restricted Work Days"}),e.jsx("div",{children:a.restricted_work_days||0})]})]})]}),e.jsxs("div",{className:"report-meta",children:["Filed on ",b(a.created_at)]})]})]})}),U&&e.jsx(ee,{project:c,companyId:g,user:O,onClose:()=>k(!1),onReportCreated:G}),S&&e.jsx(te,{message:S.message,type:S.type,onClose:()=>h(null)})]}),e.jsx("style",{children:`
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
      `})]})}export{be as default};
//# sourceMappingURL=InjuryReportsList-CF-VWryg.js.map
