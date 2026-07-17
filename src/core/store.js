/**
 * Store — 轻量响应式状态管理
 *
 * 用法:
 *   import { store } from './store.js';
 *   store.set('theme', 'dark');
 *   store.subscribe('theme', (val) => { ... });
 *   store.get('theme');
 */
'use strict';

const _state = {};
const _listeners = new Map(); // key → Set<fn>

export const store = {

  /** 读取 */
  get(key) { return _state[key]; },

  /** 设置单个 key，触发订阅 */
  set(key, value) {
    const old = _state[key];
    _state[key] = value;
    if (old !== value) _notify(key, value, old);
  },

  /** 批量设置（不触发中间态） */
  merge(obj) {
    for (const [k, v] of Object.entries(obj)) {
      const old = _state[k];
      _state[k] = v;
      if (old !== v) _notify(k, v, old);
    }
  },

  /**
   * 订阅某个 key 的变化
   * @returns {Function} 取消订阅函数
   */
  subscribe(key, fn) {
    if (!_listeners.has(key)) _listeners.set(key, new Set());
    _listeners.get(key).add(fn);
    return () => _listeners.get(key)?.delete(fn);
  },

  /** 一次性监听 */
  once(key, fn) {
    const unsub = store.subscribe(key, (val, old) => { unsub(); fn(val, old); });
    return unsub;
  },
};

function _notify(key, value, old) {
  const set = _listeners.get(key);
  if (set) for (const fn of set) fn(value, old);
}
