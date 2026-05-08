const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/fieldObservationsPdfGenerator-B-vn-CeI.js","assets/pdf-Bj9PxjIU.js","assets/index-D6A-_JL8.js","assets/icons-QfUrUjv8.js","assets/react-Dmg9LnoR.js","assets/supabase-DRKLkoQk.js","assets/index-C4nybsfA.css","assets/pdfBranding-9p7lxBWm.js"])))=>i.map(i=>d[i]);
import{_ as R}from"./pdf-Bj9PxjIU.js";import{i as $,d as m,j as e}from"./index-D6A-_JL8.js";import{b as t,am as k,j as z,ar as A,D as B,af as G,w as I,d as T,l as V,at as q,o as H}from"./icons-QfUrUjv8.js";import"./react-Dmg9LnoR.js";import"./supabase-DRKLkoQk.js";function Y({project:l,company:E,onShowToast:n}){const{branding:v}=$(),[d,F]=t.useState([]),[_,C]=t.useState(!0),[c,D]=t.useState(null),[f,P]=t.useState({}),[s,g]=t.useState({start:"",end:""}),[x,O]=t.useState(!1),[y,j]=t.useState(!1);t.useEffect(()=>{l?.id&&w()},[l?.id]),t.useEffect(()=>{if(!l?.id)return;const r=m.subscribeToFieldObservations?.(l.id,()=>w());return()=>{r&&m.unsubscribe?.(r)}},[l?.id]);const w=t.useCallback(async()=>{try{const r=await m.getFieldObservations(l.id,{limit:1e3});F(r||[])}catch(r){console.error("Error loading field observations:",r),n?.("Error loading observations","error")}finally{C(!1)}},[l?.id,n]);t.useEffect(()=>{if(!c)return;const r=d.find(o=>o.id===c);!r?.photos?.length||f[c]||m.resolvePhotoUrls(r.photos).then(o=>{P(a=>({...a,[c]:o}))}).catch(o=>console.error("Error resolving photos:",o))},[c,d,f]);const i=t.useMemo(()=>{let r=[...d];return s.start&&(r=r.filter(o=>o.observation_date>=s.start)),s.end&&(r=r.filter(o=>o.observation_date<=s.end)),r},[d,s]),U=t.useMemo(()=>{const r={};return i.forEach(o=>{const a=o.observation_date;r[a]||(r[a]=[]),r[a].push(o)}),Object.entries(r).sort((o,a)=>a[0].localeCompare(o[0]))},[i]),h=t.useMemo(()=>i.reduce((r,o)=>r+(o.photos?.length||0),0),[i]),L=r=>new Date(r+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}),S=r=>new Date(r).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),M=async()=>{if(i.length===0){n?.("No observations to export","error");return}j(!0),n?.("Generating PDF...","info");try{const{generateFieldObservationsPDF:r}=await R(async()=>{const{generateFieldObservationsPDF:a}=await import("./fieldObservationsPdfGenerator-B-vn-CeI.js");return{generateFieldObservationsPDF:a}},__vite__mapDeps([0,1,2,3,4,5,6,7])),o=await r(i,{project:l,company:E,branding:{primaryColor:v?.primary_color,logoUrl:v?.logo_url},dateRange:s});o?.success&&n?.(`Exported ${o.observationCount} observations`,"success")}catch(r){console.error("Export failed:",r),n?.("Export failed","error")}finally{j(!1)}};return e.jsxs("div",{className:"fol-container",children:[e.jsxs("div",{className:"fol-toolbar",children:[e.jsxs("div",{className:"fol-stats",children:[e.jsxs("span",{className:"fol-stat",children:[e.jsx(k,{size:14}),e.jsx("strong",{children:i.length})," observation",i.length!==1?"s":""]}),h>0&&e.jsxs("span",{className:"fol-stat",children:[e.jsx(z,{size:14}),e.jsx("strong",{children:h})," photo",h!==1?"s":""]})]}),e.jsxs("div",{className:"fol-actions",children:[e.jsxs("button",{className:`fol-btn fol-btn-secondary ${x?"active":""}`,onClick:()=>O(!x),children:[e.jsx(A,{size:14}),e.jsx("span",{children:"Filter"})]}),e.jsxs("button",{className:"fol-btn fol-btn-primary",onClick:M,disabled:y||i.length===0,children:[e.jsx(B,{size:14}),e.jsx("span",{children:y?"Exporting...":"Export PDF"})]})]})]}),x&&e.jsxs("div",{className:"fol-filters",children:[e.jsxs("label",{className:"fol-filter",children:[e.jsx("span",{children:"From"}),e.jsx("input",{type:"date",value:s.start,onChange:r=>g(o=>({...o,start:r.target.value}))})]}),e.jsxs("label",{className:"fol-filter",children:[e.jsx("span",{children:"To"}),e.jsx("input",{type:"date",value:s.end,onChange:r=>g(o=>({...o,end:r.target.value}))})]}),(s.start||s.end)&&e.jsx("button",{className:"fol-btn fol-btn-ghost",onClick:()=>g({start:"",end:""}),children:"Clear"})]}),_?e.jsx("div",{className:"fol-loading",children:"Loading observations..."}):i.length===0?e.jsxs("div",{className:"fol-empty",children:[e.jsx(k,{size:32}),e.jsx("p",{children:d.length===0?"No field observations yet":"No observations match your filters"}),d.length===0&&e.jsx("span",{children:"Foremen can log observations from the field view"})]}):e.jsx("div",{className:"fol-groups",children:U.map(([r,o])=>e.jsxs("div",{className:"fol-group",children:[e.jsxs("div",{className:"fol-group-header",children:[e.jsx(G,{size:14}),e.jsx("span",{children:L(r)}),e.jsx("span",{className:"fol-group-count",children:o.length})]}),e.jsx("div",{className:"fol-group-items",children:o.map(a=>{const p=c===a.id,N=f[a.id];return e.jsxs("div",{className:"fol-item",children:[e.jsxs("button",{className:"fol-item-header",onClick:()=>D(p?null:a.id),"aria-expanded":p,children:[p?e.jsx(I,{size:14}):e.jsx(T,{size:14}),e.jsx(V,{size:12}),e.jsx("span",{className:"fol-item-time",children:S(a.observed_at)}),a.foreman_name&&e.jsxs("span",{className:"fol-item-by",children:[e.jsx(q,{size:12})," ",a.foreman_name]}),a.location&&e.jsxs("span",{className:"fol-item-loc",children:[e.jsx(H,{size:12})," ",a.location]}),a.photos?.length>0&&e.jsxs("span",{className:"fol-item-photos",children:[e.jsx(z,{size:12})," ",a.photos.length]})]}),e.jsx("div",{className:"fol-item-desc",children:a.description}),p&&a.photos?.length>0&&e.jsx("div",{className:"fol-photo-grid",children:N?N.map((b,u)=>b?e.jsx("a",{href:b,target:"_blank",rel:"noreferrer",className:"fol-photo",children:e.jsx("img",{src:b,alt:`Photo ${u+1}`})},u):e.jsx("div",{className:"fol-photo fol-photo-missing",children:e.jsx("span",{children:"Unavailable"})},u)):e.jsx("div",{className:"fol-photo-loading",children:"Loading photos..."})})]},a.id)})})]},r))}),e.jsx("style",{children:`
        .fol-container { display: flex; flex-direction: column; gap: 0.75rem; }

        .fol-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.5rem;
          padding: 0.75rem;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 10px;
        }
        .fol-stats { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; color: var(--text-secondary); font-size: 0.85rem; }
        .fol-stat { display: inline-flex; align-items: center; gap: 0.35rem; }
        .fol-stat strong { color: var(--text-primary); font-weight: 700; }

        .fol-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .fol-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.85rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid var(--border-color);
          background: var(--bg-card);
          color: var(--text-primary);
          transition: all 0.15s ease;
        }
        .fol-btn:hover:not(:disabled) { border-color: var(--primary-color, #3b82f6); }
        .fol-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .fol-btn-primary { background: var(--primary-color, #3b82f6); color: white; border-color: transparent; }
        .fol-btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
        .fol-btn-secondary.active { background: var(--bg-elevated); border-color: var(--primary-color, #3b82f6); color: var(--primary-color, #3b82f6); }
        .fol-btn-ghost { background: transparent; border-color: transparent; color: var(--text-secondary); }

        .fol-filters {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          flex-wrap: wrap;
        }
        .fol-filter { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.78rem; color: var(--text-secondary); }
        .fol-filter input {
          padding: 0.4rem 0.55rem;
          border-radius: 6px;
          border: 1px solid var(--border-color);
          background: var(--bg-primary, var(--bg-card));
          color: var(--text-primary);
          font-size: 0.85rem;
        }

        .fol-groups { display: flex; flex-direction: column; gap: 0.5rem; }
        .fol-group {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          overflow: hidden;
        }
        .fol-group-header {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.6rem 0.9rem;
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--text-primary);
          background: var(--bg-elevated, rgba(0,0,0,0.02));
          border-bottom: 1px solid var(--border-color);
        }
        .fol-group-count {
          margin-left: auto;
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--text-secondary);
          background: var(--bg-card);
          padding: 0.15rem 0.5rem;
          border-radius: 10px;
        }

        .fol-group-items { display: flex; flex-direction: column; }
        .fol-item { padding: 0.6rem 0.9rem; border-bottom: 1px solid var(--border-color); }
        .fol-item:last-child { border-bottom: none; }

        .fol-item-header {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          width: 100%;
          background: transparent;
          border: none;
          padding: 0;
          cursor: pointer;
          color: var(--text-secondary);
          font-size: 0.78rem;
          flex-wrap: wrap;
        }
        .fol-item-time { color: var(--text-primary); font-weight: 700; }
        .fol-item-by, .fol-item-loc, .fol-item-photos {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }
        .fol-item-photos { color: var(--primary-color, #3b82f6); }

        .fol-item-desc {
          margin: 0.35rem 0 0;
          padding-left: 18px;
          font-size: 0.9rem;
          color: var(--text-primary);
          white-space: pre-wrap;
          word-wrap: break-word;
          line-height: 1.45;
        }

        .fol-photo-grid {
          margin: 0.5rem 0 0.25rem 18px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
          gap: 0.4rem;
        }
        .fol-photo {
          display: block;
          aspect-ratio: 1;
          border-radius: 6px;
          overflow: hidden;
          background: var(--bg-elevated);
        }
        .fol-photo img { width: 100%; height: 100%; object-fit: cover; }
        .fol-photo-missing {
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          color: var(--text-secondary);
        }
        .fol-photo-loading { font-size: 0.8rem; color: var(--text-secondary); padding: 0.5rem; }

        .fol-loading, .fol-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          color: var(--text-secondary);
          text-align: center;
          gap: 0.25rem;
        }
        .fol-empty svg { opacity: 0.4; margin-bottom: 0.5rem; }
        .fol-empty p { font-weight: 600; color: var(--text-primary); margin: 0; }
        .fol-empty span { font-size: 0.85rem; }
      `})]})}export{Y as default};
