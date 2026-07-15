/* ================================================================
   Pure Start — 纯净起始页
   自由布局 · 中心吸附 · 毛玻璃控件 · 零依赖
   ================================================================ */
'use strict';

/* ================================================================
   Storage
   ================================================================ */
const Storage = {
  get _api(){return(typeof chrome!=='undefined'&&chrome.storage)?chrome.storage:null},
  async get(keys){if(this._api)return new Promise(r=>this._api.sync.get(keys,r));const o={};for(const k of(Array.isArray(keys)?keys:[keys])){try{o[k]=JSON.parse(localStorage.getItem(`ps_${k}`))}catch{o[k]=undefined}}return o},
  async set(obj){if(this._api)return new Promise(r=>this._api.sync.set(obj,r));for(const[k,v]of Object.entries(obj)){try{localStorage.setItem(`ps_${k}`,JSON.stringify(v))}catch{}}},
  async getLocal(keys){if(this._api)return new Promise(r=>this._api.local.get(keys,r));const o={};for(const k of(Array.isArray(keys)?keys:[keys])){try{o[k]=JSON.parse(localStorage.getItem(`psl_${k}`))}catch{o[k]=undefined}}return o},
  async setLocal(obj){if(this._api)return new Promise(r=>this._api.local.set(obj,r));for(const[k,v]of Object.entries(obj)){try{localStorage.setItem(`psl_${k}`,JSON.stringify(v))}catch{}}},
  async exportAll(){const[s,l]=await Promise.all([this.get(['settings']),this.getLocal(['bookmarks','customWallpaper'])]);return{version:1,exportedAt:new Date().toISOString(),settings:s.settings||{},bookmarks:l.bookmarks||[],customWallpaper:l.customWallpaper||null}},
  async importAll(d){if(!d||typeof d!=='object')throw new Error('无效配置');if(d.settings)await this.set({settings:d.settings});const l={};if(d.bookmarks)l.bookmarks=d.bookmarks;l.customWallpaper=d.customWallpaper||null;await this.setLocal(l)},
};

/* ================================================================
   配置
   ================================================================ */
const BUILTIN_ENGINES={google:{name:'Google',url:'https://www.google.com/search?q='},bing:{name:'Bing',url:'https://www.bing.com/search?q='},duckduckgo:{name:'DuckDuckGo',url:'https://duckduckgo.com/?q='}};
const ENGINE_ICONS={google:'<span class="engine-option-icon engine-google">G</span>',bing:'<span class="engine-option-icon engine-bing">B</span>',duckduckgo:'<span class="engine-option-icon engine-duck">D</span>'};

const SNAP_THRESHOLD = 3.5;   // 吸附触发阈值（百分比）
const SNAP_MAGNET   = 2.0;    // 磁吸锁定阈值（百分比）

const DEFAULT_POSITIONS = {
  clock:     { x: 50, y: 10 },
  search:    { x: 50, y: 35 },
  bookmarks: { x: 50, y: 52 },
};

const DEFAULTS = {
  theme:'light',wallpaperSource:'bing',searchEngine:'google',
  showBookmarkNames:true,
  customSearchEngines:[],
  positions:{...DEFAULT_POSITIONS},
  modules:{clock:true,search:true,bookmarks:true,hitokoto:true},
};

const DEFAULT_BOOKMARKS = [
  {id:genId(),name:'GitHub',url:'https://github.com',icon:null},
  {id:genId(),name:'YouTube',url:'https://youtube.com',icon:null},
  {id:genId(),name:'Gmail',url:'https://mail.google.com',icon:null},
  {id:genId(),name:'Twitter',url:'https://twitter.com',icon:null},
  {id:genId(),name:'Reddit',url:'https://reddit.com',icon:null},
  {id:genId(),name:'Bilibili',url:'https://bilibili.com',icon:null},
];
function genId(){return'bm_'+Math.random().toString(36).slice(2,10)}
function genEngineId(){return'ce_'+Math.random().toString(36).slice(2,8)}

/* ================================================================
   状态
   ================================================================ */
let settings = {...DEFAULTS,modules:{...DEFAULTS.modules},customSearchEngines:[],positions:{...DEFAULT_POSITIONS}};
let bookmarks = [];
let customWallpaperDataUrl = null;
let isEditMode = false;
let isReorderMode = false;
let positionsSnapshot = null;
let editingBookmarkId = null;
let editingEngineId = null;
let modalTempIcon = null;
let suggestionIdx = -1;

/* ================================================================
   DOM 引用
   ================================================================ */
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const dom={
  wallpaper:$('#wallpaper'),editBlur:$('#edit-blur'),snapLine:$('#snap-line'),
  layoutCanvas:$('#layout-canvas'),
  moduleClock:$('#module-clock'),moduleSearch:$('#module-search'),moduleBookmarks:$('#module-bookmarks'),
  time:$('#time'),date:$('#date'),
  searchInput:$('#search-input'),searchWrapper:$('#search-wrapper'),
  engineBtn:$('#engine-btn'),engineLabel:$('#engine-label'),engineDropdown:$('#engine-dropdown'),
  bookmarksInner:$('#bookmarks-inner'),
  hitokotoFixed:$('#hitokoto-fixed'),hitokotoText:$('#hitokoto-text'),hitokotoFrom:$('#hitokoto-from'),
  layoutToolbar:$('#layout-toolbar'),reorderToast:$('#reorder-toast'),
  settingsOverlay:$('#settings-overlay'),settingsPanel:$('#settings-panel'),settingsClose:$('#settings-close'),
  bookmarkCountHint:$('#bookmark-count-hint'),
  modalOverlay:$('#modal-overlay'),
};

/* ================================================================
   工具
   ================================================================ */
function getDomain(u){try{return new URL(u).hostname.replace(/^www\./,'')}catch{return u}}

