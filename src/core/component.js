/**
 * Component — 组件基类
 * 提供统一的生命周期、DOM 查询快捷方法和事件管理
 */
'use strict';

export class Component {
  /** @param {string} name 模块名（用于日志） */
  constructor(name) {
    this.name = name;
    this._cleanups = [];   // 清理回调列表
  }

  /** 子类重写：初始化 */
  init() {}

  /** 子类重写：销毁 */
  destroy() {
    for (const fn of this._cleanups) fn();
    this._cleanups.length = 0;
  }

  /** 注册清理回调 */
  onCleanup(fn) { this._cleanups.push(fn); }

  /** 绑定事件并自动注册清理 */
  on(el, event, handler, opts) {
    el.addEventListener(event, handler, opts);
    this._cleanups.push(() => el.removeEventListener(event, handler, opts));
  }

  /** querySelector 快捷 */
  $(sel) { return document.querySelector(sel); }

  /** querySelectorAll → Array 快捷 */
  $$(sel) { return [...document.querySelectorAll(sel)]; }

  /** 显示 modal */
  showModal(m, o) { m.classList.add('visible'); o.classList.add('visible'); m.removeAttribute('hidden'); o.removeAttribute('hidden'); }

  /** 隐藏 modal */
  hideModal(m, o) { m.classList.remove('visible'); o.classList.remove('visible'); setTimeout(() => { m.setAttribute('hidden', ''); o.setAttribute('hidden', ''); }, 300); }

  /** 创建元素 */
  el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') e.className = v;
      else if (k === 'textContent') e.textContent = v;
      else if (k === 'innerHTML') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else e.setAttribute(k, v);
    }
    for (const c of children) {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    }
    return e;
  }
}
