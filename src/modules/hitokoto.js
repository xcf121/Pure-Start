/**
 * Hitokoto — 每日一言
 */
'use strict';

import { Component } from '../core/component.js';
import { store }   from '../core/store.js';

class HitokotoModule extends Component {
  constructor() { super('hitokoto'); this._timer = null; }

  init() {
    this.fetch();
    this._startInterval();
    store.subscribe('settings', (s) => {
      const el = this.$('#hitokoto-fixed');
      if (el) el.hidden = !s?.modules?.hitokoto;
    });
  }

  async fetch() {
    try {
      const r = await fetch('https://v1.hitokoto.cn/');
      const d = await r.json();
      if (!d?.hitokoto) return;
      const textEl = this.$('#hitokoto-text');
      const fromEl = this.$('#hitokoto-from');
      if (!textEl) return;
      textEl.classList.add('fading');
      setTimeout(() => {
        textEl.textContent = d.hitokoto;
        if (fromEl) fromEl.textContent = d.from ? `—— ${d.from}` : '';
        textEl.classList.remove('fading');
      }, 300);
    } catch {}
  }

  _startInterval() {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.fetch(), 30_000);
  }

  destroy() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    super.destroy();
  }
}

export const Hitokoto = new HitokotoModule();
