/**
 * CloudSync — 云同步模块
 * 认证、推送/拉取配置、邀请码管理
 */
'use strict';

import { Component } from '../core/component.js';
import { store }   from '../core/store.js';
import { Storage } from '../core/storage.js';
import { API_BASE, DEFAULT_SETTINGS, DEFAULT_POSITIONS } from '../core/constants.js';
import { SearchModule } from '../../search-module.js';
import { Theme } from './theme.js';
import { Wallpaper } from './wallpaper.js';
import { $ } from '../core/utils.js';

class CloudSyncModule extends Component {
  constructor() {
    super('cloudsync');
    this._syncPushTimer = null;
  }

  get authToken() { return store.get('authToken'); }

  init() {
    // 监听书签变更 → 防抖推送
    store.subscribe('_bookmarksDirty', () => this._schedulePush());
    // 监听设置变更 → 防抖推送
    store.subscribe('_settingsDirty', () => this._schedulePush());
  }

  _status(msg) { const el = $('#sync-status-hint'); if (el) el.textContent = msg; }

  async _apiRequest(path, opts = {}) {
    const headers = opts.headers || {};
    const token = this.authToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    opts.headers = headers;
    const resp = await fetch(`${API_BASE}${path}`, opts);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || `请求失败 (${resp.status})`);
    return data;
  }

  /* ===== 认证 ===== */

  async register(username, password, inviteCode) {
    const data = await this._apiRequest('/auth/register', { method: 'POST', body: { username, password, inviteCode } });
    store.set('authToken', data.token);
    await Storage.set({ authToken: data.token });
    this._updateAccountUI();
  }

  async login(username, password) {
    const data = await this._apiRequest('/auth/login', { method: 'POST', body: { username, password } });
    store.set('authToken', data.token);
    await Storage.set({ authToken: data.token });
    this._updateAccountUI();
  }

  async logout() {
    store.set('authToken', null);
    await Storage.set({ authToken: null });
    this._updateAccountUI();
    this._status('');
  }

  /* ===== 同步 ===== */

  async pull() {
    if (!this.authToken) return;
    this._status('正在同步…');
    try {
      const remote = await this._apiRequest('/config');
      if (!remote) { this._status(`同步完成 · ${new Date().toLocaleTimeString()}`); return; }

      let changed = false;

      // 合并设置
      if (remote.settings) {
        const merged = { ...DEFAULT_SETTINGS, modules: { ...DEFAULT_SETTINGS.modules }, customSearchEngines: [], positions: { ...DEFAULT_POSITIONS }, ...remote.settings };
        merged.modules = { ...DEFAULT_SETTINGS.modules, ...(remote.settings.modules || {}) };
        if (!Array.isArray(merged.customSearchEngines)) merged.customSearchEngines = [];
        if (!merged.positions) merged.positions = { ...DEFAULT_POSITIONS };
        store.set('settings', merged);
        changed = true;
      }

      // 合并书签
      if (remote.bookmarks?.length) {
        store.set('bookmarks', remote.bookmarks);
        changed = true;
      }

      // 合并壁纸
      if (remote.customWallpaper) {
        store.set('customWallpaper', remote.customWallpaper);
        changed = true;
      }

      // 持久化到本地
      if (changed) {
        await Storage.set({ settings: store.get('settings') });
        await Storage.setLocal({
          bookmarks: store.get('bookmarks'),
          customWallpaper: store.get('customWallpaper'),
        });

        // 拉取后同步更新 UI（不依赖 store 订阅的模块）
        Theme.apply();
        Wallpaper.apply();
        SearchModule.applyStyle(store.get('settings')?.searchStyle);
        SearchModule.updateEngineLabel();
        SearchModule.renderEngineDropdown();
      }

      this._status(`同步完成 · ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      this._status('同步失败: ' + e.message);
    }
  }

  async push() {
    if (!this.authToken) return;
    try {
      const config = {
        settings: store.get('settings'),
        bookmarks: store.get('bookmarks'),
        customWallpaper: store.get('customWallpaper'),
      };
      await this._apiRequest('/config', { method: 'PUT', body: config });
      this._status(`已同步 · ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      this._status('同步失败: ' + e.message);
    }
  }

  _schedulePush() {
    clearTimeout(this._syncPushTimer);
    this._syncPushTimer = setTimeout(() => this.push(), 2000);
  }

  /* ===== 邀请码 ===== */

  async generateInviteCode() {
    const data = await this._apiRequest('/admin/invite', { method: 'POST' });
    const el = $('#invite-gen-result');
    if (el) { el.textContent = `已生成：${data.code}`; el.style.color = 'var(--accent)'; }
    return data;
  }

  async loadInviteCodes() {
    const codes = await this._apiRequest('/admin/invites');
    const list = $('#invite-code-list');
    if (!list) return codes;
    list.innerHTML = '';
    if (!codes.length) { list.innerHTML = '<li style="font-size:12px;color:var(--text-tertiary);padding:4px 0">暂无邀请码</li>'; return codes; }
    for (const c of codes) {
      const li = document.createElement('li'); li.className = 'invite-code-item';
      const statusClass = c.usedBy ? 'used' : 'available';
      const statusText = c.usedBy ? `已用 (${c.usedBy})` : '可用';
      li.innerHTML = `<span class="invite-code-text">${c.code}</span><span class="invite-code-status ${statusClass}">${statusText}</span>${c.usedBy ? '' : '<button class="invite-code-copy" title="复制"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>'}`;
      const copyBtn = li.querySelector('.invite-code-copy');
      if (copyBtn) copyBtn.addEventListener('click', () => { navigator.clipboard.writeText(c.code); copyBtn.textContent = '✓'; setTimeout(() => { copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'; }, 1500); });
      list.appendChild(li);
    }
    return codes;
  }

  /* ===== 账户 UI ===== */

  _updateAccountUI() {
    const loggedIn = !!this.authToken;
    const statusText = $('#account-status-text');
    if (statusText) statusText.textContent = loggedIn ? '已登录' : '未登录';
    const manageBtn = $('#btn-manage-account');
    if (manageBtn) manageBtn.hidden = loggedIn;
    const loggedInDiv = $('#account-logged-in');
    if (loggedInDiv) loggedInDiv.hidden = !loggedIn;
    if (loggedIn) {
      try {
        const payload = JSON.parse(atob(this.authToken.split('.')[1]));
        const username = payload.username || '';
        const userEl = $('#account-username');
        if (userEl) userEl.textContent = username || '已登录';
        const adminPanel = $('#admin-panel');
        if (adminPanel) adminPanel.hidden = username !== 'root';
      } catch {
        const userEl = $('#account-username');
        if (userEl) userEl.textContent = '已登录';
        const adminPanel = $('#admin-panel');
        if (adminPanel) adminPanel.hidden = true;
      }
    } else {
      const adminPanel = $('#admin-panel');
      if (adminPanel) adminPanel.hidden = true;
    }
  }
}

export const CloudSync = new CloudSyncModule();
