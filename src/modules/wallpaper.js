/**
 * Wallpaper — 壁纸管理
 * Bing 每日一图 / 自定义上传
 */
'use strict';

import { Component } from '../core/component.js';
import { store }   from '../core/store.js';

class WallpaperModule extends Component {
  constructor() { super('wallpaper'); }

  init() {
    this.apply();
    // 仅当壁纸来源变化时重新加载
    let lastSource = store.get('settings')?.wallpaperSource;
    store.subscribe('settings', (s) => {
      if (s?.wallpaperSource && s.wallpaperSource !== lastSource) {
        lastSource = s.wallpaperSource;
        this.apply();
      }
    });
  }

  async apply() {
    const s = store.get('settings');
    const custom = store.get('customWallpaper');
    if (s?.wallpaperSource === 'custom' && custom) {
      this._set(custom);
    } else {
      await this._fetchBing();
    }
  }

  async _fetchBing() {
    try {
      const r = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1');
      const d = await r.json();
      if (d?.images?.length) this._set(`https://www.bing.com${d.images[0].url}`);
    } catch {}
  }

  _set(url) {
    const el = this.$('#wallpaper');
    if (!el) return;
    const img = new Image();
    img.onload  = () => { el.style.backgroundImage = `url(${url})`; el.classList.add('loaded'); };
    img.onerror = () => { el.classList.add('loaded'); };
    img.src = url;
  }
}

export const Wallpaper = new WallpaperModule();
