/**
 * Bookmarks — 书签模块
 * 渲染、CRUD、排序、右键菜单、管理列表、书签弹窗
 */
'use strict';

import { Component } from '../core/component.js';
import { store }   from '../core/store.js';
import { Storage } from '../core/storage.js';
import { API_BASE } from '../core/constants.js';
import { genId, getDomain, getFaviconUrl, compressImage, $, $$ } from '../core/utils.js';

class BookmarksModule extends Component {
  constructor() {
    super('bookmarks');
    this._isReorderMode = false;
    this._bmDragId = null;
    this._editingId = null;
    this._modalTempIcon = null;
    this._modalBgColor = 'transparent';
  }

  /* ===== 公开 API ===== */

  get list() { return store.get('bookmarks') || []; }
  set list(v) { store.set('bookmarks', v); }

  init() {
    this.render();
    this._bindModal();

    // 监听书签数据变化 → 重新渲染
    store.subscribe('bookmarks', () => {
      this.render();
      this.renderManageList();
      this._updateCount();
    });

    // 监听设置变化 → 名称可见性
    store.subscribe('settings', (s) => {
      const inner = this.$('#bookmarks-inner');
      if (inner) inner.classList.toggle('hide-names', !s?.showBookmarkNames);
      const el = this.$('#module-bookmarks');
      if (el) el.hidden = !s?.modules?.bookmarks;
    });

    // 自动获取缺失图标
    for (const bm of this.list) this._autoFetchFavicon(bm);
  }

