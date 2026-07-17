/**
 * Clock — 时钟模块
 */
'use strict';

import { Component } from '../core/component.js';
import { store }   from '../core/store.js';

const DAYS = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];

class ClockModule extends Component {
  constructor() { super('clock'); this._timer = null; }

  init() {
    this._update();
    this._startInterval();
    // 模块可见性
    store.subscribe('settings', (s) => {
      const el = this.$('#module-clock');
      if (el) el.hidden = !s?.modules?.clock;
    });
  }

  _update() {
    const n = new Date();
    const timeEl = this.$('#time');
    const dateEl = this.$('#date');
    if (timeEl) timeEl.textContent = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
    if (dateEl) dateEl.textContent = `${n.getFullYear()}年${n.getMonth()+1}月${n.getDate()}日 ${DAYS[n.getDay()]}`;
  }

  _startInterval() {
    if (this._timer) return;
    setTimeout(() => {
      this._update();
      this._timer = setInterval(() => this._update(), 1000);
    }, 1000 - (Date.now() % 1000));
  }

  destroy() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    super.destroy();
  }
}

export const Clock = new ClockModule();
