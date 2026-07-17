/**
 * Theme — 主题管理
 * 响应 settings.theme 变化，自动切换 data-theme
 */
'use strict';

import { store } from '../core/store.js';

const mq = window.matchMedia('(prefers-color-scheme: dark)');

function resolve(theme) {
  if (theme === 'system') return mq.matches ? 'dark' : 'light';
  return theme;
}

function apply() {
  const theme = store.get('settings')?.theme || 'light';
  document.documentElement.setAttribute('data-theme', resolve(theme));
}

export const Theme = {
  init() {
    apply();
    store.subscribe('settings', apply);
    mq.addEventListener('change', () => {
      if (store.get('settings')?.theme === 'system') apply();
    });
  },
  apply,
};