  render() {
    const inner = this.$('#bookmarks-inner');
    if (!inner) return;
    inner.innerHTML = '';
    const bookmarks = this.list;
    const isEdit = store.get('isEditMode');

    bookmarks.forEach((bm, idx) => {
      const el = document.createElement('div');
      el.className = 'bookmark-item'; el.dataset.bmId = bm.id;
      el.draggable = this._isReorderMode;
      el.style.animationDelay = `${idx * 0.03}s`;

      const iw = document.createElement('div'); iw.className = 'bookmark-icon-wrap';
      if (bm.bgColor && bm.bgColor !== 'transparent') iw.style.background = bm.bgColor;
      const iconUrl = getFaviconUrl(bm);
      if (iconUrl) {
        const img = document.createElement('img'); img.src = iconUrl; img.alt = ''; img.loading = 'lazy';
        img.onerror = () => { img.hidden = true; const fb = this._fallbackIcon(bm.name); iw.appendChild(fb); };
        iw.appendChild(img);
      } else {
        iw.appendChild(this._fallbackIcon(bm.name));
        this._autoFetchFavicon(bm);
      }

      const nm = document.createElement('span'); nm.className = 'bookmark-name'; nm.textContent = bm.name;
      const db = document.createElement('button'); db.className = 'bm-delete-btn'; db.innerHTML = '&times;'; db.title = '删除';
      db.addEventListener('click', (e) => { e.stopPropagation(); this.delete(bm.id); });

      el.append(iw, nm, db);

      // 点击
      el.addEventListener('click', () => {
        if (this._isReorderMode) this.openModal(bm.id);
        else if (bm.url) window.open(bm.url, '_blank');
      });

      // 长按 → 排序
      let press = null;
      const clearPress = () => { if (press) { clearTimeout(press); press = null; } };
      el.addEventListener('mousedown', () => { if (!this._isReorderMode && !isEdit) press = setTimeout(() => this.enterReorder(), 500); });
      el.addEventListener('mouseup', clearPress); el.addEventListener('mouseleave', clearPress);
      el.addEventListener('touchstart', () => { if (!this._isReorderMode && !isEdit) press = setTimeout(() => this.enterReorder(), 500); }, { passive: true });
      el.addEventListener('touchend', clearPress); el.addEventListener('touchmove', clearPress); el.addEventListener('touchcancel', clearPress);

      // 排序拖拽
      el.addEventListener('dragstart', (e) => this._bmDragStart(e, bm.id));
      el.addEventListener('dragover', (e) => this._bmDragOver(e));
      el.addEventListener('dragleave', (e) => e.currentTarget.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => this._bmDrop(e, bm.id));
      el.addEventListener('dragend', (e) => this._bmDragEnd(e));

      // 右键
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this._showMenu(e.clientX, e.clientY, bm.id); });

      inner.appendChild(el);
    });

    if (this._isReorderMode) {
      const addBtn = document.createElement('div');
      addBtn.className = 'bm-add-btn visible';
      addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>添加</span>';
      addBtn.addEventListener('click', () => this.openModal(null));
      inner.appendChild(addBtn);
    }

    inner.classList.toggle('reorder-mode', this._isReorderMode);
    const settings = store.get('settings');
    inner.classList.toggle('hide-names', !settings?.showBookmarkNames);
  }

  /* ===== CRUD ===== */

  async save() {
    await Storage.setLocal({ bookmarks: this.list });
    this._updateCount();
    store.set('_bookmarksDirty', Date.now()); // 触发同步
  }

  delete(id) {
    this.list = this.list.filter(b => b.id !== id);
    this.save();
  }

  /* ===== 排序模式 ===== */

  enterReorder() {
    this._isReorderMode = true;
    this.render();
    const toast = this.$('#reorder-toast');
    if (toast) { toast.removeAttribute('hidden'); toast.style.opacity = '1'; }
    setTimeout(() => { if (toast?.style.opacity === '1') toast.style.opacity = '0'; }, 3000);
  }

  exitReorder() {
    this._isReorderMode = false;
    this.render();
    const toast = this.$('#reorder-toast');
    if (toast) { toast.setAttribute('hidden', ''); toast.style.opacity = '0'; }
  }

  get isReorderMode() { return this._isReorderMode; }

  /* ===== 书签弹窗 ===== */

  openModal(id) {
    this._editingId = id;
    this._modalTempIcon = null;
    if (id) {
      const bm = this.list.find(b => b.id === id);
      if (!bm) return;
      $('#bookmark-modal-title').textContent = '编辑书签';
      $('#bookmark-name').value = bm.name;
      $('#bookmark-url').value = bm.url;
      this._modalTempIcon = bm.icon;
      this._modalBgColor = bm.bgColor || 'transparent';
      this._updateIconPreview(bm);
    } else {
      $('#bookmark-modal-title').textContent = '添加书签';
      $('#bookmark-name').value = '';
      $('#bookmark-url').value = '';
      this._modalTempIcon = null;
      this._modalBgColor = 'transparent';
      this._updateIconPreview(null);
    }
    $('#btn-clear-icon').hidden = !this._modalTempIcon;
    this._updateBgColorUI();
    this.showModal($('#bookmark-modal'), this.$('#modal-overlay'));
    setTimeout(() => $('#bookmark-name')?.focus(), 100);
  }

  closeModal() {
    this.hideModal($('#bookmark-modal'), this.$('#modal-overlay'));
    this._editingId = null;
    this._modalTempIcon = null;
  }

  renderManageList() {
    const list = this.$('#bookmark-manage-list');
    if (!list) return;
    list.innerHTML = '';
    this.list.forEach(bm => {
      const li = document.createElement('li'); li.className = 'bookmark-manage-item'; li.draggable = true; li.dataset.id = bm.id;
      const img = document.createElement('img'); img.className = 'bookmark-manage-icon'; img.src = getFaviconUrl(bm); img.alt = '';
      img.onerror = () => { img.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect fill="%23ccc" width="28" height="28" rx="6"/></svg>'); };
      const ns = document.createElement('span'); ns.className = 'bookmark-manage-name'; ns.textContent = bm.name;
      const us = document.createElement('span'); us.className = 'bookmark-manage-url'; us.textContent = getDomain(bm.url);
      const ac = document.createElement('span'); ac.className = 'bookmark-manage-actions';
      ac.innerHTML = '<button class="btn-manage-edit" title="编辑"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn-manage-delete" title="删除"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
      ac.querySelector('.btn-manage-edit').addEventListener('click', (e) => { e.stopPropagation(); this.openModal(bm.id); });
      ac.querySelector('.btn-manage-delete').addEventListener('click', (e) => { e.stopPropagation(); this.delete(bm.id); });
      li.append(img, ns, us, ac);
      // 管理列表拖拽排序
      li.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', bm.id); li.classList.add('dragging'); });
      li.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; li.classList.add('drag-over'); });
      li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
      li.addEventListener('drop', (e) => {
        e.preventDefault(); li.classList.remove('drag-over');
        const fid = e.dataTransfer.getData('text/plain');
        if (fid && fid !== bm.id) this._move(fid, bm.id);
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      list.appendChild(li);
    });
  }

  /* ===== 内部方法 ===== */

  _fallbackIcon(name) {
    const fb = document.createElement('span'); fb.className = 'bookmark-icon-fallback';
    fb.textContent = name.charAt(0).toUpperCase(); return fb;
  }

  async _autoFetchFavicon(bm) {
    if (bm.icon || !bm.url) return;
    try {
      const domain = getDomain(bm.url);
      const resp = await fetch(`${API_BASE}/favicon/${domain}`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.dataUrl) {
        bm.icon = data.dataUrl;
        this.save();
        const wrap = document.querySelector(`[data-bm-id="${bm.id}"] .bookmark-icon-wrap`);
        if (wrap) {
          const fb = wrap.querySelector('.bookmark-icon-fallback'); if (fb) fb.remove();
          let img = wrap.querySelector('img');
          if (!img) { img = document.createElement('img'); img.alt = ''; wrap.appendChild(img); }
          img.src = data.dataUrl; img.hidden = false;
        }
      }
    } catch {}
  }

  _move(fromId, toId) {
    const list = [...this.list];
    const fi = list.findIndex(b => b.id === fromId);
    const ti = list.findIndex(b => b.id === toId);
    if (fi === -1 || ti === -1) return;
    const [item] = list.splice(fi, 1);
    list.splice(ti, 0, item);
    this.list = list;
    this.save();
  }

  _bmDragStart(e, id) {
    if (!this._isReorderMode) return;
    this._bmDragId = id;
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id);
    e.currentTarget.classList.add('dragging');
    try { e.dataTransfer.setDragImage(new Image(), 0, 0); } catch {}
  }
  _bmDragOver(e) { if (!this._isReorderMode) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('drag-over'); }
  _bmDrop(e, tid) { if (!this._isReorderMode || !this._bmDragId || this._bmDragId === tid) return; e.preventDefault(); e.currentTarget.classList.remove('drag-over'); this._move(this._bmDragId, tid); }
  _bmDragEnd(e) { e.currentTarget.classList.remove('dragging'); this._bmDragId = null; this.$$('#bookmarks-inner .drag-over').forEach(el => el.classList.remove('drag-over')); }

  _showMenu(x, y, id) {
    const ex = document.querySelector('.context-menu'); if (ex) ex.remove();
    const bm = this.list.find(b => b.id === id); if (!bm) return;
    const m = document.createElement('div'); m.className = 'context-menu'; m.style.left = `${x}px`; m.style.top = `${y}px`;
    for (const item of [
      { t: '打开', a: () => { if (bm.url) window.open(bm.url, '_blank'); } },
      { t: '编辑', a: () => this.openModal(id) },
      { t: this._isReorderMode ? '退出排序' : '调整排序', a: () => { this._isReorderMode ? this.exitReorder() : this.enterReorder(); } },
      { t: '删除', a: () => this.delete(id) },
    ]) {
      const btn = document.createElement('button'); btn.textContent = item.t;
      btn.addEventListener('click', () => { m.remove(); item.a(); }); m.appendChild(btn);
    }
    document.body.appendChild(m);
    const closer = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', closer); } };
    setTimeout(() => document.addEventListener('click', closer), 0);
  }

  _updateCount() { const el = this.$('#bookmark-count-hint'); if (el) el.textContent = `共 ${this.list.length} 个书签`; }

  _updateIconPreview(bm) {
    if (this._modalTempIcon) { $('#modal-icon-img').src = this._modalTempIcon; $('#modal-icon-img').hidden = false; $('#modal-icon-placeholder').hidden = true; }
    else if (bm?.url) { $('#modal-icon-img').src = getFaviconUrl(bm); $('#modal-icon-img').hidden = false; $('#modal-icon-placeholder').hidden = true; }
    else { $('#modal-icon-img').hidden = true; $('#modal-icon-placeholder').hidden = false; }
  }

  _updateBgColorUI() {
    $$('#icon-bg-options .icon-bg-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === this._modalBgColor));
    if (!['transparent','#ffffff','#1d1d1f','#f5f5f7','#0071e3','#ff3b30','#34c759'].includes(this._modalBgColor)) {
      const custom = $('.icon-bg-custom');
      if (custom) { custom.style.background = this._modalBgColor; custom.classList.add('active'); }
    }
  }

  _bindModal() {
    this.on($('#btn-cancel-bookmark'), 'click', () => this.closeModal());
    this.on($('#modal-close'), 'click', () => this.closeModal());
    this.on(this.$('#modal-overlay'), 'click', () => this.closeModal());
    this.on($('#btn-save-bookmark'), 'click', () => this._saveFromModal());
    this.on($('#bookmark-url'), 'input', () => { if (!this._modalTempIcon) this._updateIconPreview({ url: $('#bookmark-url').value.trim(), icon: null }); });
    this.on($('#btn-upload-icon'), 'click', () => $('#icon-file-input')?.click());
    this.on($('#btn-search-icon-online'), 'click', () => window.open('https://www.iconfont.cn/', '_blank'));
    this.on($('#icon-file-input'), 'change', async function () {
      const f = this.files[0]; if (!f) return;
      Bookmarks._modalTempIcon = await compressImage(f, 128, Bookmarks._modalBgColor);
      Bookmarks._updateIconPreview(null); $('#btn-clear-icon').hidden = false;
    });
    this.on($('#btn-clear-icon'), 'click', () => {
      this._modalTempIcon = null; this._updateIconPreview({ url: $('#bookmark-url').value.trim(), icon: null }); $('#btn-clear-icon').hidden = true;
    });
    $$('#icon-bg-options .icon-bg-swatch').forEach(s => {
      s.addEventListener('click', () => { if (s.dataset.color) { this._modalBgColor = s.dataset.color; this._updateBgColorUI(); } });
    });
    this.on($('#icon-bg-custom-color'), 'input', (e) => { this._modalBgColor = e.target.value; this._updateBgColorUI(); });
    this.on($('#bookmark-name'), 'keydown', (e) => { if (e.key === 'Enter') $('#bookmark-url')?.focus(); });
    this.on($('#bookmark-url'), 'keydown', (e) => { if (e.key === 'Enter') this._saveFromModal(); });
  }

  async _saveFromModal() {
    const name = $('#bookmark-name').value.trim(), raw = $('#bookmark-url').value.trim();
    if (!name) { $('#bookmark-name').focus(); return; }
    if (!raw) { $('#bookmark-url').focus(); return; }
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    if (this._editingId) {
      const bm = this.list.find(b => b.id === this._editingId);
      if (bm) { bm.name = name; bm.url = url; bm.icon = this._modalTempIcon || null; bm.bgColor = this._modalBgColor; }
      this.list = [...this.list]; // 触发订阅
    } else {
      this.list = [...this.list, { id: genId(), name, url, icon: this._modalTempIcon || null, bgColor: this._modalBgColor }];
    }
    this.save();
    this.closeModal();
  }
}

export const Bookmarks = new BookmarksModule();