function getFaviconUrl(bm){
  return bm.icon || '';
}
function getAllEngines(){const e={};for(const[k,v]of Object.entries(BUILTIN_ENGINES))e[k]={...v,builtin:true,icon:ENGINE_ICONS[k]};for(const ce of settings.customSearchEngines)e[ce.id]={name:ce.name,url:ce.url,builtin:false,icon:null};return e}
function buildSearchUrl(eng,q){let u=eng.url;if(u.includes('{query}'))u=u.replace('{query}',encodeURIComponent(q));else if(u.includes('%s'))u=u.replace('%s',encodeURIComponent(q));else u+=encodeURIComponent(q);return u}

/* ================================================================
   初始化
   ================================================================ */
async function init(){
  await loadAll();
  applyTheme();
  applyPositions();
  initWallpaper();
  initClock();
  initSearch();
  renderBookmarks();
  fetchHitokoto();
  bindSettings();
  bindEditMode();
  bindBookmarkModal();
  bindEngineModal();
  bindGlobalEvents();
  startHitokotoInterval();
  startClockInterval();
}

async function loadAll(){
  const[sd,ld]=await Promise.all([Storage.get(['settings']),Storage.getLocal(['bookmarks','customWallpaper'])]);
  if(sd.settings){settings={...DEFAULTS,modules:{...DEFAULTS.modules},customSearchEngines:[],positions:{...DEFAULT_POSITIONS},...sd.settings};settings.modules={...DEFAULTS.modules,...(sd.settings.modules||{})};if(!Array.isArray(settings.customSearchEngines))settings.customSearchEngines=[];if(!settings.positions)settings.positions={...DEFAULT_POSITIONS};for(const m of['clock','search','bookmarks']){if(!settings.positions[m])settings.positions[m]={...DEFAULT_POSITIONS[m]}}}
  bookmarks=ld.bookmarks?.length?ld.bookmarks:[...DEFAULT_BOOKMARKS];if(!ld.bookmarks?.length)await Storage.setLocal({bookmarks});
  customWallpaperDataUrl=ld.customWallpaper||null;
  applyModuleVisibility();applyBookmarkNameVisibility();populateSettingsForm();updateBmCount();
}

/* ================================================================
   主题
   ================================================================ */
function applyTheme(){const t=settings.theme;document.documentElement.setAttribute('data-theme',t==='system'?(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):t)}

/* ================================================================
   自由定位
   ================================================================ */
function applyPositions(){
  for(const[m,pos]of Object.entries(settings.positions)){
    const el=document.querySelector(`#module-${m}`);if(!el)continue;
    el.style.left=`${pos.x}%`;el.style.top=`${pos.y}%`;
  }
  dom.layoutCanvas.classList.toggle('edit-mode',isEditMode);
}

function resetPositions(){settings.positions={...DEFAULT_POSITIONS};applyPositions();saveSettings()}

/* ================================================================
   编辑模式（模块拖放）
   ================================================================ */

function enterEditMode(){
  positionsSnapshot = JSON.parse(JSON.stringify(settings.positions));
  isEditMode = true;
  dom.layoutCanvas.classList.add('edit-mode');
  dom.editBlur.removeAttribute('hidden');dom.editBlur.classList.add('visible');
  dom.layoutToolbar.removeAttribute('hidden');
  closeSettings();
  bindModuleDrag();
}

function exitEditMode(save=false){
  if(!save && positionsSnapshot){settings.positions = positionsSnapshot;applyPositions()}
  if(save){clearTimeout(_ssTimer);Storage.set({settings});applyTheme();applyModuleVisibility();applyBookmarkNameVisibility()}
  positionsSnapshot = null;
  isEditMode = false;
  dom.layoutCanvas.classList.remove('edit-mode');
  dom.editBlur.classList.remove('visible');setTimeout(()=>dom.editBlur.setAttribute('hidden',''),300);
  dom.layoutToolbar.setAttribute('hidden','');
  dom.snapLine.classList.remove('active');
  unbindModuleDrag();
}

function bindEditMode(){
  $('#btn-edit-layout').addEventListener('click',enterEditMode);
  $('#btn-layout-save').addEventListener('click',()=>exitEditMode(true));
  $('#btn-layout-cancel').addEventListener('click',()=>exitEditMode(false));
  $('#btn-layout-reset').addEventListener('click',()=>{resetPositions()});
}

/* ================================================================
   模块拖放核心
   ================================================================ */

let dragState = null; // { module, moduleName, startMouseX, startMouseY, startLeft, startTop, snapped }

function bindModuleDrag(){
  $$('.free-module').forEach(mod=>{
    const handle = mod.querySelector('.module-handle');
    // 从手柄或模块本体开始拖拽
    const startFn = (e) => {
      if(!isEditMode||isReorderMode) return;
      if(e.target.closest('input')||e.target.closest('button')||e.target.closest('.bookmark-item')) return;
      e.preventDefault();
      const cx = e.touches?e.touches[0].clientX:e.clientX;
      const cy = e.touches?e.touches[0].clientY:e.clientY;
      const rect = mod.getBoundingClientRect();
      const canvasRect = dom.layoutCanvas.getBoundingClientRect();
      // 模块当前位置（百分比）
      const curLeft = parseFloat(mod.style.left)||50;
      const curTop = parseFloat(mod.style.top)||10;
      dragState = {
        module: mod, moduleName: mod.dataset.module,
        startMouseX: cx, startMouseY: cy,
        startLeft: curLeft, startTop: curTop,
        canvasW: canvasRect.width, canvasH: canvasRect.height,
        snapped: false,
      };
      mod.classList.add('dragging');
      document.body.style.cursor = 'grabbing';
    };
    if(handle){handle.addEventListener('mousedown',startFn);handle.addEventListener('touchstart',startFn,{passive:false})}
    mod.addEventListener('mousedown',startFn);
    mod.addEventListener('touchstart',startFn,{passive:false});
  });

  document.addEventListener('mousemove',onDragMove);
  document.addEventListener('mouseup',onDragEnd);
  document.addEventListener('touchmove',onDragMove,{passive:false});
  document.addEventListener('touchend',onDragEnd);
}

