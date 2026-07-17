/**
 * App — 应用入口
 * 负责加载数据、初始化模块、绑定全局事件
 */
'use strict';

import { store }         from './core/store.js';
import { Storage }       from './core/storage.js';
import { loadAllFromStorage } from './core/utils.js';
import { SearchModule }  from '../search-module.js';

import { Theme }     from './modules/theme.js';
import { Clock }     from './modules/clock.js';
import { Wallpaper } from './modules/wallpaper.js';
import { Hitokoto }  from './modules/hitokoto.js';
import { Bookmarks } from './modules/bookmarks.js';
import { EditMode }  from './modules/editmode.js';
import { CloudSync } from './modules/cloudsync.js';
import { Settings }  from './modules/settings.js';

/* ===== 注入动态样式 ===== */
function injectStyles() {
  if (document.getElementById('ps-dyn')) return;
  const s = document.createElement('style'); s.id = 'ps-dyn';
  s.textContent = '.context-menu{position:fixed;z-index:50;background:var(--modal-bg);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid var(--surface-border);border-radius:var(--r-md);box-shadow:var(--shadow-lg);padding:4px;min-width:120px;animation:psMenuIn .12s ease}@keyframes psMenuIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}.context-menu button{display:block;width:100%;padding:9px 14px;border:none;border-radius:var(--r-sm);background:transparent;color:var(--text-primary);font-size:13px;text-align:left;cursor:pointer;transition:background var(--t-fast)}.context-menu button:hover{background:var(--accent-subtle)}.context-menu button:last-child:hover{background:var(--danger);color:#fff}';
  document.head.appendChild(s);
}

/* ===== 全局事件 ===== */
function bindGlobalEvents() {
  // 点击空白 → 失焦搜索框
  document.addEventListener('click', (e) => {
    if (store.get('isEditMode') || Bookmarks.isReorderMode) return;
    if (e.target.closest('[data-module="search"]')) return;
    const searchInput = SearchModule.getInput();
    if (searchInput && document.activeElement === searchInput) searchInput.blur();
  });
}

/* ===== 初始化 ===== */
async function init() {
  injectStyles();

  // 1. 加载数据到 store
  await loadAllFromStorage();

  // 2. 初始化各模块
  Theme.init();
  EditMode.init();
  Clock.init();
  Hitokoto.init();
  Wallpaper.init();
  Bookmarks.init();
  CloudSync.init();
  Settings.init();

  // 3. 搜索模块（独立模块，通过 getter 桥接）
  SearchModule.init({
    container: '[data-module="search"]',
    settingsGetter: () => store.get('settings'),
    storage: Storage,
    bookmarksGetter: () => store.get('bookmarks') || [],
  });

  // 4. 全局事件
  bindGlobalEvents();

  // 5. 已登录则拉取
  if (store.get('authToken')) CloudSync.pull();
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(e => console.error('Pure Start init error:', e));
});
