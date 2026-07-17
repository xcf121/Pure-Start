/**
 * Settings — 设置面板模块
 * 面板开关、表单绑定、子面板管理、导入导出
 */
'use strict';

import { Component } from '../core/component.js';
import { store }   from '../core/store.js';
import { Storage } from '../core/storage.js';
import { compressImage, genEngineId, loadAllFromStorage, $, $$ } from '../core/utils.js';
import { SearchModule } from '../../search-module.js';
import { Bookmarks } from './bookmarks.js';
import { CloudSync } from './cloudsync.js';
import { EditMode }  from './editmode.js';
import { Wallpaper } from './wallpaper.js';
import { Theme }     from './theme.js';

class SettingsModule extends Component {
  constructor() { super('settings'); }

  init() {
    this._bindPanel();
    this._bindForm();
    this._bindSubPanels();
    this._bindAccount();
    this._bindAdmin();
    this._bindDataIO();
    this._bindGlobalKeys();

    // 保存设置的防抖
    this._saveTimer = null;
  }

  /* ===== 面板开关 ===== */

  open() {
    const panel = this.$('#settings-panel');
    const overlay = this.$('#settings-overlay');
    if (panel) { panel.classList.add('open'); panel.removeAttribute('aria-hidden'); }
    if (overlay) { overlay.removeAttribute('hidden'); overlay.classList.add('visible'); }
    this._populateForm();
    this._updateBmCount();
    CloudSync._updateAccountUI();
    $$('.settings-sub').forEach(s => { s.classList.remove('active'); s.setAttribute('hidden', ''); });
  }

  close() {
    const panel = this.$('#settings-panel');
    const overlay = this.$('#settings-overlay');
    if (panel) panel.classList.remove('open');
    if (overlay) overlay.classList.remove('visible');
    setTimeout(() => {
      if (overlay) overlay.setAttribute('hidden', '');
      if (panel) panel.setAttribute('aria-hidden', 'true');
      $$('.settings-sub').forEach(s => { s.classList.remove('active'); s.setAttribute('hidden', ''); });
    }, 300);
  }

  isOpen() { return this.$('#settings-panel')?.classList.contains('open'); }

  /* ===== 子面板 ===== */

  openSub(name) {
    const s = this.$(`#settings-sub-${name}`);
    if (s) { s.removeAttribute('hidden'); requestAnimationFrame(() => s.classList.add('active')); }
    if (name === 'bookmarks') Bookmarks.renderManageList();
    if (name === 'engines') this._renderCustomEngineList();
  }

  closeSub(name) {
    const s = this.$(`#settings-sub-${name}`);
    if (s) { s.classList.remove('active'); setTimeout(() => s.setAttribute('hidden', ''), 300); }
  }

  /* ===== 表单填充 ===== */

  _populateForm() {
    const settings = store.get('settings');
    if (!settings) return;
    $('#setting-theme').value = settings.theme;
    $('#setting-wallpaper-source').value = settings.wallpaperSource;

    const styleSel = $('#setting-search-style');
    if (styleSel) {
      styleSel.innerHTML = '';
      for (const [k, v] of Object.entries(SearchModule.STYLES)) {
        const o = document.createElement('option'); o.value = k; o.textContent = v;
        if (k === (settings.searchStyle || 'frosted')) o.selected = true;
        styleSel.appendChild(o);
      }
    }

    $('#setting-show-bookmark-names').checked = settings.showBookmarkNames;
    $('#setting-module-clock').checked     = settings.modules.clock;
    $('#setting-module-search').checked    = settings.modules.search;
    $('#setting-module-bookmarks').checked = settings.modules.bookmarks;
    $('#setting-module-hitokoto').checked  = settings.modules.hitokoto;

    this._updateWallpaperUI();
    this._populateEngineSelect();
  }

  _populateEngineSelect() {
    const sel = $('#setting-search-engine');
    if (!sel) return;
    const eg = SearchModule.getAllEngines();
    const cv = sel.value;
    sel.innerHTML = '';
    for (const [k, e] of Object.entries(eg)) {
      const o = document.createElement('option'); o.value = k;
      o.textContent = e.name + (e.builtin ? '' : ' (自定义)');
      sel.appendChild(o);
    }
    if (eg[cv]) sel.value = cv;
    else if (cv) {
      sel.value = 'google';
      const settings = store.get('settings');
      settings.searchEngine = 'google';
      store.set('settings', { ...settings });
      SearchModule.updateEngineLabel();
      SearchModule.renderEngineDropdown();
      this._save();
    }
  }