function unbindModuleDrag(){
  document.removeEventListener('mousemove',onDragMove);
  document.removeEventListener('mouseup',onDragEnd);
  document.removeEventListener('touchmove',onDragMove);
  document.removeEventListener('touchend',onDragEnd);
}

function onDragMove(e){
  if(!dragState) return;
  e.preventDefault();
  const cx = e.touches?e.touches[0].clientX:e.clientX;
  const cy = e.touches?e.touches[0].clientY:e.clientY;

  const dx = cx - dragState.startMouseX;
  const dy = cy - dragState.startMouseY;

  // 像素位移 → 百分比位移
  let newX = dragState.startLeft + (dx / dragState.canvasW) * 100;
  let newY = dragState.startTop  + (dy / dragState.canvasH) * 100;

  // 中心吸附
  const distToCenter = Math.abs(newX - 50);
  if (distToCenter < SNAP_THRESHOLD) {
    // 磁吸效应：越靠近中心越难拉走
    const pull = distToCenter / SNAP_THRESHOLD;
    newX = 50 - (50 - newX) * (1 - pull * 0.7);
    dom.snapLine.classList.add('active');
    dragState.snapped = true;
  } else {
    dom.snapLine.classList.remove('active');
    dragState.snapped = false;
  }

  // 边界钳制
  newX = Math.max(2, Math.min(98, newX));
  newY = Math.max(2, Math.min(95, newY));

  // 实时更新
  dragState.module.style.left = `${newX}%`;
  dragState.module.style.top  = `${newY}%`;

  // 同步更新 settings
  if(settings.positions[dragState.moduleName]){
    settings.positions[dragState.moduleName].x = newX;
    settings.positions[dragState.moduleName].y = newY;
  }
}

function onDragEnd(){
  if(!dragState) return;
  const mod = dragState.module;
  const modName = dragState.moduleName;

  // 松手时在磁吸范围内 → 吸附到中心
  if(settings.positions[modName]){
    const pos = settings.positions[modName];
    if(Math.abs(pos.x - 50) < SNAP_MAGNET){
      pos.x = 50;
      mod.style.left = '50%';
    }
  }

  mod.classList.remove('dragging');
  dom.snapLine.classList.remove('active');
  document.body.style.cursor = '';
  dragState = null;
}

/* ================================================================
   壁纸
   ================================================================ */
