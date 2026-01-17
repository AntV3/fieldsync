import{d as p,j as r,T as z}from"./index-C-N7lch2.js";import{r as t}from"./icons-_xHNNQgF.js";import"./react-DXGY7bZi.js";import"./pdf-ChZ1zkDw.js";import"./supabase-VuevzHjS.js";function I({project:l,user:w,onClose:u,onShareCreated:b}){const[v,y]=t.useState(!1),[h,o]=t.useState(null),[f,N]=t.useState([]),[k,x]=t.useState(!1),[i,S]=t.useState({progress:!0,photos:!0,daily_reports:!0,tm_tickets:!1,crew_info:!1}),[s,c]=t.useState("never"),[g,_]=t.useState("");t.useEffect(()=>{d()},[l.id]);const d=async()=>{try{const e=await p.getProjectShares(l.id);N(e)}catch(e){console.error("Error loading shares:",e)}},n=e=>{S(a=>({...a,[e]:!a[e]}))},C=()=>{if(s==="never")return null;const e=new Date;if(s==="30days")e.setDate(e.getDate()+30);else if(s==="90days")e.setDate(e.getDate()+90);else if(s==="custom"&&g)return new Date(g).toISOString();return e.toISOString()},E=async()=>{y(!0);try{const e=C(),a=await p.createProjectShare(l.id,w.id,i,e);o({type:"success",message:"Share link created!"}),x(!1),d(),b&&b(a)}catch(e){console.error("Error creating share:",e),o({type:"error",message:"Failed to create share link"})}finally{y(!1)}},D=e=>{const a=`${window.location.origin}/view/${e}`;navigator.clipboard.writeText(a),o({type:"success",message:"Link copied to clipboard!"})},P=async e=>{if(confirm("Are you sure you want to revoke this share link?"))try{await p.revokeProjectShare(e),o({type:"success",message:"Share link revoked"}),d()}catch(a){console.error("Error revoking share:",a),o({type:"error",message:"Failed to revoke share link"})}},L=async e=>{if(confirm("Are you sure you want to permanently delete this share link?"))try{await p.deleteProjectShare(e),o({type:"success",message:"Share link deleted"}),d()}catch(a){console.error("Error deleting share:",a),o({type:"error",message:"Failed to delete share link"})}},j=e=>e?new Date(e).toLocaleDateString():"Never",m=e=>e?new Date(e)<new Date:!1,T=e=>{const a=[];return e.progress&&a.push("Progress"),e.photos&&a.push("Photos"),e.daily_reports&&a.push("Reports"),e.tm_tickets&&a.push("T&M"),e.crew_info&&a.push("Crew"),a.join(", ")};return r.jsxs(r.Fragment,{children:[r.jsx("div",{className:"modal-overlay",onClick:u,children:r.jsxs("div",{className:"modal-content share-modal",onClick:e=>e.stopPropagation(),children:[r.jsxs("div",{className:"modal-header",children:[r.jsxs("h2",{children:["Share Project: ",l.name]}),r.jsx("button",{className:"close-btn",onClick:u,children:"×"})]}),r.jsxs("div",{className:"modal-body",children:[f.length>0&&r.jsxs("div",{className:"existing-shares",children:[r.jsx("h3",{children:"Active Share Links"}),r.jsx("div",{className:"shares-list",children:f.map(e=>r.jsxs("div",{className:`share-item ${!e.is_active||m(e.expires_at)?"inactive":""}`,children:[r.jsxs("div",{className:"share-info",children:[r.jsxs("div",{className:"share-token",children:[r.jsxs("code",{children:[window.location.origin,"/view/",e.share_token]}),r.jsx("button",{className:"btn-small",onClick:()=>D(e.share_token),disabled:!e.is_active||m(e.expires_at),children:"Copy"})]}),r.jsxs("div",{className:"share-meta",children:[r.jsx("span",{className:"permissions",children:T(e.permissions)}),r.jsxs("span",{className:"expiry",children:["Expires: ",j(e.expires_at)]}),r.jsxs("span",{className:"views",children:["Views: ",e.view_count||0,e.last_viewed_at&&` (Last: ${j(e.last_viewed_at)})`]})]}),!e.is_active&&r.jsx("div",{className:"status-badge revoked",children:"Revoked"}),m(e.expires_at)&&e.is_active&&r.jsx("div",{className:"status-badge expired",children:"Expired"})]}),r.jsxs("div",{className:"share-actions",children:[e.is_active&&!m(e.expires_at)&&r.jsx("button",{className:"btn-secondary",onClick:()=>P(e.id),children:"Revoke"}),r.jsx("button",{className:"btn-danger",onClick:()=>L(e.id),children:"Delete"})]})]},e.id))})]}),!k&&r.jsx("button",{className:"btn-primary",onClick:()=>x(!0),children:"+ Create New Share Link"}),k&&r.jsxs("div",{className:"new-share-form",children:[r.jsx("h3",{children:"Create New Share Link"}),r.jsxs("div",{className:"form-section",children:[r.jsx("label",{children:"Permissions"}),r.jsxs("div",{className:"checkbox-group",children:[r.jsxs("label",{children:[r.jsx("input",{type:"checkbox",checked:i.progress,onChange:()=>n("progress")}),"Progress/completion status"]}),r.jsxs("label",{children:[r.jsx("input",{type:"checkbox",checked:i.photos,onChange:()=>n("photos")}),"Photos feed"]}),r.jsxs("label",{children:[r.jsx("input",{type:"checkbox",checked:i.daily_reports,onChange:()=>n("daily_reports")}),"Daily reports"]}),r.jsxs("label",{children:[r.jsx("input",{type:"checkbox",checked:i.tm_tickets,onChange:()=>n("tm_tickets")}),"T&M tickets"]}),r.jsxs("label",{children:[r.jsx("input",{type:"checkbox",checked:i.crew_info,onChange:()=>n("crew_info")}),"Crew information"]})]})]}),r.jsxs("div",{className:"form-section",children:[r.jsx("label",{children:"Link Expiration"}),r.jsxs("div",{className:"radio-group",children:[r.jsxs("label",{children:[r.jsx("input",{type:"radio",value:"never",checked:s==="never",onChange:e=>c(e.target.value)}),"Never expires"]}),r.jsxs("label",{children:[r.jsx("input",{type:"radio",value:"30days",checked:s==="30days",onChange:e=>c(e.target.value)}),"30 days"]}),r.jsxs("label",{children:[r.jsx("input",{type:"radio",value:"90days",checked:s==="90days",onChange:e=>c(e.target.value)}),"90 days"]}),r.jsxs("label",{children:[r.jsx("input",{type:"radio",value:"custom",checked:s==="custom",onChange:e=>c(e.target.value)}),"Custom date"]})]}),s==="custom"&&r.jsx("input",{type:"date",value:g,onChange:e=>_(e.target.value),min:new Date().toISOString().split("T")[0],className:"date-input"})]}),r.jsxs("div",{className:"form-actions",children:[r.jsx("button",{className:"btn-secondary",onClick:()=>x(!1),children:"Cancel"}),r.jsx("button",{className:"btn-primary",onClick:E,disabled:v,children:v?"Generating...":"Generate Share Link"})]})]})]})]})}),h&&r.jsx(z,{message:h.message,type:h.type,onClose:()=>o(null)}),r.jsx("style",{children:`
        .share-modal {
          max-width: 700px;
          max-height: 80vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-bottom: 1px solid var(--border-color);
        }

        .modal-header h2 {
          margin: 0;
          font-size: 1.25rem;
          color: var(--text-primary);
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 2rem;
          cursor: pointer;
          color: var(--text-secondary);
          padding: 0;
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          color: var(--text-primary);
        }

        .modal-body {
          padding: 1.5rem;
        }

        .existing-shares {
          margin-bottom: 2rem;
        }

        .existing-shares h3 {
          margin-top: 0;
          margin-bottom: 1rem;
          font-size: 1.1rem;
          color: var(--text-primary);
        }

        .shares-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .share-item {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          background: var(--bg-card);
        }

        .share-item.inactive {
          opacity: 0.6;
          background-color: var(--bg-elevated);
        }

        .share-info {
          flex: 1;
        }

        .share-token {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .share-token code {
          background-color: var(--bg-elevated);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.875rem;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-primary);
        }

        .share-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
          margin-top: 0.5rem;
        }

        .status-badge.revoked {
          background-color: #fee2e2;
          color: #991b1b;
        }

        .status-badge.expired {
          background-color: #fef3c7;
          color: #92400e;
        }

        .share-actions {
          display: flex;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .new-share-form {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 1.5rem;
          background-color: var(--bg-elevated);
        }

        .new-share-form h3 {
          margin-top: 0;
          margin-bottom: 1.5rem;
          font-size: 1.1rem;
          color: var(--text-primary);
        }

        .form-section {
          margin-bottom: 1.5rem;
        }

        .form-section label {
          display: block;
          font-weight: 500;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .checkbox-group,
        .radio-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .checkbox-group label,
        .radio-group label {
          font-weight: normal;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .checkbox-group input[type="checkbox"],
        .radio-group input[type="radio"] {
          margin: 0;
        }

        .date-input {
          margin-top: 0.5rem;
          padding: 0.5rem;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          width: 100%;
          background: var(--bg-card);
          color: var(--text-primary);
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
          margin-top: 1.5rem;
        }

        .btn-small {
          padding: 0.25rem 0.75rem;
          font-size: 0.875rem;
          border: 1px solid var(--border-color);
          background-color: var(--bg-card);
          color: var(--text-primary);
          border-radius: 4px;
          cursor: pointer;
        }

        .btn-small:hover:not(:disabled) {
          background-color: var(--bg-elevated);
        }

        .btn-small:disabled {
          opacity: 0.5;
          cursor: not-allowed;
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
      `})]})}export{I as default};
//# sourceMappingURL=ShareModal-5ervVSOa.js.map
