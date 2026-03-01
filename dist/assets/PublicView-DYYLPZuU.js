import{aF as y,ar as N,as as e,aT as k}from"./index-Dq4629GT.js";import{r as i,T as z}from"./icons-BDU0tZd_.js";import"./react-DXGY7bZi.js";import"./pdf-Dbgi5wV4.js";import"./supabase-VuevzHjS.js";function C({shareToken:p}){const[x,h]=i.useState(!0),[g,o]=i.useState(null),[f,b]=i.useState(null),{branding:j}=y();i.useEffect(()=>{v()},[p]);const v=async()=>{h(!0),o(null);try{const r=await N.getPublicProjectData(p);if(!r){o("This share link is invalid or has expired.");return}b(r)}catch(r){console.error("Error loading public data:",r),o("Failed to load project data.")}finally{h(!1)}},n=r=>r?new Date(r).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}):"",w=r=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:0,maximumFractionDigits:0}).format(r);if(x)return e.jsxs("div",{className:"public-view",children:[e.jsxs("div",{className:"loading-container",children:[e.jsx("div",{className:"spinner"}),e.jsx("p",{children:"Loading project..."})]}),e.jsx("style",{children:m})]});if(g)return e.jsxs("div",{className:"public-view",children:[e.jsxs("div",{className:"error-container",children:[e.jsx("div",{className:"error-icon",children:e.jsx(z,{size:48})}),e.jsx("h2",{children:g}),e.jsx("p",{children:"Please contact the project owner for a valid link."})]}),e.jsx("style",{children:m})]});const{share:l,project:t,progress:u,areas:s,dailyReports:c,tmTickets:d}=f;return e.jsxs("div",{className:"public-view",children:[e.jsx("header",{className:"public-header",children:e.jsxs("div",{className:"container",children:[e.jsx(k,{size:"large"}),e.jsx("div",{className:"header-meta",children:e.jsxs("span",{className:"last-updated",children:["Last updated: ",n(t.updated_at||t.created_at)]})})]})}),e.jsx("main",{className:"public-main",children:e.jsxs("div",{className:"container",children:[e.jsxs("div",{className:"project-header",children:[e.jsx("h1",{children:t.name}),t.address&&e.jsx("p",{className:"project-address",children:t.address})]}),l.permissions.progress&&e.jsxs("div",{className:"public-card progress-card",children:[e.jsx("h2",{children:"Project Progress"}),e.jsxs("div",{className:"progress-visual",children:[e.jsxs("div",{className:"progress-circle",children:[e.jsxs("svg",{viewBox:"0 0 100 100",children:[e.jsx("circle",{cx:"50",cy:"50",r:"45",fill:"none",stroke:"#e5e7eb",strokeWidth:"8"}),e.jsx("circle",{cx:"50",cy:"50",r:"45",fill:"none",stroke:"var(--primary-color, #3b82f6)",strokeWidth:"8",strokeDasharray:`${u*2.827} 282.7`,strokeLinecap:"round",transform:"rotate(-90 50 50)"})]}),e.jsxs("div",{className:"progress-percentage",children:[u,"%"]})]}),e.jsxs("div",{className:"progress-details",children:[e.jsx("div",{className:"progress-label",children:"Complete"}),s&&s.length>0&&e.jsxs("div",{className:"areas-summary",children:[s.filter(r=>r.status==="done").length," of ",s.length," areas completed"]})]})]}),s&&s.length>0&&e.jsxs("div",{className:"areas-list",children:[e.jsx("h3",{children:"Work Areas"}),s.map(r=>e.jsxs("div",{className:"area-item",children:[e.jsxs("div",{className:"area-info",children:[e.jsx("span",{className:"area-name",children:r.name}),e.jsxs("span",{className:"area-weight",children:[r.weight,"%"]})]}),e.jsx("div",{className:`area-status status-${r.status}`,children:r.status==="done"?"✓ Complete":r.status==="working"?"⚙ In Progress":"○ Not Started"})]},r.id))]})]}),l.permissions.daily_reports&&c&&c.length>0&&e.jsxs("div",{className:"public-card reports-card",children:[e.jsx("h2",{children:"Daily Reports"}),e.jsx("div",{className:"reports-list",children:c.map((r,a)=>e.jsxs("div",{className:"report-item",children:[e.jsx("div",{className:"report-date",children:n(r.report_date)}),e.jsxs("div",{className:"report-content",children:[r.crew_count&&e.jsxs("div",{className:"report-field",children:[e.jsx("strong",{children:"Crew:"})," ",r.crew_count," workers"]}),r.tasks_completed&&e.jsxs("div",{className:"report-field",children:[e.jsx("strong",{children:"Tasks Completed:"})," ",r.tasks_completed]}),r.weather&&e.jsxs("div",{className:"report-field",children:[e.jsx("strong",{children:"Weather:"})," ",r.weather]}),r.notes&&e.jsxs("div",{className:"report-field",children:[e.jsx("strong",{children:"Notes:"})," ",r.notes]})]})]},a))})]}),l.permissions.tm_tickets&&d&&d.length>0&&e.jsxs("div",{className:"public-card tm-card",children:[e.jsx("h2",{children:"Time & Materials Tickets"}),e.jsx("div",{className:"tm-list",children:d.map((r,a)=>e.jsxs("div",{className:"tm-item",children:[e.jsxs("div",{className:"tm-header",children:[e.jsx("span",{className:"tm-date",children:n(r.work_date)}),e.jsx("span",{className:`tm-status status-${r.status}`,children:r.status})]}),r.notes&&e.jsx("div",{className:"tm-description",children:r.notes}),r.total_amount&&e.jsxs("div",{className:"tm-amount",children:["Total: ",w(r.total_amount)]})]},a))})]})]})}),e.jsx("footer",{className:"public-footer",children:e.jsx("div",{className:"container",children:!j?.hide_fieldsync_branding&&e.jsx("p",{children:"Powered by FieldSync"})})}),e.jsx("style",{children:m})]})}const m=`
  .public-view {
    min-height: 100vh;
    background-color: #f9fafb;
    display: flex;
    flex-direction: column;
  }

  .container {
    max-width: 1000px;
    margin: 0 auto;
    padding: 0 1rem;
    width: 100%;
  }

  /* Header */
  .public-header {
    background-color: white;
    border-bottom: 1px solid #e5e7eb;
    padding: 1.5rem 0;
  }

  .public-header .container {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .header-meta {
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Main Content */
  .public-main {
    flex: 1;
    padding: 2rem 0;
  }

  .project-header {
    margin-bottom: 2rem;
  }

  .project-header h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
    color: #111827;
  }

  .project-address {
    font-size: 1rem;
    color: #6b7280;
    margin: 0;
  }

  /* Cards */
  .public-card {
    background-color: white;
    border-radius: 12px;
    padding: 2rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .public-card h2 {
    font-size: 1.5rem;
    margin: 0 0 1.5rem 0;
    color: #111827;
  }

  .public-card h3 {
    font-size: 1.125rem;
    margin: 1.5rem 0 1rem 0;
    color: #374151;
  }

  /* Progress Card */
  .progress-visual {
    display: flex;
    align-items: center;
    gap: 2rem;
    margin-bottom: 2rem;
  }

  .progress-circle {
    position: relative;
    width: 150px;
    height: 150px;
    flex-shrink: 0;
  }

  .progress-circle svg {
    width: 100%;
    height: 100%;
  }

  .progress-percentage {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 2rem;
    font-weight: bold;
    color: var(--primary-color, #3b82f6);
  }

  .progress-details {
    flex: 1;
  }

  .progress-label {
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.5rem;
  }

  .areas-summary {
    font-size: 1rem;
    color: #6b7280;
  }

  /* Areas List */
  .areas-list {
    border-top: 1px solid #e5e7eb;
    padding-top: 1rem;
  }

  .area-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid #f3f4f6;
  }

  .area-item:last-child {
    border-bottom: none;
  }

  .area-info {
    flex: 1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-right: 1rem;
  }

  .area-name {
    font-weight: 500;
    color: #374151;
  }

  .area-weight {
    color: #6b7280;
    font-size: 0.875rem;
  }

  .area-status {
    padding: 0.25rem 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .area-status.status-done {
    background-color: #d1fae5;
    color: #065f46;
  }

  .area-status.status-working {
    background-color: #fef3c7;
    color: #92400e;
  }

  .area-status.status-not_started {
    background-color: #f3f4f6;
    color: #6b7280;
  }

  /* Photos Carousel */
  .photos-carousel {
    position: relative;
  }

  .carousel-main {
    position: relative;
    width: 100%;
    height: 400px;
    background-color: #111827;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 1rem;
  }

  .carousel-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .carousel-date {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
    color: white;
    padding: 1rem;
    text-align: center;
  }

  .carousel-thumbnails {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
    margin-bottom: 1rem;
  }

  .thumbnail {
    flex-shrink: 0;
    width: 80px;
    height: 80px;
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.2s;
  }

  .thumbnail:hover {
    border-color: #d1d5db;
  }

  .thumbnail.active {
    border-color: var(--primary-color, #3b82f6);
  }

  .thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .carousel-controls {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
  }

  .carousel-btn {
    background-color: white;
    border: 1px solid #d1d5db;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 1.25rem;
    transition: background-color 0.2s;
  }

  .carousel-btn:hover {
    background-color: #f3f4f6;
  }

  .carousel-counter {
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Daily Reports */
  .reports-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .report-item {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
  }

  .report-date {
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.75rem;
    font-size: 1.125rem;
  }

  .report-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .report-field {
    color: #374151;
    line-height: 1.5;
  }

  .report-field strong {
    color: #111827;
  }

  /* T&M Tickets */
  .tm-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .tm-item {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
  }

  .tm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .tm-date {
    font-weight: 600;
    color: #111827;
  }

  .tm-status {
    padding: 0.25rem 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    text-transform: capitalize;
  }

  .tm-status.status-approved {
    background-color: #d1fae5;
    color: #065f46;
  }

  .tm-status.status-pending {
    background-color: #fef3c7;
    color: #92400e;
  }

  .tm-status.status-rejected {
    background-color: #fee2e2;
    color: #991b1b;
  }

  .tm-description {
    color: #374151;
    margin-bottom: 0.5rem;
  }

  .tm-amount {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--primary-color, #3b82f6);
  }

  /* Footer */
  .public-footer {
    background-color: white;
    border-top: 1px solid #e5e7eb;
    padding: 2rem 0;
    margin-top: auto;
  }

  .public-footer p {
    text-align: center;
    color: #6b7280;
    margin: 0;
    font-size: 0.875rem;
  }

  /* Loading & Error States */
  .loading-container,
  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 4px solid #e5e7eb;
    border-top-color: var(--primary-color, #3b82f6);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-container p {
    margin-top: 1rem;
    color: #6b7280;
  }

  .error-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .error-container h2 {
    color: #111827;
    margin: 0 0 0.5rem 0;
  }

  .error-container p {
    color: #6b7280;
    margin: 0;
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .project-header h1 {
      font-size: 1.5rem;
    }

    .public-card {
      padding: 1.5rem;
    }

    .progress-visual {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .progress-circle {
      width: 120px;
      height: 120px;
    }

    .progress-percentage {
      font-size: 1.5rem;
    }

    .carousel-main {
      height: 300px;
    }

    .area-item {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .area-info {
      width: 100%;
      margin-right: 0;
    }
  }
`;export{C as default};
//# sourceMappingURL=PublicView-DYYLPZuU.js.map
