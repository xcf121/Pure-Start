/**
 * EditMode — 编辑模式（模块自由拖放布局）
 */
'use strict';

import { Component } from '../core/component.js';
import { store }   from '../core/store.js';
import { Storage } from '../core/storage.js';
import { SNAP_THRESHOLD, SNAP_MAGNET, DEFAULT_POSITIONS } from '../core/constants.js';
import { $$ } from '../core/utils.js';

class EditModeModule extends Component {
  constructor() {
    super('editmode');
    this._dragState = null;
    this._positionsSnapshot = null;
  }

  get isActive() { return !!store.get('isEditMode'); }

  init() {
    this._applyPositions();
    store.subscribe('settings', () => this._applyPositions());
    store.subscribe('isEditMode', (v) => {
      const canvas = this.$('#layout-canvas');
      if (canvas) canvas.classList.toggle('edit-mode', v);
    });
  }

  enter() {
    const settings = store.get('settings');
    this._positionsSnapshot = JSON.parse(JSON.stringify(settings.positions));
    store.set('isEditMode', true);
    const canvas = this.$('#layout-canvas');
    if (canvas) canvas.classList.add('edit-mode');
    const blur = this.$('#edit-blur');
    if (blur) { blur.removeAttribute('hidden'); blur.classList.add('visible'); }
    const toolbar = this.$('#layout-toolbar');
    if (toolbar) toolbar.removeAttribute('hidden');
    this._bindDrag();
  }

  exit(save = false) {
    if (!save && this._positionsSnapshot) {
      const settings = store.get('settings');
      settings.positions = this._positionsSnapshot;
      store.set('settings', { ...settings });
      this._applyPositions();
    }
    if (save) {
      const settings = store.get('settings');
      Storage.set({ settings });
      store.set('settings', { ...settings });
    }
    this._positionsSnapshot = null;
    store.set('isEditMode', false);
    const canvas = this.$('#layout-canvas');
    if (canvas) canvas.classList.remove('edit-mode');
    const blur = this.$('#edit-blur');
    if (blur) { blur.classList.remove('visible'); setTimeout(() => blur.setAttribute('hidden', ''), 300); }
    const toolbar = this.$('#layout-toolbar');
    if (toolbar) toolbar.setAttribute('hidden', '');
    const snap = this.$('#snap-line');
    if (snap) snap.classList.remove('active');
    this._unbindDrag();
  }

  resetPositions() {
    const settings = store.get('settings');
    settings.positions = { ...DEFAULT_POSITIONS };
    store.set('settings', { ...settings });
    this._applyPositions();
    Storage.set({ settings });
  }

  _applyPositions() {
    const settings = store.get('settings');
    if (!settings?.positions) return;
    for (const [m, pos] of Object.entries(settings.positions)) {
      const el = document.querySelector(`#module-${m}`);
      if (el) { el.style.left = `${pos.x}%`; el.style.top = `${pos.y}%`; }
    }
  }

  _bindDrag() {
    $$('.free-module').forEach(mod => {
      const handle = mod.querySelector('.module-handle');
      const startFn = (e) => {
        if (!this.isActive) return;
        if (e.target.closest('input') || e.target.closest('button') || e.target.closest('.bookmark-item')) return;
        e.preventDefault();
        const cx = e.touches ? e.touches[0].clientX : e.clientX;
        const cy = e.touches ? e.touches[0].clientY : e.clientY;
        const canvasRect = this.$('#layout-canvas').getBoundingClientRect();
        this._dragState = {
          module: mod, moduleName: mod.dataset.module,
          startMouseX: cx, startMouseY: cy,
          startLeft: parseFloat(mod.style.left) || 50,
          startTop: parseFloat(mod.style.top) || 10,
          canvasW: canvasRect.width, canvasH: canvasRect.height,
        };
        mod.classList.add('dragging');
        document.body.style.cursor = 'grabbing';
      };
      if (handle) { handle.addEventListener('mousedown', startFn); handle.addEventListener('touchstart', startFn, { passive: false }); }
      mod.addEventListener('mousedown', startFn);
      mod.addEventListener('touchstart', startFn, { passive: false });
    });

    this._onDragMove = this._onDragMove.bind(this);
    this._onDragEnd  = this._onDragEnd.bind(this);
    document.addEventListener('mousemove', this._onDragMove);
    document.addEventListener('mouseup', this._onDragEnd);
    document.addEventListener('touchmove', this._onDragMove, { passive: false });
    document.addEventListener('touchend', this._onDragEnd);
  }

  _unbindDrag() {
    document.removeEventListener('mousemove', this._onDragMove);
    document.removeEventListener('mouseup', this._onDragEnd);
    document.removeEventListener('touchmove', this._onDragMove);
    document.removeEventListener('touchend', this._onDragEnd);
  }

  _onDragMove(e) {
    if (!this._dragState) return;
    e.preventDefault();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const ds = this._dragState;

    let newX = ds.startLeft + ((cx - ds.startMouseX) / ds.canvasW) * 100;
    let newY = ds.startTop  + ((cy - ds.startMouseY) / ds.canvasH) * 100;

    // 中心吸附
    const dist = Math.abs(newX - 50);
    const snap = this.$('#snap-line');
    if (dist < SNAP_THRESHOLD) {
      const pull = dist / SNAP_THRESHOLD;
      newX = 50 - (50 - newX) * (1 - pull * 0.7);
      if (snap) snap.classList.add('active');
    } else {
      if (snap) snap.classList.remove('active');
    }

    newX = Math.max(2, Math.min(98, newX));
    newY = Math.max(2, Math.min(95, newY));

    ds.module.style.left = `${newX}%`;
    ds.module.style.top  = `${newY}%`;

    const settings = store.get('settings');
    if (settings.positions[ds.moduleName]) {
      settings.positions[ds.moduleName].x = newX;
      settings.positions[ds.moduleName].y = newY;
    }
  }

  _onDragEnd() {
    if (!this._dragState) return;
    const ds = this._dragState;
    const settings = store.get('settings');

    if (settings.positions[ds.moduleName]) {
      const pos = settings.positions[ds.moduleName];
      if (Math.abs(pos.x - 50) < SNAP_MAGNET) { pos.x = 50; ds.module.style.left = '50%'; }
    }

    ds.module.classList.remove('dragging');
    const snap = this.$('#snap-line');
    if (snap) snap.classList.remove('active');
    document.body.style.cursor = '';
    this._dragState = null;
  }
}

export const EditMode = new EditModeModule();
