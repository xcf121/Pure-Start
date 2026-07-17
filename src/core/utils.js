/**
 * Utils — 纯工具函数与共享逻辑
 */

import { Storage } from './storage.js';
import { store } from './store.js';
import { DEFAULT_SETTINGS, DEFAULT_BOOKMARKS, DEFAULT_POSITIONS } from './constants.js';

/**
 * 从 Storage 加载全部数据到 Store（初始加载和导入共用）
 */
export async function loadAllFromStorage() {
  const [sd, ld] = await Promise.all([
    Storage.get(['settings', 'authToken']),
    Storage.getLocal(['bookmarks', 'customWallpaper']),
  ]);

  let settings;
  if (sd.settings) {
    settings = { ...DEFAULT_SETTINGS, modules: { ...DEFAULT_SETTINGS.modules }, customSearchEngines: [], positions: { ...DEFAULT_POSITIONS }, ...sd.settings };
    settings.modules = { ...DEFAULT_SETTINGS.modules, ...(sd.settings.modules || {}) };
    if (!Array.isArray(settings.customSearchEngines)) settings.customSearchEngines = [];
    if (!settings.positions) settings.positions = { ...DEFAULT_POSITIONS };
    for (const m of ['clock', 'search', 'bookmarks']) { if (!settings.positions[m]) settings.positions[m] = { ...DEFAULT_POSITIONS[m] }; }
  } else {
    settings = { ...DEFAULT_SETTINGS, modules: { ...DEFAULT_SETTINGS.modules }, customSearchEngines: [], positions: { ...DEFAULT_POSITIONS } };
  }
  store.set('settings', settings);

  const bookmarks = ld.bookmarks?.length ? ld.bookmarks : [...DEFAULT_BOOKMARKS];
  store.set('bookmarks', bookmarks);
  if (!ld.bookmarks?.length) await Storage.setLocal({ bookmarks });

  store.set('customWallpaper', ld.customWallpaper || null);
  store.set('authToken', sd.authToken || null);
  store.set('isEditMode', false);
}

/** 生成书签 ID */
export function genId() { return 'bm_' + Math.random().toString(36).slice(2, 10); }

/** 生成引擎 ID */
export function genEngineId() { return 'ce_' + Math.random().toString(36).slice(2, 8); }

/** 提取域名 */
export function getDomain(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); }
  catch { return u; }
}

/** 获取书签图标 URL */
export function getFaviconUrl(bm) { return bm.icon || ''; }

/** $(selector) */
export const $ = (s) => document.querySelector(s);

/** $$(selector) → Array */
export const $$ = (s) => [...document.querySelectorAll(s)];

/**
 * 图片压缩
 * @param {File} file
 * @param {number} maxSize
 * @param {string} [bgColor]
 * @returns {Promise<string>} data URL
 */
export function compressImage(file, maxSize, bgColor) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          const ratio = Math.min(maxSize / w, maxSize / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (bgColor && bgColor !== 'transparent') {
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, w, h);
        } else {
          ctx.clearRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        if (bgColor && bgColor !== 'transparent') {
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } else {
          const imageData = ctx.getImageData(0, 0, w, h);
          const hasAlpha = imageData.data.some((_, i) => i % 4 === 3 && imageData.data[i] < 255);
          resolve(canvas.toDataURL(hasAlpha ? 'image/png' : 'image/jpeg', hasAlpha ? undefined : 0.85));
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
