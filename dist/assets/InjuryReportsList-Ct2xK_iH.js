import{_ as te}from"./pdf-aQqpMATS.js";import{u as re,d as k,j as e,I as se,T as ae,k as T,l as ie}from"./index-CoXcC4l6.js";import{r as d,Y as ne,q as le,y as oe}from"./icons-DdhIMWD5.js";import{al as de}from"./Dashboard-cpOJxrYC.js";import"./react-DXGY7bZi.js";import"./supabase-VuevzHjS.js";import"./corCalculations-D9qkkIbo.js";const ce=()=>te(()=>import("./pdf-aQqpMATS.js").then(c=>c.j),[]);function ye({project:c,companyId:b,company:W,user:U,onShowToast:me}){const{branding:y}=re(),[p,Y]=d.useState([]),[s,I]=d.useState(null),[V,F]=d.useState(!1),[G,P]=d.useState(!0),[E,A]=d.useState(null),[S,x]=d.useState(null),[m,D]=d.useState("recent"),[R,$]=d.useState(new Set),[h,v]=d.useState({start:"",end:""});d.useEffect(()=>{f();const r=b||c?.company_id,a=r?k.subscribeToInjuryReports?.(r,()=>{f()}):null;return()=>{a&&k.unsubscribe?.(a)}},[c?.id,b]);const f=d.useCallback(async()=>{P(!0),A(null);try{const r=c?await k.getInjuryReports(c.id):await k.getCompanyInjuryReports(b);Y(r)}catch(r){console.error("Error loading injury reports:",r),A(r),x({type:"error",message:"Failed to load injury reports"})}finally{P(!1)}},[c?.id,b]),J=()=>{f(),F(!1),x({type:"success",message:"Injury report created successfully"})},L=r=>{I(r)},M=()=>{I(null)},j=r=>r?new Date(r).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}):"",_=r=>r?new Date(`2000-01-01T${r}`).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}):"",N=r=>({minor:"Minor Injury",serious:"Serious Injury",critical:"Critical Injury",near_miss:"Near Miss"})[r]||r,O=r=>({reported:"#fbbf24",under_investigation:"#3b82f6",closed:"#10b981"})[r]||"#9ca3af",w=r=>({minor:"#10b981",serious:"#f59e0b",critical:"#ef4444",near_miss:"#6b7280"})[r]||"#9ca3af",C=d.useMemo(()=>{let r=[...p];if(h.start){const a=new Date(h.start);a.setHours(0,0,0,0),r=r.filter(t=>new Date(t.incident_date)>=a)}if(h.end){const a=new Date(h.end);a.setHours(23,59,59,999),r=r.filter(t=>new Date(t.incident_date)<=a)}if(m==="recent"){const a=new Date;a.setDate(a.getDate()-7),a.setHours(0,0,0,0),r=r.filter(t=>new Date(t.incident_date)>=a)}return r},[p,m,h]),g=d.useMemo(()=>{if(m!=="all")return null;const r={};return C.forEach(a=>{const t=new Date(a.incident_date),o=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}`,n=t.toLocaleDateString("en-US",{month:"long",year:"numeric"});r[o]||(r[o]={label:n,reports:[]}),r[o].reports.push(a)}),Object.entries(r).sort((a,t)=>t[0].localeCompare(a[0]))},[C,m]);d.useEffect(()=>{if(g&&g.length>0){const r=g[0][0];$(new Set([r]))}},[g]);const Q=r=>{const a=new Set(R);a.has(r)?a.delete(r):a.add(r),$(a)},X=async()=>{if(p.length===0){x({type:"error",message:"No reports to export"});return}x({type:"info",message:"Generating PDF..."});const a=(await ce()).default,t=new a,o=t.internal.pageSize.getWidth(),n=20;let l=n;const q=T(y?.primary_color||"#3B82F6"),Z=T(y?.secondary_color||"#1E40AF");t.setFillColor(...q),t.rect(0,0,o,45,"F"),t.setFillColor(...Z),t.rect(0,42,o,3,"F");let z=n;if(y?.logo_url)try{const i=await ie(y.logo_url);i&&(t.addImage(i,"PNG",n,7,30,30),z=n+40)}catch(i){console.error("Error adding logo:",i)}t.setTextColor(255,255,255),t.setFontSize(22),t.setFont("helvetica","bold"),t.text(W?.name||"Company",z,20),t.setFontSize(10),t.setFont("helvetica","normal"),t.text("INJURY & INCIDENT REPORTS",z,30),t.setFontSize(9),t.text(`Generated: ${new Date().toLocaleDateString()}`,o-n,20,{align:"right"}),t.text(`Total Reports: ${p.length}`,o-n,28,{align:"right"}),l=55,c&&(t.setFillColor(248,250,252),t.rect(n,l-5,o-n*2,15,"F"),t.setTextColor(...q),t.setFontSize(12),t.setFont("helvetica","bold"),t.text(`Project: ${c.name}`,n+5,l+5),l+=20),p.forEach(i=>{l>200&&(t.addPage(),l=n);const ee=T(w(i.injury_type));t.setFillColor(...ee),t.rect(n,l,o-n*2,12,"F"),t.setTextColor(255,255,255),t.setFontSize(11),t.setFont("helvetica","bold"),t.text(`${i.employee_name} - ${N(i.injury_type)}`,n+5,l+8),t.text(j(i.incident_date),o-n-5,l+8,{align:"right"}),l+=17,t.setTextColor(50,50,50),t.setFontSize(9),t.setFont("helvetica","normal"),t.text(`Location: ${i.incident_location}`,n+5,l),i.incident_time&&t.text(`Time: ${_(i.incident_time)}`,n+100,l),l+=6,t.setFont("helvetica","bold"),t.text("Description:",n+5,l),t.setFont("helvetica","normal"),l+=5;const H=t.splitTextToSize(i.incident_description,o-n*2-10);t.text(H,n+5,l),l+=H.length*4+3;const u=[];i.body_part_affected&&u.push(`Body Part: ${i.body_part_affected}`),i.osha_recordable&&u.push("OSHA Recordable"),i.workers_comp_claim&&u.push("Workers' Comp Filed"),i.medical_treatment_required&&u.push("Medical Treatment Required"),u.length>0&&(t.setFontSize(8),t.setTextColor(100,100,100),t.text(u.join("  |  "),n+5,l),l+=5),t.setFontSize(8),t.text(`Reported by: ${i.reported_by_name} (${i.reported_by_title})`,n+5,l),l+=12});const B=t.internal.getNumberOfPages();for(let i=1;i<=B;i++)t.setPage(i),t.setFontSize(8),t.setTextColor(150,150,150),t.text(`Page ${i} of ${B}`,o/2,t.internal.pageSize.getHeight()-10,{align:"center"}),t.text("CONFIDENTIAL - Injury Report",n,t.internal.pageSize.getHeight()-10);const K=`Injury_Reports_${new Date().toISOString().split("T")[0]}.pdf`;t.save(K),x({type:"success",message:"PDF exported!"})};return G?e.jsxs("div",{className:"loading-container",children:[e.jsx("div",{className:"spinner"}),e.jsx("p",{children:"Loading injury reports..."})]}):E?e.jsx("div",{className:"injury-reports-section card",children:e.jsx(de,{title:"Unable to load reports",message:"There was a problem loading injury reports. Please try again.",error:E,onRetry:f})}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"injury-reports-section",children:[e.jsxs("div",{className:"section-header",children:[e.jsx("h3",{children:"Injury & Incident Reports"}),e.jsxs("div",{className:"section-header-actions",children:[p.length>0&&e.jsx("button",{className:"btn-secondary",onClick:X,children:"PDF"}),e.jsx("button",{className:"btn-primary",onClick:()=>F(!0),children:"+ File Injury Report"})]})]}),e.jsxs("div",{className:"view-mode-bar",children:[e.jsxs("div",{className:"view-mode-tabs",children:[e.jsx("button",{className:`view-mode-tab ${m==="recent"?"active":""}`,onClick:()=>{D("recent"),v({start:"",end:""})},children:"Recent (7 days)"}),e.jsxs("button",{className:`view-mode-tab ${m==="all"?"active":""}`,onClick:()=>D("all"),children:["All (",p.length,")"]})]}),m==="all"&&e.jsxs("div",{className:"date-filter",children:[e.jsx(ne,{size:16}),e.jsx("input",{type:"date",value:h.start,onChange:r=>v(a=>({...a,start:r.target.value})),placeholder:"Start date"}),e.jsx("span",{children:"to"}),e.jsx("input",{type:"date",value:h.end,onChange:r=>v(a=>({...a,end:r.target.value})),placeholder:"End date"}),(h.start||h.end)&&e.jsx("button",{className:"btn-ghost",onClick:()=>v({start:"",end:""}),children:"Clear"})]})]}),C.length===0?e.jsxs("div",{className:"empty-state",children:[e.jsx("div",{className:"empty-state-icon",children:"🏥"}),e.jsxs("h4",{children:["No Injury Reports",m==="recent"?" in the last 7 days":""]}),e.jsx("p",{children:'Click "File Injury Report" to document a workplace incident'}),m==="recent"&&p.length>0&&e.jsx("button",{className:"btn-secondary",onClick:()=>D("all"),children:"View All Reports"})]}):e.jsx("div",{className:"reports-list",children:m==="all"&&g?g.map(([r,a])=>e.jsxs("div",{className:"month-group",children:[e.jsx("div",{className:"month-header",onClick:()=>Q(r),children:e.jsxs("div",{className:"month-header-left",children:[R.has(r)?e.jsx(le,{size:18}):e.jsx(oe,{size:18}),e.jsx("span",{className:"month-label",children:a.label}),e.jsxs("span",{className:"month-count",children:[a.reports.length," reports"]})]})}),R.has(r)&&e.jsx("div",{className:"month-reports",children:a.reports.map(t=>e.jsxs("div",{className:"report-card",onClick:()=>L(t),children:[e.jsxs("div",{className:"report-header",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"report-date",children:[j(t.incident_date)," at ",_(t.incident_time)]}),e.jsx("div",{className:"employee-name",children:t.employee_name})]}),e.jsxs("div",{className:"report-badges",children:[e.jsx("span",{className:"badge",style:{backgroundColor:w(t.injury_type)},children:N(t.injury_type)}),e.jsx("span",{className:"badge",style:{backgroundColor:O(t.status)},children:t.status.replace("_"," ")})]})]}),e.jsxs("div",{className:"report-summary",children:[e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Location:"})," ",t.incident_location]}),e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Reported by:"})," ",t.reported_by_name," (",t.reported_by_title,")"]}),t.body_part_affected&&e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Body Part:"})," ",t.body_part_affected]}),t.osha_recordable&&e.jsx("div",{className:"summary-item",children:e.jsx("span",{className:"osha-badge",children:"OSHA Recordable"})})]}),e.jsxs("div",{className:"report-description",children:[t.incident_description.substring(0,150),t.incident_description.length>150&&"..."]}),e.jsx("div",{className:"report-footer",children:e.jsx("span",{children:"Click to view full details"})})]},t.id))})]},r)):C.map(r=>e.jsxs("div",{className:"report-card",onClick:()=>L(r),children:[e.jsxs("div",{className:"report-header",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"report-date",children:[j(r.incident_date)," at ",_(r.incident_time)]}),e.jsx("div",{className:"employee-name",children:r.employee_name})]}),e.jsxs("div",{className:"report-badges",children:[e.jsx("span",{className:"badge",style:{backgroundColor:w(r.injury_type)},children:N(r.injury_type)}),e.jsx("span",{className:"badge",style:{backgroundColor:O(r.status)},children:r.status.replace("_"," ")})]})]}),e.jsxs("div",{className:"report-summary",children:[e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Location:"})," ",r.incident_location]}),e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Reported by:"})," ",r.reported_by_name," (",r.reported_by_title,")"]}),r.body_part_affected&&e.jsxs("div",{className:"summary-item",children:[e.jsx("strong",{children:"Body Part:"})," ",r.body_part_affected]}),r.osha_recordable&&e.jsx("div",{className:"summary-item",children:e.jsx("span",{className:"osha-badge",children:"OSHA Recordable"})})]}),e.jsxs("div",{className:"report-description",children:[r.incident_description.substring(0,150),r.incident_description.length>150&&"..."]}),e.jsx("div",{className:"report-footer",children:e.jsx("span",{children:"Click to view full details"})})]},r.id))}),s&&e.jsx("div",{className:"modal-overlay",onClick:M,children:e.jsxs("div",{className:"modal-content report-details-modal",onClick:r=>r.stopPropagation(),children:[e.jsxs("div",{className:"modal-header",children:[e.jsx("h2",{children:"Injury Report Details"}),e.jsx("button",{className:"close-btn",onClick:M,children:"×"})]}),e.jsxs("div",{className:"modal-body",children:[e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Incident Information"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Date & Time"}),e.jsxs("div",{children:[j(s.incident_date)," at ",_(s.incident_time)]})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Location"}),e.jsx("div",{children:s.incident_location})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Injury Type"}),e.jsx("div",{children:e.jsx("span",{className:"badge",style:{backgroundColor:w(s.injury_type)},children:N(s.injury_type)})})]}),s.body_part_affected&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Body Part Affected"}),e.jsx("div",{children:s.body_part_affected})]})]}),e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Description"}),e.jsx("div",{className:"description-box",children:s.incident_description})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Injured Employee"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Name"}),e.jsx("div",{children:s.employee_name})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Job Title"}),e.jsx("div",{children:s.employee_job_title})]}),s.employee_phone&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Phone"}),e.jsx("div",{children:s.employee_phone})]}),s.employee_email&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Email"}),e.jsx("div",{children:s.employee_email})]}),s.employee_address&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Address"}),e.jsx("div",{children:s.employee_address})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Reported By"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Name"}),e.jsx("div",{children:s.reported_by_name})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Title"}),e.jsx("div",{children:s.reported_by_title})]}),s.reported_by_phone&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Phone"}),e.jsx("div",{children:s.reported_by_phone})]}),s.reported_by_email&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Email"}),e.jsx("div",{children:s.reported_by_email})]})]})]}),s.witnesses&&s.witnesses.length>0&&e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Witnesses"}),s.witnesses.map((r,a)=>e.jsxs("div",{className:"witness-card",children:[e.jsxs("div",{className:"witness-header",children:[e.jsx("strong",{children:r.name}),r.phone&&e.jsxs("span",{children:[" • ",r.phone]}),r.email&&e.jsxs("span",{children:[" • ",r.email]})]}),r.testimony&&e.jsx("div",{className:"witness-testimony",children:e.jsxs("em",{children:['"',r.testimony,'"']})})]},a))]}),s.medical_treatment_required&&e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Medical Treatment"}),e.jsxs("div",{className:"detail-grid",children:[s.medical_facility_name&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Facility"}),e.jsx("div",{children:s.medical_facility_name})]}),s.medical_facility_address&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Address"}),e.jsx("div",{children:s.medical_facility_address})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Hospitalized"}),e.jsx("div",{children:s.hospitalized?"Yes":"No"})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Actions & Safety"}),s.immediate_actions_taken&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Immediate Actions Taken"}),e.jsx("div",{className:"description-box",children:s.immediate_actions_taken})]}),s.corrective_actions_planned&&e.jsxs("div",{className:"detail-item full-width",children:[e.jsx("label",{children:"Corrective Actions Planned"}),e.jsx("div",{className:"description-box",children:s.corrective_actions_planned})]}),e.jsxs("div",{className:"detail-grid",children:[s.safety_equipment_used&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Safety Equipment Used"}),e.jsx("div",{children:s.safety_equipment_used})]}),s.safety_equipment_failed&&e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Safety Equipment Failed"}),e.jsx("div",{children:s.safety_equipment_failed})]})]})]}),e.jsxs("section",{className:"details-section",children:[e.jsx("h3",{children:"Regulatory & Work Impact"}),e.jsxs("div",{className:"detail-grid",children:[e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"OSHA Recordable"}),e.jsx("div",{children:s.osha_recordable?"Yes":"No"})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Workers' Comp Claim"}),e.jsx("div",{children:s.workers_comp_claim?"Yes":"No"})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Days Away From Work"}),e.jsx("div",{children:s.days_away_from_work||0})]}),e.jsxs("div",{className:"detail-item",children:[e.jsx("label",{children:"Restricted Work Days"}),e.jsx("div",{children:s.restricted_work_days||0})]})]})]}),e.jsxs("div",{className:"report-meta",children:["Filed on ",j(s.created_at)]})]})]})}),V&&e.jsx(se,{project:c,companyId:b,user:U,onClose:()=>F(!1),onReportCreated:J}),S&&e.jsx(ae,{message:S.message,type:S.type,onClose:()=>x(null)})]}),e.jsx("style",{children:`
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
      `})]})}export{ye as default};
//# sourceMappingURL=InjuryReportsList-Ct2xK_iH.js.map