  _updateWallpaperUI() {
    const settings = store.get('settings');
    const c = settings?.wallpaperSource === 'custom';
    const row = this.$('#custom-wallpaper-row');
    const reset = this.$('#btn-reset-wallpaper');
    if (row) row.hidden = !c;
    if (reset) reset.hidden = !store.get('customWallpaper');
  }

  _updateBmCount() { const el = this.$('#bookmark-count-hint'); if (el) el.textContent = `共 ${(store.get('bookmarks') || []).length} 个书签`; }

  /* ===== 保存设置（防抖）===== */

  _save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(async () => {
      const settings = store.get('settings');
      await Storage.set({ settings });
      store.set('_settingsDirty', Date.now());
      Theme.apply();
    }, 100);
  }

  /* ===== 引擎管理 ===== */

  _renderCustomEngineList() {
    const list = this.$('#custom-engine-list');
    if (!list) return;
    const settings = store.get('settings');
    list.innerHTML = '';
    if (!settings?.customSearchEngines?.length) {
      const li = document.createElement('li');
      li.style.cssText = 'font-size:12px;color:var(--text-tertiary);padding:4px 0';
      li.textContent = '暂无自定义引擎'; list.appendChild(li); return;
    }
    for (const ce of settings.customSearchEngines) {
      const li = document.createElement('li'); li.className = 'custom-engine-item';
      const ns = document.createElement('span'); ns.className = 'custom-engine-name'; ns.textContent = ce.name;
      const us = document.createElement('span'); us.className = 'custom-engine-url'; us.textContent = ce.url.replace('{query}', '…');
      const ac = document.createElement('span'); ac.className = 'custom-engine-actions';
      ac.innerHTML = '<button title="编辑"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn-custom-delete" title="删除"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
      ac.querySelector('button:first-child').addEventListener('click', () => this._openEngineModal(ce.id));
      ac.querySelector('.btn-custom-delete').addEventListener('click', () => this._deleteCustomEngine(ce.id));
      li.append(ns, us, ac); list.appendChild(li);
    }
  }

  _openEngineModal(id) {
    const settings = store.get('settings');
    this._editingEngineId = id;
    if (id) {
      const ce = settings.customSearchEngines.find(e => e.id === id);
      if (!ce) return;
      $('#engine-modal-title').textContent = '编辑搜索引擎';
      $('#engine-name').value = ce.name; $('#engine-url').value = ce.url;
    } else {
      $('#engine-modal-title').textContent = '添加搜索引擎';
      $('#engine-name').value = ''; $('#engine-url').value = '';
    }
    this.showModal(this.$('#engine-modal'), this.$('#engine-modal-overlay'));
    setTimeout(() => $('#engine-name')?.focus(), 100);
  }

  _closeEngineModal() {
    this.hideModal(this.$('#engine-modal'), this.$('#engine-modal-overlay'));
    this._editingEngineId = null;
  }

  async _saveEngineFromModal() {
    const name = $('#engine-name').value.trim(), url = $('#engine-url').value.trim();
    if (!name) { $('#engine-name').focus(); return; }
    if (!url) { $('#engine-url').focus(); return; }
    if (!url.includes('{query}') && !url.includes('%s')) { if (!confirm('URL 中未包含 {query} 占位符，搜索词将被追加到 URL 末尾。确定保存？')) return; }
    const settings = store.get('settings');
    if (this._editingEngineId) {
      const ce = settings.customSearchEngines.find(e => e.id === this._editingEngineId);
      if (ce) { ce.name = name; ce.url = url; }
    } else {
      settings.customSearchEngines.push({ id: genEngineId(), name, url });
    }
    store.set('settings', { ...settings });
    this._save();
    this._closeEngineModal();
    SearchModule.renderEngineDropdown();
    this._renderCustomEngineList();
    this._populateEngineSelect();
  }

  _deleteCustomEngine(id) {
    const settings = store.get('settings');
    settings.customSearchEngines = settings.customSearchEngines.filter(e => e.id !== id);
    if (settings.searchEngine === id) settings.searchEngine = 'google';
    store.set('settings', { ...settings });
    this._save();
    SearchModule.renderEngineDropdown();
    this._renderCustomEngineList();
    this._populateEngineSelect();
    SearchModule.updateEngineLabel();
  }

  /* ===== 绑定 ===== */

  _bindPanel() {
    this.on(this.$('#settings-close'), 'click', () => this.close());
    this.on(this.$('#settings-overlay'), 'click', () => this.close());

    // 右键空白 → 设置
    this.on(document, 'contextmenu', (e) => {
      if (store.get('isEditMode') || Bookmarks.isReorderMode) return;
      if (e.target.closest('.bookmark-item')) return;
      if (e.target.closest('.module-handle')) return;
      e.preventDefault(); this.open();
    });
  }

  _bindForm() {
    const _upd = (fn) => { const s = store.get('settings'); fn(s); store.set('settings', { ...s }); this._save(); };

    this.on($('#setting-theme'), 'change', (e) => _upd(s => { s.theme = e.target.value; }));
    this.on($('#setting-search-style'), 'change', (e) => { SearchModule.setStyle(e.target.value); });
    this.on($('#setting-show-bookmark-names'), 'change', (e) => _upd(s => { s.showBookmarkNames = e.target.checked; }));
    this.on($('#setting-wallpaper-source'), 'change', (e) => {
      _upd(s => { s.wallpaperSource = e.target.value; });
      this._updateWallpaperUI();
      if (e.target.value === 'bing') Wallpaper.apply();
    });

    this.on(this.$('#btn-upload-wallpaper'), 'click', () => this.$('#wallpaper-file-input')?.click());
    this.on(this.$('#wallpaper-file-input'), 'change', async function () {
      const f = this.files[0]; if (!f) return;
      const compressed = await compressImage(f, 1920);
      store.set('customWallpaper', compressed);
      _upd(s => { s.wallpaperSource = 'custom'; });
      $('#setting-wallpaper-source').value = 'custom';
      Wallpaper._set(compressed);
      await Storage.setLocal({ customWallpaper: compressed });
    });
    this.on(this.$('#btn-reset-wallpaper'), 'click', async () => {
      store.set('customWallpaper', null);
      _upd(s => { s.wallpaperSource = 'bing'; });
      $('#setting-wallpaper-source').value = 'bing';
      this._updateWallpaperUI();
      Wallpaper.apply();
      await Storage.setLocal({ customWallpaper: null });
    });

    this.on($('#setting-search-engine'), 'change', (e) => {
      _upd(s => { s.searchEngine = e.target.value; });
      SearchModule.updateEngineLabel(); SearchModule.renderEngineDropdown();
    });

    ['clock', 'search', 'bookmarks', 'hitokoto'].forEach(mod => {
      this.on($(`#setting-module-${mod}`), 'change', (e) => _upd(s => { s.modules[mod] = e.target.checked; }));
    });
  }

  _bindSubPanels() {
    this.on(this.$('#btn-manage-bookmarks'), 'click', () => this.openSub('bookmarks'));
    this.on(this.$('#btn-back-bookmarks'), 'click', () => this.closeSub('bookmarks'));
    this.on(this.$('#btn-manage-engines'), 'click', () => this.openSub('engines'));
    this.on(this.$('#btn-back-engines'), 'click', () => this.closeSub('engines'));
    this.on(this.$('#btn-add-bookmark'), 'click', () => Bookmarks.openModal(null));
    this.on(this.$('#btn-add-engine'), 'click', () => this._openEngineModal(null));

    // 引擎弹窗
    this.on(this.$('#btn-cancel-engine'), 'click', () => this._closeEngineModal());
    this.on(this.$('#engine-modal-close'), 'click', () => this._closeEngineModal());
    this.on(this.$('#engine-modal-overlay'), 'click', () => this._closeEngineModal());
    this.on(this.$('#btn-save-engine'), 'click', () => this._saveEngineFromModal());
    this.on($('#engine-name'), 'keydown', (e) => { if (e.key === 'Enter') $('#engine-url')?.focus(); });
    this.on($('#engine-url'), 'keydown', (e) => { if (e.key === 'Enter') this._saveEngineFromModal(); });

    this.on(this.$('#btn-edit-layout'), 'click', () => EditMode.enter());
    this.on(this.$('#btn-layout-save'), 'click', () => EditMode.exit(true));
    this.on(this.$('#btn-layout-cancel'), 'click', () => EditMode.exit(false));
    this.on(this.$('#btn-layout-reset'), 'click', () => EditMode.resetPositions());
  }

  _bindAccount() {
    this.on(this.$('#btn-manage-account'), 'click', () => this.openSub('account'));
    this.on(this.$('#btn-back-account'), 'click', () => this.closeSub('account'));
    this.on(this.$('#btn-do-register'), 'click', async () => {
      const username = $('#auth-username').value.trim();
      const password = $('#auth-password').value;
      const inviteCode = $('#auth-invite-code').value.trim();
      const errEl = $('#auth-error'); errEl.textContent = '';
      if (!username || !password) { errEl.textContent = '请输入用户名和密码'; return; }
      if (!inviteCode) { errEl.textContent = '请输入邀请码'; return; }
      try { await CloudSync.register(username, password, inviteCode); this.closeSub('account'); CloudSync.pull(); }
      catch (e) { errEl.textContent = e.message; }
    });
    this.on(this.$('#btn-do-login'), 'click', async () => {
      const username = $('#auth-username').value.trim();
      const password = $('#auth-password').value;
      const errEl = $('#auth-error'); errEl.textContent = '';
      if (!username || !password) { errEl.textContent = '请输入用户名和密码'; return; }
      try { await CloudSync.login(username, password); this.closeSub('account'); CloudSync.pull(); }
      catch (e) { errEl.textContent = e.message; }
    });
    this.on(this.$('#btn-logout'), 'click', () => CloudSync.logout());
    this.on(this.$('#btn-sync-now'), 'click', () => { CloudSync.pull(); CloudSync.push(); });
  }

  _bindAdmin() {
    this.on(this.$('#btn-gen-invite'), 'click', async () => {
      try { await CloudSync.generateInviteCode(); CloudSync.loadInviteCodes(); }
      catch (e) { const el = $('#invite-gen-result'); if (el) { el.textContent = '生成失败：' + e.message; el.style.color = 'var(--danger)'; } }
    });
    this.on(this.$('#btn-manage-admin'), 'click', () => { this.openSub('admin'); CloudSync.loadInviteCodes(); });
    this.on(this.$('#btn-back-admin'), 'click', () => this.closeSub('admin'));
  }

  _bindDataIO() {
    this.on(this.$('#btn-export'), 'click', async () => {
      try {
        const d = await Storage.exportAll();
        const b = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
        const u = URL.createObjectURL(b);
        const a = document.createElement('a'); a.href = u; a.download = `pure-start-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
      } catch (e) { alert('导出失败：' + e.message); }
    });
    this.on(this.$('#btn-import'), 'click', () => this.$('#import-file-input')?.click());
    this.on(this.$('#import-file-input'), 'change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const t = await new Promise((r, rej) => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.onerror = () => rej(new Error('读取失败')); rd.readAsText(f); });
        const d = JSON.parse(t);
        if (!d.version || !d.settings) throw new Error('无效配置文件');
        if (!confirm('导入将覆盖当前所有设置、书签和壁纸，确定继续？')) return;
        await Storage.importAll(d);
        await loadAllFromStorage();
        Theme.apply(); EditMode._applyPositions(); Wallpaper.apply();
        Bookmarks.render(); Bookmarks.renderManageList();
        SearchModule.applyStyle(store.get('settings')?.searchStyle);
        SearchModule.updateEngineLabel(); SearchModule.renderEngineDropdown();
        alert('导入成功！');
      } catch (e2) { alert('导入失败：' + e2.message); }
      finally { e.target.value = ''; }
    });
  }

  _bindGlobalKeys() {
    this.on(document, 'keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (EditMode.isActive) { EditMode.exit(false); return; }
      if (Bookmarks.isReorderMode) { Bookmarks.exitReorder(); return; }
      if (this.isOpen()) this.close();
      else if ($('#bookmark-modal')?.classList.contains('visible')) Bookmarks.closeModal();
      else if ($('#engine-modal')?.classList.contains('visible')) this._closeEngineModal();
    });

    this.on(document, 'click', (e) => {
      if (Bookmarks.isReorderMode && !e.target.closest('.bookmark-item') && !e.target.closest('.bm-add-btn') && !e.target.closest('.context-menu')) {
        Bookmarks.exitReorder();
      }
    });
  }

}

export const Settings = new SettingsModule();