async function initWallpaper(){if(settings.wallpaperSource==='custom'&&customWallpaperDataUrl)setWallpaper(customWallpaperDataUrl);else await fetchBing()}
async function fetchBing(){try{const r=await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1');const d=await r.json();if(d?.images?.length)setWallpaper(`https://www.bing.com${d.images[0].url}`)}catch{}}
function setWallpaper(url){const img=new Image();img.onload=()=>{dom.wallpaper.style.backgroundImage=`url(${url})`;dom.wallpaper.classList.add('loaded')};img.onerror=()=>{dom.wallpaper.classList.add('loaded')};img.src=url}

/* ================================================================
   时钟
   ================================================================ */
let clockTimer=null;
function initClock(){updateClock()}
function startClockInterval(){if(clockTimer)return;setTimeout(()=>{updateClock();clockTimer=setInterval(updateClock,1000)},1000-(Date.now()%1000))}
function updateClock(){const n=new Date();dom.time.textContent=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;dom.date.textContent=`${n.getFullYear()}年${n.getMonth()+1}月${n.getDate()}日 ${['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][n.getDay()]}`}

/* ================================================================
   搜索
   ================================================================ */
function initSearch(){
  updateEngineLabel();renderEngineDropdown();

  const input = dom.searchInput;
  const clearBtn = $('#search-clear-btn');
  const suggestBox = $('#search-suggestions');
  let suggestTimer = null;

  // 清除按钮
  clearBtn.addEventListener('click',()=>{input.value='';clearBtn.hidden=true;suggestBox.innerHTML='';suggestBox.hidden=true;input.focus()});
  input.addEventListener('input',()=>{
    clearBtn.hidden = input.value==='';
    clearTimeout(suggestTimer);
    const q = input.value.trim();
    if(!q){suggestBox.innerHTML='';suggestBox.hidden=true;suggestionIdx=-1;return}
    suggestTimer = setTimeout(()=>fetchSuggestions(q, suggestBox), 200);
  });

  // 键盘导航
  input.addEventListener('keydown',(e)=>{
    const items = suggestBox.querySelectorAll('.suggestion-item');
    if(e.key==='ArrowDown'){
      e.preventDefault();
      suggestionIdx = Math.min(suggestionIdx+1, items.length-1);
      updateSuggestionHighlight(items);
    }else if(e.key==='ArrowUp'){
      e.preventDefault();
      suggestionIdx = Math.max(suggestionIdx-1, -1);
      updateSuggestionHighlight(items);
    }else if(e.key==='Enter'){
      const active = suggestBox.querySelector('.suggestion-item.active');
      if(active&&active.dataset.query){
        e.preventDefault();
        doSearch(active.dataset.query);
      }else if(input.value.trim()){
        doSearch(input.value.trim());
      }
    }else if(e.key==='Escape'){
      suggestBox.innerHTML='';suggestBox.hidden=true;suggestionIdx=-1;
    }
  });

  // 点击建议
  suggestBox.addEventListener('click',(e)=>{
    const item = e.target.closest('.suggestion-item');
    if(item?.dataset.query){doSearch(item.dataset.query)}
  });

  // 点击空白关闭建议
  document.addEventListener('click',(e)=>{
    if(!suggestBox.contains(e.target)&&e.target!==input){suggestBox.innerHTML='';suggestBox.hidden=true;suggestionIdx=-1}
    dom.engineDropdown.classList.remove('visible');
  });

  dom.engineBtn.addEventListener('click',(e)=>{e.stopPropagation();renderEngineDropdown();dom.engineDropdown.classList.toggle('visible')});
  dom.engineDropdown.addEventListener('click',(e)=>{const b=e.target.closest('.engine-option');if(b?.dataset.engine){settings.searchEngine=b.dataset.engine;updateEngineLabel();dom.engineDropdown.classList.remove('visible');saveSettings()}});
}

function doSearch(query){
  const eg = getAllEngines();const e = eg[settings.searchEngine]||eg['google'];
  window.open(buildSearchUrl(e, query), '_blank');
  $('#search-suggestions').innerHTML='';$('#search-suggestions').hidden=true;
  dom.searchInput.value='';$('#search-clear-btn').hidden=true;
}

function updateSuggestionHighlight(items){
  items.forEach((el,i)=>el.classList.toggle('active', i===suggestionIdx));
}

async function fetchSuggestions(query, box){
  suggestionIdx = -1;
  const results = [];

  // 本地书签匹配
  const bmMatches = bookmarks
    .filter(b=>b.name.toLowerCase().includes(query.toLowerCase())||getDomain(b.url).includes(query.toLowerCase()))
    .slice(0, 3);
  for(const bm of bmMatches){
    results.push({
      text: bm.name,
      url: bm.url,
      type: '书签',
      icon: getFaviconUrl(bm),
      query: bm.url,  // 点击后直接打开书签
    });
  }

  // 搜索引擎远程建议
  try{
    const engine = getAllEngines()[settings.searchEngine];
    let sugUrl = null;
    if(settings.searchEngine==='google') sugUrl = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
    else if(settings.searchEngine==='bing') sugUrl = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`;

    if(sugUrl){
      const resp = await fetch(sugUrl);
      const data = await resp.json();
      const suggestions = Array.isArray(data) ? (Array.isArray(data[1])?data[1]:data) : [];
      for(const s of suggestions.slice(0, 5)){
        if(typeof s==='string'&&s.toLowerCase()!==query.toLowerCase()){
          results.push({text: s, type: '建议', query: s, icon: null});
        }
      }
    }
  }catch{}

  // 渲染建议列表
  box.innerHTML = '';
  if(!results.length){box.hidden=true;return}
  for(const r of results){
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.dataset.query = r.query;
    item.innerHTML = `
      <span class="suggestion-icon">${r.icon?`<img src="${r.icon}" width="18" height="18" style="border-radius:3px">`:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'}</span>
      <span class="suggestion-text">${escapeHtml(r.text)}</span>
      <span class="suggestion-type">${r.type}</span>`;
    box.appendChild(item);
  }
  box.hidden = false;
}

function escapeHtml(str){
  const div = document.createElement('div');div.textContent=str;return div.innerHTML;
}

function updateEngineLabel(){const eg=getAllEngines();const e=eg[settings.searchEngine];dom.engineLabel.textContent=e?e.name.charAt(0).toUpperCase():'G'}
function renderEngineDropdown(){const dd=dom.engineDropdown;const eg=getAllEngines();dd.innerHTML='';for(const[k,e]of Object.entries(eg)){const b=document.createElement('button');b.className='engine-option'+(k===settings.searchEngine?' active':'');b.dataset.engine=k;b.innerHTML=`${e.icon||'<span class="engine-option-icon" style="background:var(--text-tertiary)">'+e.name.charAt(0).toUpperCase()+'</span>'} <span>${e.name}</span>`;dd.appendChild(b)}}

/* ================================================================
   书签渲染（模块内部）
   ================================================================ */
function renderBookmarks(){
  const inner = dom.bookmarksInner;
  inner.innerHTML = '';

  bookmarks.forEach((bm,idx)=>{
    const el = document.createElement('div');
    el.className = 'bookmark-item';el.dataset.bmId = bm.id;
    el.draggable = isReorderMode;
    el.style.animationDelay = `${idx*0.03}s`;

    const iw = document.createElement('div');iw.className='bookmark-icon-wrap';
    const iconUrl = getFaviconUrl(bm);
    if(iconUrl){
      const img = document.createElement('img');img.src=iconUrl;img.alt='';img.loading='lazy';
      img.onerror=()=>{img.hidden=true;const fb=document.createElement('span');fb.className='bookmark-icon-fallback';fb.textContent=bm.name.charAt(0).toUpperCase();iw.appendChild(fb)};
      iw.appendChild(img);
    }else{
      const fb=document.createElement('span');fb.className='bookmark-icon-fallback';fb.textContent=bm.name.charAt(0).toUpperCase();
      iw.appendChild(fb);
    }

    const nm = document.createElement('span');nm.className='bookmark-name';nm.textContent=bm.name;

    const db = document.createElement('button');db.className='bm-delete-btn';db.innerHTML='&times;';db.title='删除';
    db.addEventListener('click',(e)=>{e.stopPropagation();deleteBm(bm.id)});

    el.append(iw,nm,db);

    // 点击
    el.addEventListener('click',()=>{
      if(isReorderMode) openBookmarkModal(bm.id);
      else if(bm.url) window.open(bm.url,'_blank');
    });

    // 长按 → 排序模式
    let press=null;const cl=()=>{if(press){clearTimeout(press);press=null}};
    el.addEventListener('mousedown',()=>{if(!isReorderMode&&!isEditMode) press=setTimeout(()=>enterReorderMode(),500)});
    el.addEventListener('mouseup',cl);el.addEventListener('mouseleave',cl);
    el.addEventListener('touchstart',()=>{if(!isReorderMode&&!isEditMode) press=setTimeout(()=>enterReorderMode(),500)},{passive:true});
    el.addEventListener('touchend',cl);el.addEventListener('touchmove',cl);el.addEventListener('touchcancel',cl);

    // 排序拖拽
    el.addEventListener('dragstart',(e)=>bmDragStart(e,bm.id));
    el.addEventListener('dragover',(e)=>bmDragOver(e));
    el.addEventListener('dragleave',(e)=>bmDragLeave(e));
    el.addEventListener('drop',(e)=>bmDrop(e,bm.id));
    el.addEventListener('dragend',(e)=>bmDragEnd(e));

    // 右键
    el.addEventListener('contextmenu',(e)=>{e.preventDefault();e.stopPropagation();showBmMenu(e.clientX,e.clientY,bm.id)});

    inner.appendChild(el);
  });

  // + 按钮（排序模式）
  if(isReorderMode){
    const addBtn = document.createElement('div');
    addBtn.className='bm-add-btn visible';
    addBtn.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>添加</span>';
    addBtn.addEventListener('click',()=>openBookmarkModal(null));
    inner.appendChild(addBtn);
  }

  inner.classList.toggle('reorder-mode',isReorderMode);
  applyBookmarkNameVisibility();
}

/* ================================================================
   书签排序
   ================================================================ */
function enterReorderMode(){
  isReorderMode=true;renderBookmarks();
  dom.reorderToast.removeAttribute('hidden');dom.reorderToast.style.opacity='1';
  setTimeout(()=>{if(dom.reorderToast.style.opacity==='1')dom.reorderToast.style.opacity='0'},3000);
}
function exitReorderMode(){isReorderMode=false;renderBookmarks();dom.reorderToast.setAttribute('hidden','');dom.reorderToast.style.opacity='0'}

let bmDragId=null;
function bmDragStart(e,id){if(!isReorderMode)return;bmDragId=id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',id);e.currentTarget.classList.add('dragging');try{e.dataTransfer.setDragImage(new Image(),0,0)}catch{}}
function bmDragOver(e){if(!isReorderMode)return;e.preventDefault();e.dataTransfer.dropEffect='move';e.currentTarget.classList.add('drag-over')}
function bmDragLeave(e){e.currentTarget.classList.remove('drag-over')}
function bmDrop(e,tid){if(!isReorderMode||!bmDragId||bmDragId===tid)return;e.preventDefault();e.currentTarget.classList.remove('drag-over');moveBm(bmDragId,tid)}
function bmDragEnd(e){e.currentTarget.classList.remove('dragging');bmDragId=null;dom.bookmarksInner.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'))}
function moveBm(fid,tid){const fi=bookmarks.findIndex(b=>b.id===fid);const ti=bookmarks.findIndex(b=>b.id===tid);if(fi===-1||ti===-1)return;const[m]=bookmarks.splice(fi,1);bookmarks.splice(ti,0,m);saveBookmarks();renderBookmarks()}

/* ================================================================
   书签 CRUD
   ================================================================ */
async function saveBookmarks(){await Storage.setLocal({bookmarks});updateBmCount()}

let _ssTimer = null;
function saveSettings(){
  clearTimeout(_ssTimer);
  _ssTimer = setTimeout(async () => {
    await Storage.set({settings});
    applyTheme();applyModuleVisibility();applyBookmarkNameVisibility();initWallpaper();
  }, 100);
}
function deleteBm(id){
  bookmarks=bookmarks.filter(b=>b.id!==id);
  saveBookmarks();renderBookmarks();renderBmMgrList();
}
function showBmMenu(x,y,id){
  const ex=document.querySelector('.context-menu');if(ex)ex.remove();
  const bm=bookmarks.find(b=>b.id===id);if(!bm)return;
  const m=document.createElement('div');m.className='context-menu';m.style.left=`${x}px`;m.style.top=`${y}px`;
  for(const b of[{t:'打开',a:()=>{if(bm.url)window.open(bm.url,'_blank')}},{t:'编辑',a:()=>openBookmarkModal(id)},{t:isReorderMode?'退出排序':'调整排序',a:()=>{isReorderMode?exitReorderMode():enterReorderMode()}},{t:'删除',a:()=>deleteBm(id)}]){const btn=document.createElement('button');btn.textContent=b.t;btn.addEventListener('click',()=>{m.remove();b.a()});m.appendChild(btn)}
  document.body.appendChild(m);
  const closer=(e)=>{if(!m.contains(e.target)){m.remove();document.removeEventListener('click',closer)}};
  setTimeout(()=>document.addEventListener('click',closer),0);
}

/* ================================================================
   书签弹窗
   ================================================================ */
function openBookmarkModal(id){editingBookmarkId=id;modalTempIcon=null;if(id){const bm=bookmarks.find(b=>b.id===id);if(!bm)return;$('#bookmark-modal-title').textContent='编辑书签';$('#bookmark-name').value=bm.name;$('#bookmark-url').value=bm.url;modalTempIcon=bm.icon;updateIconPreview(bm)}else{$('#bookmark-modal-title').textContent='添加书签';$('#bookmark-name').value='';$('#bookmark-url').value='';modalTempIcon=null;updateIconPreview(null)}$('#btn-clear-icon').hidden=!modalTempIcon;showM($('#bookmark-modal'),dom.modalOverlay);setTimeout(()=>$('#bookmark-name').focus(),100)}
function closeBookmarkModal(){hideM($('#bookmark-modal'),dom.modalOverlay);editingBookmarkId=null;modalTempIcon=null}
function updateIconPreview(bm){if(modalTempIcon){$('#modal-icon-img').src=modalTempIcon;$('#modal-icon-img').hidden=false;$('#modal-icon-placeholder').hidden=true}else if(bm?.url){$('#modal-icon-img').src=getFaviconUrl(bm);$('#modal-icon-img').hidden=false;$('#modal-icon-placeholder').hidden=true}else{$('#modal-icon-img').hidden=true;$('#modal-icon-placeholder').hidden=false}}
async function saveBmFromModal(){const name=$('#bookmark-name').value.trim(),raw=$('#bookmark-url').value.trim();if(!name){$('#bookmark-name').focus();return}if(!raw){$('#bookmark-url').focus();return}const url=/^https?:\/\//i.test(raw)?raw:`https://${raw}`;if(editingBookmarkId){const bm=bookmarks.find(b=>b.id===editingBookmarkId);if(bm){bm.name=name;bm.url=url;bm.icon=modalTempIcon||null}}else{bookmarks.push({id:genId(),name,url,icon:modalTempIcon||null})}await saveBookmarks();closeBookmarkModal();renderBookmarks();renderBmMgrList()}
function bindBookmarkModal(){$('#btn-cancel-bookmark').addEventListener('click',closeBookmarkModal);$('#modal-close').addEventListener('click',closeBookmarkModal);dom.modalOverlay.addEventListener('click',closeBookmarkModal);$('#btn-save-bookmark').addEventListener('click',saveBmFromModal);$('#bookmark-url').addEventListener('input',()=>{if(!modalTempIcon)updateIconPreview({url:$('#bookmark-url').value.trim(),icon:null})});$('#btn-upload-icon').addEventListener('click',()=>$('#icon-file-input').click());$('#btn-search-icon-online').addEventListener('click',()=>window.open('https://www.iconfont.cn/','_blank'));$('#icon-file-input').addEventListener('change',function(){const f=this.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{modalTempIcon=r.result;updateIconPreview(null);$('#btn-clear-icon').hidden=false};r.readAsDataURL(f)});$('#btn-clear-icon').addEventListener('click',()=>{modalTempIcon=null;updateIconPreview({url:$('#bookmark-url').value.trim(),icon:null});$('#btn-clear-icon').hidden=true});$('#bookmark-name').addEventListener('keydown',(e)=>{if(e.key==='Enter')$('#bookmark-url').focus()});$('#bookmark-url').addEventListener('keydown',(e)=>{if(e.key==='Enter')saveBmFromModal()})}

/* ================================================================
   搜索引擎弹窗
   ================================================================ */
function openEngineModal(id){editingEngineId=id;if(id){const ce=settings.customSearchEngines.find(e=>e.id===id);if(!ce)return;$('#engine-modal-title').textContent='编辑搜索引擎';$('#engine-name').value=ce.name;$('#engine-url').value=ce.url}else{$('#engine-modal-title').textContent='添加搜索引擎';$('#engine-name').value='';$('#engine-url').value=''}showM($('#engine-modal'),$('#engine-modal-overlay'));setTimeout(()=>$('#engine-name').focus(),100)}
function closeEngineModal(){hideM($('#engine-modal'),$('#engine-modal-overlay'));editingEngineId=null}
async function saveEngineFromModal(){const name=$('#engine-name').value.trim(),url=$('#engine-url').value.trim();if(!name){$('#engine-name').focus();return}if(!url){$('#engine-url').focus();return}if(!url.includes('{query}')&&!url.includes('%s')){if(!confirm('URL 中未包含 {query} 占位符，搜索词将被追加到 URL 末尾。确定保存？'))return}if(editingEngineId){const ce=settings.customSearchEngines.find(e=>e.id===editingEngineId);if(ce){ce.name=name;ce.url=url}}else settings.customSearchEngines.push({id:genEngineId(),name,url});await saveSettings();closeEngineModal();renderEngineDropdown();renderCustomEngineList();populateEngineSelect()}
function bindEngineModal(){$('#btn-cancel-engine').addEventListener('click',closeEngineModal);$('#engine-modal-close').addEventListener('click',closeEngineModal);$('#engine-modal-overlay').addEventListener('click',closeEngineModal);$('#btn-save-engine').addEventListener('click',saveEngineFromModal);$('#engine-name').addEventListener('keydown',(e)=>{if(e.key==='Enter')$('#engine-url').focus()});$('#engine-url').addEventListener('keydown',(e)=>{if(e.key==='Enter')saveEngineFromModal()})}
function deleteCustomEngine(id){settings.customSearchEngines=settings.customSearchEngines.filter(e=>e.id!==id);if(settings.searchEngine===id)settings.searchEngine='google';saveSettings();renderEngineDropdown();renderCustomEngineList();populateEngineSelect();updateEngineLabel()}

/* ================================================================
   Modal
   ================================================================ */
function showM(m,o){m.classList.add('visible');o.classList.add('visible');m.removeAttribute('hidden');o.removeAttribute('hidden')}
function hideM(m,o){m.classList.remove('visible');o.classList.remove('visible');setTimeout(()=>{m.setAttribute('hidden','');o.setAttribute('hidden','')},300)}

/* ================================================================
   每日一言
   ================================================================ */
let hitokotoTimer=null;
async function fetchHitokoto(){try{const r=await fetch('https://v1.hitokoto.cn/');const d=await r.json();if(d?.hitokoto){dom.hitokotoText.classList.add('fading');setTimeout(()=>{dom.hitokotoText.textContent=d.hitokoto;dom.hitokotoFrom.textContent=d.from?`—— ${d.from}`:'';dom.hitokotoText.classList.remove('fading')},300)}}catch{}}
function startHitokotoInterval(){if(hitokotoTimer)clearInterval(hitokotoTimer);hitokotoTimer=setInterval(fetchHitokoto,30_000)}

/* ================================================================
   设置面板
   ================================================================ */
function bindSettings(){
  dom.settingsClose.addEventListener('click',closeSettings);
  dom.settingsOverlay.addEventListener('click',closeSettings);
  // 右键空白 → 设置
  document.addEventListener('contextmenu',(e)=>{
    if(isEditMode||isReorderMode) return;
    // 右键书签图标不触发设置（书签右键菜单自己处理）
    if(e.target.closest('.bookmark-item')) return;
    if(e.target.closest('.module-handle')) return;
    // 空白区域 → 打开设置
    e.preventDefault();
    openSettings();
  });
  // ESC
  document.addEventListener('keydown',(e)=>{
    if(e.key!=='Escape')return;
    if(isEditMode){exitEditMode(false);return}
    if(isReorderMode){exitReorderMode();return}
    if(dom.settingsPanel.classList.contains('open'))closeSettings();
    else if($('#bookmark-modal').classList.contains('visible'))closeBookmarkModal();
    else if($('#engine-modal')?.classList.contains('visible'))closeEngineModal();
  });
  // 点击空白退出排序
  document.addEventListener('click',(e)=>{
    if(isReorderMode&&!e.target.closest('.bookmark-item')&&!e.target.closest('.bm-add-btn')&&!e.target.closest('.context-menu')){
      exitReorderMode();
    }
  });
  // 子面板
  $('#btn-manage-bookmarks').addEventListener('click',()=>openSub('bookmarks'));
  $('#btn-back-bookmarks').addEventListener('click',()=>closeSub('bookmarks'));
  $('#btn-manage-engines').addEventListener('click',()=>openSub('engines'));
  $('#btn-back-engines').addEventListener('click',()=>closeSub('engines'));
  $('#btn-add-bookmark').addEventListener('click',()=>openBookmarkModal(null));
  $('#btn-add-engine').addEventListener('click',()=>openEngineModal(null));
  bindSettingsForm();
}
function openSub(n){const s=$(`#settings-sub-${n}`);if(s){s.removeAttribute('hidden');requestAnimationFrame(()=>s.classList.add('active'))}if(n==='bookmarks')renderBmMgrList();if(n==='engines')renderCustomEngineList()}
function closeSub(n){const s=$(`#settings-sub-${n}`);if(s){s.classList.remove('active');setTimeout(()=>s.setAttribute('hidden',''),300)}}
function openSettings(){dom.settingsPanel.classList.add('open');dom.settingsOverlay.removeAttribute('hidden');dom.settingsOverlay.classList.add('visible');dom.settingsPanel.removeAttribute('aria-hidden');populateSettingsForm();updateBmCount();$$('.settings-sub').forEach(s=>{s.classList.remove('active');s.setAttribute('hidden','')})}
function closeSettings(){dom.settingsPanel.classList.remove('open');dom.settingsOverlay.classList.remove('visible');setTimeout(()=>{dom.settingsOverlay.setAttribute('hidden','');dom.settingsPanel.setAttribute('aria-hidden','true');$$('.settings-sub').forEach(s=>{s.classList.remove('active');s.setAttribute('hidden','')})},300)}
function populateSettingsForm(){$('#setting-theme').value=settings.theme;$('#setting-wallpaper-source').value=settings.wallpaperSource;$('#setting-show-bookmark-names').checked=settings.showBookmarkNames;$('#setting-module-clock').checked=settings.modules.clock;$('#setting-module-search').checked=settings.modules.search;$('#setting-module-bookmarks').checked=settings.modules.bookmarks;$('#setting-module-hitokoto').checked=settings.modules.hitokoto;updateWallpaperUI();populateEngineSelect()}
function populateEngineSelect(){const sel=$('#setting-search-engine');if(!sel)return;const eg=getAllEngines();const cv=sel.value;sel.innerHTML='';for(const[k,e]of Object.entries(eg)){const o=document.createElement('option');o.value=k;o.textContent=e.name+(e.builtin?'':' (自定义)');sel.appendChild(o)}if(eg[cv])sel.value=cv;else if(cv){sel.value='google';settings.searchEngine='google';updateEngineLabel();renderEngineDropdown();saveSettings()}}
function updateBmCount(){const el=dom.bookmarkCountHint;if(el)el.textContent=`共 ${bookmarks.length} 个书签`}
function bindSettingsForm(){$('#setting-theme').addEventListener('change',(e)=>{settings.theme=e.target.value;saveSettings()});$('#setting-show-bookmark-names').addEventListener('change',(e)=>{settings.showBookmarkNames=e.target.checked;saveSettings()});$('#setting-wallpaper-source').addEventListener('change',async(e)=>{settings.wallpaperSource=e.target.value;updateWallpaperUI();if(e.target.value==='bing')await fetchBing();saveSettings()});$('#btn-upload-wallpaper').addEventListener('click',()=>$('#wallpaper-file-input').click());$('#wallpaper-file-input').addEventListener('change',async function(){const f=this.files[0];if(!f)return;const r=new FileReader();r.onload=async()=>{customWallpaperDataUrl=r.result;settings.wallpaperSource='custom';$('#setting-wallpaper-source').value='custom';updateWallpaperUI();setWallpaper(r.result);await Storage.setLocal({customWallpaper:r.result});await saveSettings()};r.readAsDataURL(f)});$('#btn-reset-wallpaper').addEventListener('click',async()=>{customWallpaperDataUrl=null;settings.wallpaperSource='bing';$('#setting-wallpaper-source').value='bing';updateWallpaperUI();await fetchBing();await Storage.setLocal({customWallpaper:null});await saveSettings()});$('#setting-search-engine').addEventListener('change',(e)=>{settings.searchEngine=e.target.value;updateEngineLabel();renderEngineDropdown();saveSettings()});['clock','search','bookmarks','hitokoto'].forEach(mod=>{$(`#setting-module-${mod}`).addEventListener('change',(e)=>{settings.modules[mod]=e.target.checked;saveSettings()})});$('#btn-export').addEventListener('click',exportConfig);$('#btn-import').addEventListener('click',()=>$('#import-file-input').click());$('#import-file-input').addEventListener('change',importConfig)}
function updateWallpaperUI(){const c=settings.wallpaperSource==='custom';$('#custom-wallpaper-row').hidden=!c;$('#btn-reset-wallpaper').hidden=!customWallpaperDataUrl}

/* ================================================================
   可见性
   ================================================================ */
function applyModuleVisibility(){dom.moduleClock.hidden=!settings.modules.clock;dom.moduleSearch.hidden=!settings.modules.search;dom.moduleBookmarks.hidden=!settings.modules.bookmarks;dom.hitokotoFixed.hidden=!settings.modules.hitokoto}
function applyBookmarkNameVisibility(){dom.bookmarksInner.classList.toggle('hide-names',!settings.showBookmarkNames)}

/* ================================================================
   列表（子面板）
   ================================================================ */
function renderBmMgrList(){const list=$('#bookmark-manage-list');if(!list)return;list.innerHTML='';bookmarks.forEach(bm=>{const li=document.createElement('li');li.className='bookmark-manage-item';li.draggable=true;li.dataset.id=bm.id;const img=document.createElement('img');img.className='bookmark-manage-icon';img.src=getFaviconUrl(bm);img.alt='';img.onerror=()=>{img.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect fill="%23ccc" width="28" height="28" rx="6"/></svg>')};const ns=document.createElement('span');ns.className='bookmark-manage-name';ns.textContent=bm.name;const us=document.createElement('span');us.className='bookmark-manage-url';us.textContent=getDomain(bm.url);const ac=document.createElement('span');ac.className='bookmark-manage-actions';ac.innerHTML='<button class="btn-manage-edit" title="编辑"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn-manage-delete" title="删除"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';ac.querySelector('.btn-manage-edit').addEventListener('click',(e)=>{e.stopPropagation();openBookmarkModal(bm.id)});ac.querySelector('.btn-manage-delete').addEventListener('click',(e)=>{e.stopPropagation();deleteBm(bm.id)});li.append(img,ns,us,ac);li.addEventListener('dragstart',(e)=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',bm.id);li.classList.add('dragging')});li.addEventListener('dragover',(e)=>{e.preventDefault();e.dataTransfer.dropEffect='move';li.classList.add('drag-over')});li.addEventListener('dragleave',()=>li.classList.remove('drag-over'));li.addEventListener('drop',(e)=>{e.preventDefault();li.classList.remove('drag-over');const fid=e.dataTransfer.getData('text/plain');if(fid&&fid!==bm.id){const fi=bookmarks.findIndex(b=>b.id===fid);const ti=bookmarks.findIndex(b=>b.id===bm.id);if(fi!==-1&&ti!==-1){const[m]=bookmarks.splice(fi,1);bookmarks.splice(ti,0,m);saveBookmarks();renderBookmarks();renderBmMgrList()}}});li.addEventListener('dragend',()=>li.classList.remove('dragging'));list.appendChild(li)})}

function renderCustomEngineList(){const list=$('#custom-engine-list');if(!list)return;list.innerHTML='';if(!settings.customSearchEngines.length){const li=document.createElement('li');li.style.cssText='font-size:12px;color:var(--text-tertiary);padding:4px 0';li.textContent='暂无自定义引擎';list.appendChild(li);return}for(const ce of settings.customSearchEngines){const li=document.createElement('li');li.className='custom-engine-item';const ns=document.createElement('span');ns.className='custom-engine-name';ns.textContent=ce.name;const us=document.createElement('span');us.className='custom-engine-url';us.textContent=ce.url.replace('{query}','…');const ac=document.createElement('span');ac.className='custom-engine-actions';ac.innerHTML='<button title="编辑"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn-custom-delete" title="删除"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';ac.querySelector('button:first-child').addEventListener('click',()=>openEngineModal(ce.id));ac.querySelector('.btn-custom-delete').addEventListener('click',()=>deleteCustomEngine(ce.id));li.append(ns,us,ac);list.appendChild(li)}}

/* ================================================================
   导入/导出
   ================================================================ */
async function exportConfig(){try{const d=await Storage.exportAll();const b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`pure-start-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u)}catch(e){alert('导出失败：'+e.message)}}
async function importConfig(e){const f=e.target.files[0];if(!f)return;try{const t=await new Promise((r,rej)=>{const rd=new FileReader();rd.onload=()=>r(rd.result);rd.onerror=()=>rej(new Error('读取失败'));rd.readAsText(f)});const d=JSON.parse(t);if(!d.version||!d.settings)throw new Error('无效配置文件');if(!confirm('导入将覆盖当前所有设置、书签和壁纸，确定继续？'))return;await Storage.importAll(d);await loadAll();applyTheme();applyPositions();initWallpaper();renderBookmarks();renderEngineDropdown();updateEngineLabel();applyModuleVisibility();applyBookmarkNameVisibility();alert('导入成功！')}catch(e2){alert('导入失败：'+e2.message)}finally{e.target.value=''}}

/* ================================================================
   全局事件
   ================================================================ */
function bindGlobalEvents(){
  window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{if(settings.theme==='system')applyTheme()});
  document.addEventListener('click',(e)=>{
    if(isEditMode||isReorderMode) return;
    if((e.target===document.body||e.target===dom.wallpaper)&&settings.modules.search&&!e.target.closest('.settings-panel')&&!e.target.closest('.modal')) dom.searchInput.focus();
  });
  document.addEventListener('keydown',(e)=>{
    if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&document.activeElement!==dom.searchInput&&document.activeElement!==$('#bookmark-name')&&document.activeElement!==$('#bookmark-url')&&document.activeElement!==$('#engine-name')&&document.activeElement!==$('#engine-url')&&!dom.settingsPanel.classList.contains('open')&&!$('#bookmark-modal')?.classList.contains('visible')&&!$('#engine-modal')?.classList.contains('visible')&&!isEditMode&&!isReorderMode){e.preventDefault();dom.searchInput.focus()}
  });
}

/* ================================================================
   动态样式
   ================================================================ */
function injectStyles(){
  if(document.getElementById('ps-dyn'))return;
  const s=document.createElement('style');s.id='ps-dyn';
  s.textContent='.context-menu{position:fixed;z-index:50;background:var(--modal-bg);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid var(--surface-border);border-radius:var(--r-md);box-shadow:var(--shadow-lg);padding:4px;min-width:120px;animation:psMenuIn .12s ease}@keyframes psMenuIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}.context-menu button{display:block;width:100%;padding:9px 14px;border:none;border-radius:var(--r-sm);background:transparent;color:var(--text-primary);font-size:13px;text-align:left;cursor:pointer;transition:background var(--t-fast)}.context-menu button:hover{background:var(--accent-subtle)}.context-menu button:last-child:hover{background:var(--danger);color:#fff}';
  document.head.appendChild(s);
}

document.addEventListener('DOMContentLoaded',()=>{injectStyles();init().catch(e=>console.error('Pure Start init error:',e))});
