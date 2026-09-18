(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))r(i);new MutationObserver(i=>{for(const o of i)if(o.type==="childList")for(const s of o.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&r(s)}).observe(document,{childList:!0,subtree:!0});function n(i){const o={};return i.integrity&&(o.integrity=i.integrity),i.referrerPolicy&&(o.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?o.credentials="include":i.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function r(i){if(i.ep)return;i.ep=!0;const o=n(i);fetch(i.href,o)}})();const at="todo-list-items",lt="todo-history-items",ct="todo-theme-color",dt="todo-sound-settings",ut="todo-priority",N="todo-custom-colors",z={high:"高",medium:"中",low:"低"},qt=[{name:"红",hex:"#ef4444"},{name:"橙",hex:"#f59e0b"},{name:"黄",hex:"#eab308"},{name:"绿",hex:"#22c55e"},{name:"青",hex:"#06b6d4"},{name:"蓝",hex:"#2563eb"},{name:"紫",hex:"#8b5cf6"}],A=[{key:"add",label:"添加任务"},{key:"priority",label:"设置优先级"},{key:"delete",label:"删除任务"},{key:"clearDone",label:"清空已完成"},{key:"clearAll",label:"清空全部"}];function Ht(t){const e=parseInt(t.slice(1,3),16)/255,n=parseInt(t.slice(3,5),16)/255,r=parseInt(t.slice(5,7),16)/255,i=Math.max(e,n,r),o=Math.min(e,n,r);let s=0,l=0;const a=(i+o)/2;if(i!==o){const c=i-o;switch(l=a>.5?c/(2-i-o):c/(i+o),i){case e:s=(n-r)/c+(n<r?6:0);break;case n:s=(r-e)/c+2;break;case r:s=(e-n)/c+4;break}s/=6}return{h:s*360,s:l*100,l:a*100}}function T(t,e,n){t/=360,e/=100,n/=100;let r,i,o;if(e===0)r=i=o=n;else{const l=(d,u,p)=>(p<0&&(p+=1),p>1&&(p-=1),p<.16666666666666666?d+(u-d)*6*p:p<.5?u:p<.6666666666666666?d+(u-d)*(.6666666666666666-p)*6:d),a=n<.5?n*(1+e):n+e-n*e,c=2*n-a;r=l(c,a,t+1/3),i=l(c,a,t),o=l(c,a,t-1/3)}const s=l=>Math.round(l*255+1e-6).toString(16).padStart(2,"0");return`#${s(r)}${s(i)}${s(o)}`}function It(t){const{h:e,s:n,l:r}=Ht(t);return{primary:t,dark:T(e,n,Math.max(r-12,15)),light:T(e,Math.min(n+5,100),88),soft:T(e,Math.min(n+3,100),95),appBg:T(e,Math.min(n+6,100),96),appBg2:T(e,Math.min(n+12,100),89)}}function Dt(t){return[parseInt(t.slice(1,3),16),parseInt(t.slice(3,5),16),parseInt(t.slice(5,7),16)].join(", ")}function O(t){const e=document.documentElement,n=It(t);e.style.setProperty("--primary",n.primary),e.style.setProperty("--primary-rgb",Dt(n.primary)),e.style.setProperty("--primary-dark",n.dark),e.style.setProperty("--primary-light",n.light),e.style.setProperty("--primary-soft",n.soft),e.style.setProperty("--app-bg",n.appBg),e.style.setProperty("--app-bg-2",n.appBg2)}function W(){return localStorage.getItem(ct)||"#2563eb"}function j(t){localStorage.setItem(ct,t)}const F=8;function H(){try{const t=localStorage.getItem(N),e=t?JSON.parse(t):[];return Array.isArray(e)?e.filter(n=>/^#[0-9a-fA-F]{6}$/.test(n)):[]}catch{return[]}}function tt(t){if(!/^#[0-9a-fA-F]{6}$/.test(t))return;const e=H().filter(n=>n.toLowerCase()!==t.toLowerCase());e.unshift(t.toLowerCase()),e.length>F&&(e.length=F),localStorage.setItem(N,JSON.stringify(e))}function Ot(t){const e=String(t).toLowerCase(),n=H().filter(r=>r.toLowerCase()!==e);localStorage.setItem(N,JSON.stringify(n)),x([{id:`color-${Date.now()}`,text:e,done:!1,priority:"medium",kind:"color"}])}function Rt(){const t=H();if(!t.length)return;const e=t.map((n,r)=>({id:`color-${Date.now()}-${r}`,text:n.toLowerCase(),done:!1,priority:"medium",kind:"color"}));x(e),localStorage.setItem(N,JSON.stringify([]))}function pt(t){const e=String(t).toLowerCase(),n=H().filter(r=>r.toLowerCase()!==e);n.unshift(e),n.length>F&&(n.length=F),localStorage.setItem(N,JSON.stringify(n))}async function Pt(t){try{if(window.navigator&&window.navigator.clipboard&&window.navigator.clipboard.writeText)return await window.navigator.clipboard.writeText(t),!0;const e=document.createElement("textarea");e.value=t,e.setAttribute("readonly",""),e.style.position="fixed",e.style.top="-1000px",e.style.opacity="0",document.body.appendChild(e),e.select();const n=typeof document.execCommand=="function"?document.execCommand("copy"):!1;return document.body.removeChild(e),n}catch{return!1}}const et={red:"#ef4444",orange:"#f97316",yellow:"#eab308",green:"#22c55e",blue:"#2563eb",purple:"#8b5cf6",cyan:"#06b6d4",pink:"#ec4899",black:"#000000",white:"#ffffff",gray:"#6b7280",grey:"#6b7280",silver:"#cbd5e1",gold:"#f59e0b",brown:"#92400e",navy:"#1e3a8a",teal:"#14b8a6",indigo:"#6366f1",lime:"#84cc16",sky:"#0ea5e9",maroon:"#7f1d1d",olive:"#808000",coral:"#f87171",violet:"#8b5cf6"};function Bt(t){const e=String(t).trim().toLowerCase();if(!e)return null;if(et[e])return et[e];const n=e.startsWith("#")?e.slice(1):e;if(/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(n))return`#${n.length===3?n.split("").map(o=>o+o).join(""):n}`;if(/^[0-9a-f]{8}$/.test(n))return`#${n.slice(0,6)}`;const r=(e.match(/\d{1,3}(?:\.\d+)?/g)||[]).map(Number);if(e.includes("hsl")&&r.length>=3){const[i,o,s]=r;return i>=0&&i<=360&&o>=0&&o<=100&&s>=0&&s<=100?T(i,o,s):null}if(r.length>=3){const i=r.slice(0,3);if(i.every(o=>Number.isFinite(o)&&o>=0&&o<=255)){const o=s=>Math.round(s).toString(16).padStart(2,"0");return`#${i.map(o).join("")}`}}return null}let I=null;function Nt(){return I||(I=new(window.AudioContext||window.webkitAudioContext)),I.state==="suspended"&&I.resume(),I}function v(t,e,n="sine",r=.15,i=0){const o=Nt(),s=o.createOscillator(),l=o.createGain(),a=o.currentTime+i;s.type=n,s.frequency.setValueAtTime(t,a),l.gain.setValueAtTime(0,a),l.gain.linearRampToValueAtTime(r,a+.01),l.gain.exponentialRampToValueAtTime(.001,a+e),s.connect(l),l.connect(o.destination),s.start(a),s.stop(a+e)}function y(t){if(_()[t])switch(t){case"add":v(523.25,.12,"sine",.15),v(659.25,.15,"sine",.15,.08);break;case"priority":v(800,.06,"square",.08);break;case"delete":v(392,.1,"triangle",.12),v(261.63,.15,"triangle",.12,.06);break;case"clearDone":v(600,.08,"sine",.12),v(900,.1,"sine",.1,.05);break;case"clearAll":v(400,.1,"sawtooth",.1),v(300,.1,"sawtooth",.1,.08),v(150,.2,"sawtooth",.1,.16);break}}function _(){try{const t=localStorage.getItem(dt);if(t)return JSON.parse(t)}catch{}return{add:!0,priority:!0,delete:!0,clearDone:!0,clearAll:!0}}function ft(t){localStorage.setItem(dt,JSON.stringify(t))}let g=null,L="main";function _t(){const t=document.createElement("div");return t.className="settings-panel",t.innerHTML=`
    <div class="settings-panel-header">
      <button class="settings-back-btn" aria-label="返回">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </button>
      <h2 class="settings-panel-title">设置</h2>
      <button class="settings-close-btn" aria-label="关闭">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="settings-panel-body" id="settings-body"></div>
  `,document.body.appendChild(t),t.querySelector(".settings-close-btn").addEventListener("click",Ut),t.querySelector(".settings-back-btn").addEventListener("click",()=>{L!=="main"&&(L="main",S(),U())}),t}function jt(){const t=_();return A.every(e=>t[e.key])}function U(){const t=g.querySelector(".settings-back-btn");t.style.visibility=L==="main"?"hidden":"visible";const e=g.querySelector(".settings-panel-title");e.textContent=L==="main"?"设置":"音效"}function S(){const t=g.querySelector("#settings-body");L==="main"?(t.innerHTML=Vt(),Jt()):L==="sound"&&(t.innerHTML=Kt(),zt())}function Yt(t){const e=H();return e.length?`
      <div class="custom-color-history">
        ${e.map(n=>`
          <div class="saved-color">
            <div class="swatch-wrap">
              <button class="saved-color-swatch${n===t?" selected":""}" data-color="${n}" title="应用该颜色" style="--swatch-color:${n}">
                ${n===t?'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>':""}
              </button>
              <button type="button" class="swatch-remove" data-remove-color="${n}" aria-label="删除该颜色" title="删除该颜色">
                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div class="saved-color-code" data-copy="${n}" title="点击复制颜色码" role="button" tabindex="0" aria-label="复制颜色码 ${n}">
              <span class="code-roll">
                <span class="code-line saved-color-hex">${n}</span>
                <span class="code-line is-done">复制成功</span>
                <span class="code-line saved-color-hex">${n}</span>
              </span>
            </div>
          </div>`).join("")}
      </div>
    </div>`:""}function Ft(t){const e=t&&t.querySelector(".code-roll");!e||t.dataset.rolling==="1"||(t.dataset.rolling="1",e.style.transform="translateY(-33.3333%)",setTimeout(()=>{e.style.transform="translateY(-66.6666%)",setTimeout(()=>{e.style.transition="none",e.style.transform="translateY(0)",e.offsetHeight,e.style.transition="",t.dataset.rolling=""},360)},1100))}function Vt(){const t=W(),e=_(),n=Object.values(e).filter(Boolean).length,r=A.length,i=jt();return`
    <div class="settings-section">
      <h3 class="settings-section-title">主题颜色</h3>
      <div class="color-swatches">
        ${qt.map(o=>`
          <button class="color-swatch${o.hex===t?" selected":""}" data-color="${o.hex}" title="${o.name}" style="--swatch-color:${o.hex}">
            ${o.hex===t?'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>':""}
          </button>
        `).join("")}
      </div>
      <div class="custom-color-row">
        <label class="custom-color-label">自定义</label>
        <input type="color" class="custom-color-picker" id="custom-color-picker" value="${t}">
        <input type="text" class="custom-color-input" id="custom-color-input" placeholder="ff8800 / 255,0,0 / red" value="${t}">
      </div>
      ${Yt(t)}
      ${H().length?'<div class="custom-color-actions"><button type="button" class="btn-clear-all-colors" data-action="clear-all-colors">🗑️ 全部删除</button></div>':""}
    </div>

    <div class="settings-section">
      <div class="settings-section-head">
        <h3 class="settings-section-title">音效</h3>
        <label class="toggle-switch sound-master-switch" title="一键开启 / 关闭全部音效">
          <input type="checkbox" id="sound-master-switch" ${i?"checked":""} aria-label="全部音效">
          <span class="toggle-slider"></span>
        </label>
      </div>
      <button class="settings-nav-row" data-nav="sound">
        <span class="settings-nav-label">音效设置</span>
        <span class="settings-nav-value">${n}/${r} 项已开启</span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  `}function Jt(){const t=g.querySelector("#settings-body");t.querySelectorAll(".color-swatch").forEach(o=>{o.addEventListener("click",()=>{const s=o.dataset.color;j(s),O(s),S()})});const e=t.querySelector("#sound-master-switch");e&&e.addEventListener("change",()=>{const o={};A.forEach(l=>{o[l.key]=e.checked}),ft(o),S();const s=A[Math.floor(Math.random()*A.length)].key;y(s)}),t.querySelectorAll("[data-remove-color]").forEach(o=>{o.addEventListener("click",s=>{s.stopPropagation(),Ot(o.dataset.removeColor),b(),k&&q(),S()})});const n=t.querySelector('[data-action="clear-all-colors"]');n&&n.addEventListener("click",()=>{Rt(),b(),k&&q(),S()});const r=t.querySelector("#custom-color-picker"),i=t.querySelector("#custom-color-input");r.addEventListener("input",()=>{const o=r.value;j(o),O(o),i.value=o,t.querySelectorAll(".color-swatch").forEach(s=>s.classList.remove("selected"))}),r.addEventListener("change",()=>{const o=r.value;tt(o),S()}),i.addEventListener("change",()=>{const o=Bt(i.value);o?(j(o),O(o),tt(o),r.value=o,i.value=o,S()):i.value=W()}),t.querySelectorAll(".saved-color-swatch").forEach(o=>{o.addEventListener("click",()=>{const s=o.dataset.color;j(s),O(s),S()})}),t.querySelectorAll(".saved-color-code").forEach(o=>{const s=async()=>{const l=await Pt(o.dataset.copy),a=o.querySelector(".code-line.is-done");a&&(a.textContent=l?"复制成功":"复制失败"),Ft(o)};o.addEventListener("click",s),o.addEventListener("keydown",l=>{(l.key==="Enter"||l.key===" ")&&(l.preventDefault(),s())})})}function Kt(){const t=_();return`
    <div class="settings-section">
      ${A.map(e=>`
        <div class="sound-toggle-row">
          <span class="sound-toggle-label">${e.label}</span>
          <label class="toggle-switch">
            <input type="checkbox" data-sound="${e.key}" ${t[e.key]?"checked":""}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      `).join("")}
    </div>
  `}function zt(){const t=g.querySelector("#settings-body"),e=_();t.querySelectorAll("input[data-sound]").forEach(n=>{n.addEventListener("change",()=>{e[n.dataset.sound]=n.checked,ft(e),n.checked&&y(n.dataset.sound)})})}function Wt(){g||(g=_t()),L="main",S(),U(),g.classList.add("open")}function Ut(){g&&g.classList.remove("open")}function M(){try{const t=localStorage.getItem(at);return(t?JSON.parse(t):[]).map(n=>({...n,priority:n.priority||"medium",createdAt:n.createdAt||(Number.isFinite(Number(n.id))&&Number(n.id)>1e12?Number(n.id):0)}))}catch{return[]}}function E(t){localStorage.setItem(at,JSON.stringify(t))}function R(t){const e=document.createElement("div");return e.textContent=t,e.innerHTML}function yt(t){return String(t).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}const f={search:"",filter:"all",sort:"default",priority:"all",page:1,paginate:!0},m={search:"",filter:"all",sort:"default",priority:"all",page:1,paginate:!0},ht={icon:"🎉",title:"清单空空如也",desc:"添加第一个任务，开启高效一天吧！"},gt={icon:"🗑️",title:"回收站是空的",desc:"删除任务后，它们会先放到这里，可随时恢复"},Gt=["all","done","active"],Xt={done:"已完成",active:"未完成",all:"全部"},Zt=["all","high","medium","low"],Qt={all:"全部",high:"高",medium:"中",low:"低"},te=["time-desc","time-asc","priority-desc","priority-asc","name-asc","name-desc"],ee={"time-desc":"按照时间降序","time-asc":"按照时间升序","priority-desc":"按照优先级降序","priority-asc":"按照优先级升序","name-asc":"按照名称升序","name-desc":"按照名称降序"},ne={"time-desc":"时间 ↓","time-asc":"时间 ↑","priority-desc":"优先级 ↓","priority-asc":"优先级 ↑","name-asc":"名称 ↑","name-desc":"名称 ↓"},nt=new Intl.Collator("zh-Hans-CN",{numeric:!0,sensitivity:"base"}),mt="default",ot={high:3,medium:2,low:1};function bt(t){const e=t.sort||mt,n=ne[e]||"排序",r=te.map(o=>`<button type="button" class="sort-option${e===o?" active":""}" data-action="sort-pick" data-sort="${o}" role="option" aria-selected="${e===o}">${ee[o]}</button>`).join(""),i=Zt.map(o=>`<button type="button" class="priority-filter-option priority-${o}${t.priority===o?" active":""}" data-action="filter-priority" data-priority-filter="${o}" aria-pressed="${t.priority===o}">${Qt[o]}</button>`).join("");return`
      <div class="list-toolbar">
        <div class="sort-wrap">
          <button type="button" class="btn-sort" data-action="sort-toggle" aria-haspopup="listbox" aria-expanded="false" title="排序方式">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 4v16M7 4l-3 3M7 4l3 3"/>
              <path d="M17 20V4M17 20l-3-3M17 20l3-3"/>
            </svg>
            <span class="sort-label">${n}</span>
          </button>
          <div class="sort-menu" role="listbox">${r}</div>
        </div>
        <div class="priority-filter" role="group" aria-label="按优先级筛选">
          <span class="priority-filter-title">优先级</span>
          ${i}
        </div>
      </div>`}function vt(t,e){return e==="done"?t.done:e==="active"?!t.done:!0}function J(t,e,n){let r=e==="all"?t.slice():t.filter(i=>vt(i,e));return n&&n!=="all"&&(r=r.filter(i=>i.priority===n)),r}function oe(t){return Gt.map(e=>`<button type="button" class="btn-filter${t.filter===e?" active":""}" data-action="filter" data-filter="${e}" aria-pressed="${t.filter===e}">${Xt[e]}</button>`).join("")}function St(t,e,n,r=!1){if(n===0)return"";const i=n-e;return r?`
      <div class="todo-clear-actions">
        <div class="action-group">
          ${oe(t)}
          ${re(e,i)}
        </div>
        <div class="action-group action-group-clear">
          <button class="btn-clear-all" data-action="clear-all" ${n===0?"disabled":""}>⚡ 全部清空</button>
          <button class="btn-complete-clear" data-action="complete-clear" ${n===0?"disabled":""}>✅ 完成所有并清空</button>
          <button class="btn-clear-done" data-action="clear-done" ${e===0?"disabled":""}>🗑️ 清空已完成${e>0?` (${e})`:""}</button>
          <button class="btn-clear-incomplete" data-action="clear-incomplete" ${i===0?"disabled":""}>🧹 清空未完成${i>0?` (${i})`:""}</button>
        </div>
      </div>`:`
      <div class="todo-clear-actions todo-clear-actions-main">
        <div class="action-group">
          ${K(t,"all","全部")}
          <button class="btn-complete-all" data-action="complete-all" ${i===0?"disabled":""}>✅ 完成所有${i>0?` (${i})`:""}</button>
          ${K(t,"done","已完成",e)}
          ${K(t,"active","未完成",i)}
        </div>
        <div class="action-group action-group-clear">
          <button class="btn-clear-all-tasks" data-action="clear-all-tasks" ${n===0?"disabled":""}>⚡ 清空全部</button>
          <button class="btn-complete-clear" data-action="complete-clear" ${n===0?"disabled":""}>✅ 完成所有并清空</button>
          <button class="btn-clear-done" data-action="clear-done" ${e===0?"disabled":""}>🗑️ 清空已完成${e>0?` (${e})`:""}</button>
          <button class="btn-clear-incomplete" data-action="clear-incomplete" ${i===0?"disabled":""}>🧹 清空未完成${i>0?` (${i})`:""}</button>
        </div>
      </div>`}function K(t,e,n,r){const i=typeof r=="number"?`${n} (${r})`:n;return`<button type="button" class="btn-filter${t.filter===e?" active":""}" data-action="filter" data-filter="${e}" aria-pressed="${t.filter===e}">${i}</button>`}function re(t,e){return`
        <button class="btn-restore-done" data-action="restore-done" ${t===0?"disabled":""}>♻️ 恢复已完成${t>0?` (${t})`:""}</button>
        <button class="btn-restore-incomplete" data-action="restore-incomplete" ${e===0?"disabled":""}>♻️ 恢复未完成${e>0?` (${e})`:""}</button>
        <button class="btn-restore-all" data-action="restore-all">♻️ 恢复全部</button>`}const kt=["high","medium","low"],ie="medium";function se(){const t=localStorage.getItem(ut);return kt.includes(t)?t:ie}function ae(t){localStorage.setItem(ut,t)}let $=se();function le(){return`
        <div class="priority-select" id="todo-priority" data-value="${$}" role="group" aria-label="任务优先级">
          ${kt.map(t=>`<button type="button" class="priority-option priority-${t}${t===$?" selected":""}" data-priority="${t}" aria-pressed="${t===$}"><span class="priority-dot ${t}-dot"></span>${z[t]}</button>`).join("")}
        </div>`}function ce(){const t=document.querySelector("#todo-priority");t&&(t.dataset.value=$,t.querySelectorAll(".priority-option").forEach(e=>{const n=e.dataset.priority===$;e.classList.toggle("selected",n),e.setAttribute("aria-pressed",String(n))}))}function de(t,e){const n=e.trim().toLowerCase();if(!n)return{matched:!0,indices:null};const r=String(t).toLowerCase(),i=r.indexOf(n);if(i!==-1){const l=[];for(let a=0;a<n.length;a++)l.push(i+a);return{matched:!0,indices:l}}const o=[];let s=0;for(const l of n){const a=r.indexOf(l,s);if(a===-1)return{matched:!1,indices:null};o.push(a),s=a+1}return{matched:!0,indices:o}}function G(t,e){if(!e||!e.length)return R(t);const n=new Set(e);let r="",i=!1,o=0;for(;o<t.length;){const l=t.codePointAt(o)>65535?2:1,a=n.has(o);a&&!i?(r+='<mark class="search-hl">',i=!0):!a&&i&&(r+="</mark>",i=!1),r+=R(t.slice(o,o+l)),o+=l}return i&&(r+="</mark>"),r}function ue(t,e){if(!e||e===mt)return t;const n=s=>typeof s.createdAt=="number"?s.createdAt:0,r=s=>ot[s.priority]||ot.medium,o={"time-desc":(s,l)=>n(l.todo)-n(s.todo),"time-asc":(s,l)=>n(s.todo)-n(l.todo),"priority-desc":(s,l)=>r(l.todo)-r(s.todo)||n(l.todo)-n(s.todo),"priority-asc":(s,l)=>r(s.todo)-r(l.todo)||n(l.todo)-n(s.todo),"name-asc":(s,l)=>nt.compare(s.todo.text,l.todo.text),"name-desc":(s,l)=>nt.compare(l.todo.text,s.todo.text)}[e];return o?t.slice().sort(o):t}function w(t,e){const n=J(t,e.filter,e.priority),r=e.search.trim();let i;if(!r)i=n.map(o=>({todo:o,indices:null}));else{i=[];for(const o of n){const s=de(o.text,r);s.matched&&i.push({todo:o,indices:s.indices})}}return ue(i,e.sort)}const V=5;function $t(t){return Math.max(1,Math.ceil(t/V))}function P(t,e){return!Number.isFinite(t)||t<1?1:Math.min(t,e)}function X(t,e){if(e<=V)return"";const n=$t(e);return t.page=P(t.page,n),`
      <div class="pagination" data-total="${n}">
        <button type="button" class="page-btn page-prev" data-action="page-prev" ${t.page<=1?"disabled":""}>‹ 上一页</button>
        <span class="page-indicator">第 <span class="page-current" data-action="page-edit" title="点击编辑页码跳转">${t.page}</span> / ${n} 页</span>
        <button type="button" class="page-btn page-next" data-action="page-next" ${t.page>=n?"disabled":""}>下一页 ›</button>
      </div>`}function pe(t){if(!t)return"";const e=new Date(t);if(Number.isNaN(e.getTime()))return"";const n=l=>String(l).padStart(2,"0"),r=new Date,i=`${n(e.getHours())}:${n(e.getMinutes())}`,o=l=>new Date(l.getFullYear(),l.getMonth(),l.getDate()).getTime(),s=Math.round((o(r)-o(e))/864e5);return s===0?`今天 ${i}`:s===1?`昨天 ${i}`:e.getFullYear()===r.getFullYear()?`${n(e.getMonth()+1)}-${n(e.getDate())} ${i}`:`${e.getFullYear()}-${n(e.getMonth()+1)}-${n(e.getDate())}`}function xt(t,e){const n=e&&e.length?G(t.text,e):R(t.text),r=pe(t.createdAt);return`
          <li class="todo-item ${t.done?"done":""} priority-${t.priority}" data-id="${t.id}">
            <span class="priority-badge priority-${t.priority}">${z[t.priority]}</span>
            <label class="checkbox-wrap">
              <input type="checkbox" ${t.done?"checked":""} data-action="toggle" />
              <span class="checkmark"></span>
            </label>
            <span class="todo-text" data-action="edit">${n}</span>
            ${r?`<span class="todo-date" title="添加于 ${r}">${r}</span>`:""}
            <button class="btn-edit" data-action="edit" aria-label="编辑任务">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-delete" data-action="delete" aria-label="删除任务">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </li>
        `}function Z(t,e,n,r){if(t.length===0)return`
            <li class="empty-state">
              <div class="empty-icon">${n.icon}</div>
              <p class="empty-title">${n.title}</p>
              <p class="empty-desc">${n.desc}</p>
            </li>`;const i=w(t,e);if(i.length===0)return e.search.trim()?`
            <li class="empty-state">
              <div class="empty-icon">🔍</div>
              <p class="empty-title">没有找到匹配的任务</p>
              <p class="empty-desc">试试别的关键词，或清空搜索框看全部任务</p>
            </li>`:e.filter==="done"?`
            <li class="empty-state">
              <div class="empty-icon">📋</div>
              <p class="empty-title">还没有已完成的任务</p>
              <p class="empty-desc">完成任意任务后，它会出现在这里</p>
            </li>`:e.filter==="active"?`
            <li class="empty-state">
              <div class="empty-icon">🎉</div>
              <p class="empty-title">没有未完成的任务</p>
              <p class="empty-desc">所有任务都已清空，休息一下吧！</p>
            </li>`:`
            <li class="empty-state">
              <div class="empty-icon">🔍</div>
              <p class="empty-title">没有找到匹配的任务</p>
              <p class="empty-desc">试试别的关键词，或清空搜索框看全部任务</p>
            </li>`;let o=i;if(e.paginate){const s=$t(i.length);e.page=P(e.page,s);const l=(e.page-1)*V;o=i.slice(l,l+V)}return o.map(({todo:s,indices:l})=>r(s,l)).join("")}function Lt(t,e,n){return`
      <div class="todo-search${t.search?" has-value":""}">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <line x1="20" y1="20" x2="16.65" y2="16.65"/>
        </svg>
        <input
          id="${e}"
          type="text"
          placeholder="${n}"
          autocomplete="off"
          aria-label="搜索"
          value="${yt(t.search)}"
        />
        <button type="button" class="btn-search-clear" aria-label="清空搜索">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`}function Q(t,e,n,r){if(!t)return;if(!r.search.trim()||n===0){t.classList.remove("show","no-match"),t.innerHTML="";return}const o=r.filter!=="all"||r.priority&&r.priority!=="all"?"当前筛选范围内 ":"";t.classList.add("show"),t.classList.toggle("no-match",e===0),t.innerHTML=e>0?`${o}找到 <strong>${e}</strong> 项匹配（共 ${n} 项）`:`${o}没有找到匹配的任务`}function rt(t,e){const n=t.listEl();if(!n)return;const r=t.read();n.innerHTML=Z(r,e,t.empty,t.itemRenderer),Q(t.hintEl(),w(r,e).length,J(r,e.filter,e.priority).length,e);const i=n.parentElement,o=i.querySelector("#pagination-wrap");o&&(o.innerHTML=X(e,w(r,e).length)),Et(e,t,i)}function b(){const t=document.querySelector("#app"),e=document.activeElement,n=!!e&&e.id==="todo-search",r=n?e.selectionStart:null,i=M(),o=i.filter(a=>a.done).length;i.length-o;const s=C().length;t.innerHTML=`
    <button class="settings-btn" aria-label="设置" title="设置">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>

    <div class="todo-wrapper">
      <header class="todo-header">
        <h1><span class="title-icon">📝</span> 我的待办清单</h1>
        <p class="subtitle">记录你的每一项任务</p>
      </header>

      <form id="todo-form" class="todo-form">
        <input
          id="todo-input"
          type="text"
          placeholder="今天要做什么？"
          autocomplete="off"
          maxlength="200"
        />
        <button type="submit" class="btn-add">➕ 添加任务</button>
      </form>

      <div class="todo-stats">
        ${le()}
      </div>

      <div class="todo-tools">
        ${Lt(f,"todo-search","搜索待办事项")}
        <button type="button" class="btn-history" id="btn-history" title="查看被删除的任务">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          历史记录${s>0?` (${s})`:""}
        </button>
      </div>
      <p class="search-hint" id="search-hint"></p>

      ${St(f,o,i.length)}
      ${i.length>0?bt(f):""}

      <ul class="todo-list" id="todo-list">
        ${Z(i,f,ht,xt)}
      </ul>

      <div id="pagination-wrap">${X(f,w(i,f).length)}</div>
    </div>

    <div class="modal-overlay" id="confirm-modal">
      <div class="modal">
        <div class="modal-icon">⚠️</div>
        <p class="modal-title" id="confirm-title">确认全部清空</p>
        <p class="modal-desc" id="confirm-desc">这将删除所有任务，包括未完成的任务。此操作不可撤销。</p>
        <div class="modal-actions">
          <button class="btn-cancel" data-action="cancel">取消</button>
          <button class="btn-confirm" data-action="confirm">确认清空</button>
        </div>
      </div>
    </div>
  `,ye();const l=document.querySelector("#todo-search");l&&(l.closest(".todo-search").classList.toggle("has-value",f.search.length>0),Q(document.querySelector("#search-hint"),w(i,f).length,J(i,f.filter,f.priority).length,f),n&&(l.focus(),r!=null&&l.setSelectionRange(r,r)))}function fe(t,e,n){const r=t.querySelector(".todo-text"),i=e.text,o=document.createElement("input");o.type="text",o.value=i,o.className="edit-input",o.maxLength=200,r.replaceWith(o),o.focus(),o.select();const s=l=>{const a=o.value.trim();l&&a&&a!==i&&(e.text=a,E(n)),b()};o.addEventListener("blur",()=>s(!0)),o.addEventListener("keydown",l=>{l.key==="Enter"?(l.preventDefault(),s(!0)):l.key==="Escape"&&s(!1)})}function ye(){const t=document.querySelector(".settings-btn"),e=document.querySelector("#todo-form"),n=document.querySelector("#todo-input"),r=document.querySelector("#todo-priority"),i=document.querySelector("#todo-list"),o=document.querySelector("#confirm-modal");t.addEventListener("click",Wt),document.querySelector("#btn-history").addEventListener("click",me),wt(document.querySelector("#app"),f,be),r.addEventListener("mousedown",s=>{s.target.closest("[data-priority]")&&s.preventDefault()}),r.addEventListener("click",s=>{const l=s.target.closest("[data-priority]");if(!l)return;const a=l.dataset.priority;a!==$&&($=a,ae(a),ce(),y("priority"))}),e.addEventListener("submit",s=>{s.preventDefault();const l=n.value.trim();if(!l)return;const a=M(),c=Date.now();a.unshift({id:c,text:l,done:!1,priority:$,createdAt:c}),E(a),f.filter==="done"&&(f.filter="all"),f.priority!=="all"&&f.priority!==$&&(f.priority="all"),y("add"),n.value="",b(),document.querySelector("#todo-input").focus()}),i.addEventListener("click",s=>{const l=s.target.closest(".todo-item");if(!l)return;const a=Number(l.dataset.id),c=s.target.closest("[data-action]");if(!c)return;const d=c.dataset.action,u=M(),p=u.find(h=>h.id===a);if(p)if(d==="toggle")p.done=!p.done,E(u),b();else if(d==="delete"){const h=u.filter(Ct=>Ct.id!==a);E(h),x([p]),y("delete"),b()}else d==="edit"&&fe(l,p,u)}),o.addEventListener("click",s=>{if(s.target===o||s.target.closest('[data-action="cancel"]'))Y=null,o.classList.remove("show");else if(s.target.closest('[data-action="confirm"]')){const l=Y;Y=null,o.classList.remove("show"),l&&l()}})}let Y=null;function D(t,e,n){const r=document.querySelector("#confirm-modal");r&&(r.querySelector("#confirm-title").textContent=t,r.querySelector("#confirm-desc").textContent=e,Y=n,r.classList.add("show"))}function Et(t,e,n=document){const r=n.querySelector(".pagination");if(!r)return;const i=Number(r.dataset.total)||1,o=r.querySelector(".page-prev"),s=r.querySelector(".page-next"),l=r.querySelector(".page-current");o&&o.addEventListener("click",()=>{o.disabled||(t.page=P(t.page-1,i),e.render())}),s&&s.addEventListener("click",()=>{s.disabled||(t.page=P(t.page+1,i),e.render())}),l&&l.addEventListener("click",()=>he(l,t,e))}function he(t,e,n){const r=t.closest(".pagination"),i=Number(r&&r.dataset.total)||1,o=document.createElement("input");o.type="text",o.className="page-edit-input",o.value=String(e.page),o.setAttribute("size","2"),o.setAttribute("inputmode","numeric"),t.replaceWith(o),o.focus(),o.select();let s=!1;const l=a=>{if(!s){if(s=!0,a){const c=parseInt(o.value,10);Number.isFinite(c)&&c>=1&&(e.page=P(c,i))}n.render()}};o.addEventListener("keydown",a=>{a.key==="Enter"?(a.preventDefault(),l(!0)):a.key==="Escape"&&(a.preventDefault(),l(!1))}),o.addEventListener("blur",()=>l(!0))}function wt(t,e,n){if(!t)return;const r=t.querySelector(".todo-search input"),i=r?r.closest(".todo-search"):null;if(r){const a=()=>{i.classList.toggle("has-value",r.value.length>0)},c=()=>{e.search=r.value,e.page=1,a(),rt(n,e)};r.addEventListener("input",c),r.addEventListener("keydown",d=>{d.key==="Escape"&&r.value&&(d.preventDefault(),r.value="",c())}),i.querySelector(".btn-search-clear").addEventListener("click",()=>{r.value="",e.search="",a(),rt(n,e),r.focus()})}t.querySelectorAll(".btn-filter").forEach(a=>{a.addEventListener("mousedown",c=>c.preventDefault()),a.addEventListener("click",()=>{const c=a.dataset.filter;c!==e.filter&&(e.filter=c,n.render())})});const o=t.querySelector(".sort-wrap");if(o){const a=o.querySelector(".sort-menu"),c=o.querySelector(".btn-sort"),d=()=>{a.classList.remove("open"),c.setAttribute("aria-expanded","false")};c.addEventListener("mousedown",u=>u.preventDefault()),c.addEventListener("click",()=>{const u=a.classList.toggle("open");c.setAttribute("aria-expanded",String(u))}),a.querySelectorAll(".sort-option").forEach(u=>{u.addEventListener("click",()=>{d(),e.sort!==u.dataset.sort&&(e.sort=u.dataset.sort,e.page=1,y("priority"),n.render())})})}t.querySelectorAll(".priority-filter-option").forEach(a=>{a.addEventListener("mousedown",c=>c.preventDefault()),a.addEventListener("click",()=>{const c=a.dataset.priorityFilter;!c||c===e.priority||(e.priority=c,e.page=1,y("priority"),n.render())})}),t.querySelectorAll(".btn-clear-done").forEach(a=>{a.addEventListener("click",()=>{if(a.disabled)return;const c=n.read();D(n.clearDoneTitle,n.clearDoneDesc,()=>{x(c.filter(d=>d.done),n),n.write(c.filter(d=>!d.done)),y("clearDone"),n.render()})})}),t.querySelectorAll(".btn-clear-incomplete").forEach(a=>{a.addEventListener("click",()=>{if(a.disabled)return;const c=n.read();D(n.clearIncompleteTitle,n.clearIncompleteDesc,()=>{x(c.filter(d=>!d.done),n),n.write(c.filter(d=>d.done)),y("clearAll"),n.render()})})}),t.querySelectorAll(".btn-clear-all").forEach(a=>{a.addEventListener("click",()=>{a.disabled||D(n.confirmTitle,n.confirmDesc,()=>{x(n.read(),n),n.write([]),y("clearAll"),n.render()})})}),t.querySelectorAll(".btn-clear-all-tasks").forEach(a=>{a.addEventListener("click",()=>{a.disabled||D(n.confirmTitle,n.confirmDesc,()=>{x(n.read(),n),n.write([]),y("clearAll"),n.render()})})}),t.querySelectorAll(".btn-complete-clear").forEach(a=>{a.addEventListener("click",()=>{a.disabled||D(n.completeClearTitle,n.completeClearDesc,()=>{const c=n.read();c.forEach(d=>{d.done=!0}),x(c,n),n.write([]),y("clearAll"),n.render()})})}),t.querySelectorAll(".btn-complete-all").forEach(a=>{a.addEventListener("click",()=>{if(a.disabled)return;const c=n.read();let d=!1;c.forEach(u=>{u.done||(u.done=!0,d=!0)}),d&&(n.write(c),y("add")),n.render()})}),Et(e,n,t);const s=a=>{a.forEach(c=>{if(c.kind==="color")pt(c.text);else{const d=M();d.unshift({id:c.id,text:c.text,done:c.done,priority:c.priority}),E(d)}})},l=a=>{const c=C(),d=c.filter(a);d.length&&(s(d),B(c.filter(u=>!a(u))),f.filter!=="all"&&(f.filter="all"),y("add"),n.render())};t.querySelectorAll(".btn-restore-done").forEach(a=>{a.addEventListener("click",()=>{a.disabled||l(c=>c.done)})}),t.querySelectorAll(".btn-restore-incomplete").forEach(a=>{a.addEventListener("click",()=>{a.disabled||l(c=>!c.done)})}),t.querySelectorAll(".btn-restore-all").forEach(a=>{a.addEventListener("click",()=>{l(()=>!0)})})}const it=200;function C(){try{const t=localStorage.getItem(lt),e=t?JSON.parse(t):[];return Array.isArray(e)?e.map(n=>({...n,priority:n.priority||"medium",done:!!n.done,createdAt:n.createdAt||n.deletedAt||0})):[]}catch{return[]}}function B(t){localStorage.setItem(lt,JSON.stringify(t))}function x(t,e){if(!t||!t.length||e&&e.skipHistory)return;const n=C(),r=t.map(i=>({id:i.id,text:i.text,done:!!i.done,priority:i.priority||"medium",kind:i.kind,createdAt:i.createdAt,deletedAt:Date.now()}));n.unshift(...r),n.length>it&&(n.length=it),B(n)}function Tt(t){if(!t)return"";const e=new Date(t),n=s=>String(s).padStart(2,"0"),r=new Date,i=e.getFullYear()===r.getFullYear()&&e.getMonth()===r.getMonth()&&e.getDate()===r.getDate(),o=`${n(e.getHours())}:${n(e.getMinutes())}`;return i?`今天 ${o}`:`${n(e.getMonth()+1)}-${n(e.getDate())} ${o}`}function At(t,e){if(t.kind==="color")return ge(t,e);const n=e&&e.length?G(t.text,e):R(t.text);return`
          <li class="todo-item history-item ${t.done?"done":""} priority-${t.priority}" data-id="${t.id}">
            <span class="priority-badge priority-${t.priority}">${z[t.priority]}</span>
            <span class="todo-text">${n}</span>
            <span class="history-time">${Tt(t.deletedAt)}</span>
            <button class="btn-restore" data-action="restore" aria-label="恢复任务" title="恢复到待办清单">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 14 4 9 9 4"/>
                <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
            </button>
            <button class="btn-delete" data-action="purge" aria-label="彻底删除" title="从历史记录中移除">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </li>
        `}function ge(t,e){const n=e&&e.length?G(t.text,e):R(t.text);return`
          <li class="todo-item history-item color-entry" data-id="${t.id}">
            <span class="history-swatch" style="--swatch-color:${yt(t.text)}"></span>
            <span class="todo-text">${n}</span>
            <span class="history-kind">自定义色</span>
            <span class="history-time">${Tt(t.deletedAt)}</span>
            <button class="btn-restore" data-action="restore" aria-label="恢复颜色" title="恢复到自定义颜色">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 14 4 9 9 4"/>
                <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
            </button>
            <button class="btn-delete" data-action="purge" aria-label="彻底删除" title="从历史记录中移除">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
              </svg>
            </button>
          </li>
        `}let k=null;function Mt(){const t=document.createElement("div");return t.className="history-panel",t.innerHTML=`
    <div class="history-dialog">
      <div class="history-panel-header">
        <h2 class="history-panel-title"><span class="title-icon">🗂️</span> 历史记录</h2>
        <button class="history-close-btn" aria-label="关闭">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="history-panel-body" id="history-body"></div>
    </div>
  `,document.body.appendChild(t),t.querySelector(".history-close-btn").addEventListener("click",st),t.addEventListener("click",e=>{e.target===t&&st()}),t}function q(){k||(k=Mt());const t=document.activeElement,e=!!t&&t.id==="history-search",n=e?t.selectionStart:null,r=k.querySelector("#history-body"),i=C(),o=i.filter(s=>s.done).length;if(r.innerHTML=`
      ${Lt(m,"history-search","搜索历史记录（实时模糊匹配）")}
      <p class="search-hint" id="history-hint"></p>
      ${St(m,o,i.length,!0)}
      ${i.length>0?bt(m):""}
      <ul class="todo-list history-list" id="history-list">
        ${Z(i,m,gt,At)}
      </ul>
      <div id="pagination-wrap">${X(m,w(i,m).length)}</div>
  `,wt(r,m,ve),Q(r.querySelector("#history-hint"),w(i,m).length,J(i,m.filter,m.priority).length,m),r.querySelector("#history-list").addEventListener("click",s=>{const l=s.target.closest(".history-item");if(!l)return;const a=s.target.closest("[data-action]");if(!a)return;const c=a.dataset.action,d=l.dataset.id,u=C(),p=u.find(h=>String(h.id)===d);if(p)if(c==="restore"){if(p.kind==="color")pt(p.text);else{const h=M();h.unshift({id:p.id,text:p.text,done:p.done,priority:p.priority}),E(h),vt(p,f.filter)||(f.filter="all")}B(u.filter(h=>String(h.id)!==d)),y("add"),b(),q()}else c==="purge"&&(B(u.filter(h=>String(h.id)!==d)),y("delete"),b(),q())}),e){const s=r.querySelector("#history-search");s.focus(),n!=null&&s.setSelectionRange(n,n)}}function me(){k||(k=Mt()),q(),k.classList.add("open")}function st(){k&&k.classList.remove("open")}const be={read:M,write:E,render:()=>b(),listEl:()=>document.querySelector("#todo-list"),hintEl:()=>document.querySelector("#search-hint"),empty:ht,itemRenderer:xt,clearDoneTitle:"确认清空已完成",clearDoneDesc:"已完成的任务将被移入历史记录，可随时恢复。",clearIncompleteTitle:"确认清空未完成",clearIncompleteDesc:"未完成的任务将被移入历史记录，可随时恢复。",completeClearTitle:"确认完成所有并清空",completeClearDesc:"全部任务会先标记为已完成，再一起移入历史记录，可随时恢复。",confirmTitle:"确认全部清空",confirmDesc:"所有任务（含未完成）将被移入历史记录，但原顺序不可恢复。"},ve={read:C,write:B,render:()=>{b(),q()},listEl:()=>document.querySelector("#history-list"),hintEl:()=>document.querySelector("#history-hint"),empty:gt,itemRenderer:At,skipHistory:!0,clearDoneTitle:"确认清空已完成",clearDoneDesc:"将从回收站永久删除已完成的记录，无法恢复。",clearIncompleteTitle:"确认清空未完成",clearIncompleteDesc:"将从回收站永久删除未完成的记录，无法恢复。",completeClearTitle:"确认完成所有并清空",completeClearDesc:"回收站里的记录会先标记为已完成，再被永久删除，无法恢复。",confirmTitle:"确认清空历史记录",confirmDesc:"这将永久删除回收站中的全部记录，无法恢复。"};O(W());document.addEventListener("click",t=>{g&&g.classList.contains("open")&&t.target.closest('[data-nav="sound"]')&&(L="sound",S(),U())});document.addEventListener("click",t=>{document.querySelectorAll(".sort-menu.open").forEach(e=>{const n=e.closest(".sort-wrap");if(n&&!n.contains(t.target)){e.classList.remove("open");const r=n.querySelector(".btn-sort");r&&r.setAttribute("aria-expanded","false")}})});b();
