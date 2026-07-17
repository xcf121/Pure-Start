/**
 * Storage — 持久化存储抽象层
 * 优先使用 chrome.storage（扩展环境），回退到 localStorage
 * 数据 key 和结构完全向后兼容
 */
'use strict';

const _api = (typeof chrome !== 'undefined' && chrome.storage) ? chrome.storage : null;

export const Storage = {

  async get(keys) {
    if (_api) return new Promise(r => _api.sync.get(keys, r));
    const o = {};
    for (const k of (Array.isArray(keys) ? keys : [keys])) {
      try { o[k] = JSON.parse(localStorage.getItem(`ps_${k}`)); }
      catch { o[k] = undefined; }
    }
    return o;
  },

  async set(obj) {
    if (_api) return new Promise(r => _api.sync.set(obj, r));
    for (const [k, v] of Object.entries(obj)) {
      try { localStorage.setItem(`ps_${k}`, JSON.stringify(v)); } catch {}
    }
  },

  async getLocal(keys) {
    if (_api) return new Promise(r => _api.local.get(keys, r));
    const o = {};
    for (const k of (Array.isArray(keys) ? keys : [keys])) {
      try { o[k] = JSON.parse(localStorage.getItem(`psl_${k}`)); }
      catch { o[k] = undefined; }
    }
    return o;
  },

  async setLocal(obj) {
    if (_api) return new Promise(r => _api.local.set(obj, r));
    for (const [k, v] of Object.entries(obj)) {
      try { localStorage.setItem(`psl_${k}`, JSON.stringify(v)); } catch {}
    }
  },

  async exportAll() {
    const [s, l] = await Promise.all([
      this.get(['settings']),
      this.getLocal(['bookmarks', 'customWallpaper']),
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: s.settings || {},
      bookmarks: l.bookmarks || [],
      customWallpaper: l.customWallpaper || null,
    };
  },

  async importAll(d) {
    if (!d || typeof d !== 'object') throw new Error('无效配置');
    if (d.settings) await this.set({ settings: d.settings });
    const l = {};
    if (d.bookmarks) l.bookmarks = d.bookmarks;
    l.customWallpaper = d.customWallpaper || null;
    await this.setLocal(l);
  },
};
