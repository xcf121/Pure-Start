/* ================================================================
   SearchModule — 独立搜索框组件
   自包含：DOM 渲染、事件绑定、状态管理
   仅通过 init(opts) 参数与外部通信
   ================================================================ */
'use strict';

const SearchModule = (() => {
  /* ---------- 常量 ---------- */
  const STYLES = {
    frosted:   '毛玻璃',
    solid:     '纯净',
    ghost:     '幽灵',
    float:     '悬浮',
    neon:      '霓虹',
    'glass-dark': '深色玻璃',
  };

  const ENGINE_ICON_MAP = {
    google: 'icons/google.png',
    bing: 'icons/bing.png',
    duckduckgo: 'icons/duckduckgo.png',
  };

  const BUILTIN_ENGINES = {
    google:     { name: 'Google',     url: 'https://www.google.com/search?q=' },
    bing:       { name: 'Bing',       url: 'https://www.bing.com/search?q=' },
    duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  };

  /* ---------- 模块私有状态 ---------- */
  let _container = null;   // [data-module="search"] 容器
  let _storage   = null;   // 引用外部 Storage 对象
  let _bookmarksGetter = null; // () => bookmarks
  let _settingsGetter = null;  // () => settings（始终获取最新引用）
  function _s() { return _settingsGetter ? _settingsGetter() : null; }

  // DOM
  let _wrapper   = null;
  let _input     = null;
  let _clearBtn  = null;
  let _engineBtn = null;
  let _engineIcon = null;
  let _dropdown  = null;
  let _suggestBox = null;

  // 内部状态
  let _suggestIdx   = -1;
  let _suggestTimer = null;
  let _boundClick   = null;
  let _boundKeydown = null;
  let _boundVisChange = null;

  /* ================================================================
     公开 API
     ================================================================ */
  return {
    STYLES,

    /**
     * 初始化搜索模块
     * @param {Object} opts
     * @param {string} opts.container  - 容器 CSS 选择器
     * @param {Object} opts.settings   - 全局 settings 对象引用
     * @param {Object} opts.storage    - Storage 引用
     * @param {Function} opts.bookmarksGetter - 返回书签数组的函数
     */
    init(opts) {
      _container = document.querySelector(opts.container);
      if (!_container) return;
      _settingsGetter = opts.settingsGetter;
      _storage   = opts.storage;
      _bookmarksGetter = opts.bookmarksGetter;

      _render();
      _bindEvents();
      this.applyStyle(_s().searchStyle || 'frosted');
    },

    /** 切换样式并持久化 */
    setStyle(style) {
      const s = _s(); if (!s) return;
      s.searchStyle = style;
      this.applyStyle(style);
      if (_storage) _storage.set({ settings: s });
    },

    /** 应用样式到 DOM（不保存） */
    applyStyle(style) {
      if (_wrapper) _wrapper.setAttribute('data-style', style || 'frosted');
    },

    /** 获取所有搜索引擎（内置 + 自定义） */
    getAllEngines() {
      const s = _s();
      const e = {};
      for (const [k, v] of Object.entries(BUILTIN_ENGINES))
        e[k] = { ...v, builtin: true };
      if (s) for (const ce of (s.customSearchEngines || []))
        e[ce.id] = { name: ce.name, url: ce.url, builtin: false };
      return e;
    },

    /** 构建搜索 URL */
    buildSearchUrl(eng, q) {
      let u = eng.url;
      if (u.includes('{query}'))      u = u.replace('{query}', encodeURIComponent(q));
      else if (u.includes('%s'))      u = u.replace('%s', encodeURIComponent(q));
      else                            u += encodeURIComponent(q);
      return u;
    },

    /** 刷新引擎按钮图标（引擎变更后调用） */
    updateEngineLabel() {
      if (!_engineIcon) return;
      const s = _s();
      if (!s) return;
      const src = ENGINE_ICON_MAP[s.searchEngine];
      _engineIcon.src = src || 'icons/google.png';
      _engineIcon.alt = s.searchEngine;
    },

    /** 刷新引擎下拉列表 */
    renderEngineDropdown() {
      if (!_dropdown) return;
      const s = _s();
      if (!s) return;
      const eg = this.getAllEngines();
      _dropdown.innerHTML = '';
      for (const [k, e] of Object.entries(eg)) {
        const b = document.createElement('button');
        b.className = 'sm-engine-option' + (k === s.searchEngine ? ' active' : '');
        b.dataset.engine = k;
        const iconSrc = ENGINE_ICON_MAP[k];
        const iconHtml = iconSrc
          ? `<img src="${iconSrc}" width="20" height="20" style="border-radius:4px;flex-shrink:0">`
          : `<span class="sm-engine-opt-icon" style="background:var(--text-tertiary)">${e.name.charAt(0).toUpperCase()}</span>`;
        b.innerHTML = `${iconHtml} <span>${e.name}</span>`;
        _dropdown.appendChild(b);
      }
    },

    /** 获取当前搜索输入框 DOM（供外部 focus 等） */
    getInput() { return _input; },

    /** 清理（目前不需要，预留） */
    destroy() {
      if (_boundClick)    document.removeEventListener('click', _boundClick);
      if (_boundKeydown)  document.removeEventListener('keydown', _boundKeydown);
      if (_boundVisChange) document.removeEventListener('visibilitychange', _boundVisChange);
      if (_container) _container.innerHTML = '';
    },
  };

  /* ================================================================
     私有方法
     ================================================================ */

  /* ---------- 渲染 DOM ---------- */
  function _render() {
    // 保留已有的 handle（由 HTML 提供），只替换内部内容
    const handle = _container.querySelector('.module-handle');
    _container.innerHTML = '';
    if (handle) _container.appendChild(handle);

    const wrapper = document.createElement('div');
    wrapper.className = 'search-wrapper';
    wrapper.innerHTML = `
      <svg class="search-icon" viewBox="0 0 24 24" width="20" height="20"
           fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" class="search-input" placeholder="搜索网页…"
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      <button class="search-clear-btn" title="清除" hidden>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <button class="engine-btn" title="切换搜索引擎">
        <img class="engine-icon" src="icons/google.png" alt="" width="20" height="20">
      </button>
    `;

    const dropdown = document.createElement('div');
    dropdown.className = 'engine-dropdown';

    const suggestions = document.createElement('div');
    suggestions.className = 'search-suggestions';
    suggestions.hidden = true;

    _container.appendChild(wrapper);
    _container.appendChild(dropdown);
    _container.appendChild(suggestions);

    _wrapper    = wrapper;
    _input      = wrapper.querySelector('.search-input');
    _clearBtn   = wrapper.querySelector('.search-clear-btn');
    _engineBtn  = wrapper.querySelector('.engine-btn');
    _engineIcon = wrapper.querySelector('.engine-icon');
    _dropdown   = dropdown;
    _suggestBox = suggestions;
  }

  /* ---------- 绑定事件 ---------- */
  function _bindEvents() {
    // 清除
    _clearBtn.addEventListener('click', () => {
      _input.value = '';
      _clearBtn.hidden = true;
      _suggestBox.innerHTML = '';
      _suggestBox.hidden = true;
      _input.focus();
    });

    // 输入
    _input.addEventListener('input', () => {
      _clearBtn.hidden = _input.value === '';
      clearTimeout(_suggestTimer);
      const q = _input.value.trim();
      if (!q) {
        _suggestBox.innerHTML = '';
        _suggestBox.hidden = true;
        _suggestIdx = -1;
        return;
      }
      _suggestTimer = setTimeout(() => _fetchSuggestions(q), 200);
    });

    // 键盘
    _input.addEventListener('keydown', _onKeydown);

    // 点击建议
    _suggestBox.addEventListener('click', (e) => {
      const item = e.target.closest('.sm-suggest-item');
      if (item?.dataset.query) _doSearch(item.dataset.query);
    });

    // 点击外部关闭
    _boundClick = (e) => {
      if (!_suggestBox.contains(e.target) && e.target !== _input) {
        _suggestBox.innerHTML = '';
        _suggestBox.hidden = true;
        _suggestIdx = -1;
      }
      if (!_dropdown.contains(e.target) && e.target !== _engineBtn && !_engineBtn.contains(e.target)) {
        _dropdown.classList.remove('visible');
      }
    };
    document.addEventListener('click', _boundClick);

    // 引擎按钮
    _engineBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      SearchModule.renderEngineDropdown();
      _dropdown.classList.toggle('visible');
    });

    // 引擎选择
    _dropdown.addEventListener('click', (e) => {
      const b = e.target.closest('.sm-engine-option');
      if (!b?.dataset.engine) return;
      _s().searchEngine = b.dataset.engine;
      SearchModule.updateEngineLabel();
      _dropdown.classList.remove('visible');
      _storage.set({ settings: _s() });
    });

    // 初始化引擎
    SearchModule.updateEngineLabel();
    SearchModule.renderEngineDropdown();

    // 全局快捷键 '/' 聚焦
    _boundKeydown = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.activeElement === _input) return;
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      // 检查是否有弹窗打开
      if (document.querySelector('.settings-panel.open')) return;
      if (document.querySelector('.modal.visible')) return;
      if (document.querySelector('.edit-mode')) return;
      e.preventDefault();
      _input.focus();
    };
    document.addEventListener('keydown', _boundKeydown);

    // 切换标签页失焦
    _boundVisChange = () => {
      if (document.hidden && document.activeElement === _input) _input.blur();
    };
    document.addEventListener('visibilitychange', _boundVisChange);
  }

  /* ---------- 键盘导航 ---------- */
  function _onKeydown(e) {
    const items = _suggestBox.querySelectorAll('.sm-suggest-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _suggestIdx = Math.min(_suggestIdx + 1, items.length - 1);
      _updateHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _suggestIdx = Math.max(_suggestIdx - 1, -1);
      _updateHighlight(items);
    } else if (e.key === 'Enter') {
      const active = _suggestBox.querySelector('.sm-suggest-item.active');
      if (active?.dataset.query) {
        e.preventDefault();
        _doSearch(active.dataset.query);
      } else if (_input.value.trim()) {
        _doSearch(_input.value.trim());
      }
    } else if (e.key === 'Escape') {
      _suggestBox.innerHTML = '';
      _suggestBox.hidden = true;
      _suggestIdx = -1;
    }
  }

  function _updateHighlight(items) {
    items.forEach((el, i) => el.classList.toggle('active', i === _suggestIdx));
  }

  /* ---------- 执行搜索 ---------- */
  function _doSearch(query) {
    const eg = SearchModule.getAllEngines();
    const e = eg[_s().searchEngine] || eg['google'];
    window.open(SearchModule.buildSearchUrl(e, query), '_blank');
    _suggestBox.innerHTML = '';
    _suggestBox.hidden = true;
    _input.value = '';
    _clearBtn.hidden = true;
  }

  /* ---------- 获取建议 ---------- */
  async function _fetchSuggestions(query) {
    _suggestIdx = -1;
    const results = [];

    // 本地书签匹配
    const bms = _bookmarksGetter();
    const bmMatches = bms
      .filter(b => b.name.toLowerCase().includes(query.toLowerCase()) ||
                   _getDomain(b.url).includes(query.toLowerCase()))
      .slice(0, 3);
    for (const bm of bmMatches) {
      results.push({
        text: bm.name, url: bm.url,
        type: '书签', icon: bm.icon || '', query: bm.url,
      });
    }

    // 远程建议
    try {
      const se = _s().searchEngine;
      let sugUrl = null;
      if (se === 'google')
        sugUrl = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
      else if (se === 'bing')
        sugUrl = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`;
      if (sugUrl) {
        const resp = await fetch(sugUrl);
        const data = await resp.json();
        const suggestions = Array.isArray(data) ? (Array.isArray(data[1]) ? data[1] : data) : [];
        for (const s of suggestions.slice(0, 5)) {
          if (typeof s === 'string' && s.toLowerCase() !== query.toLowerCase()) {
            results.push({ text: s, type: '建议', query: s, icon: null });
          }
        }
      }
    } catch {}

    // 渲染
    _suggestBox.innerHTML = '';
    if (!results.length) { _suggestBox.hidden = true; return; }
    for (const r of results) {
      const item = document.createElement('div');
      item.className = 'sm-suggest-item';
      item.dataset.query = r.query;
      item.innerHTML = `
        <span class="sm-suggest-icon">${
          r.icon
            ? `<img src="${r.icon}" width="18" height="18" style="border-radius:3px">`
            : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
        }</span>
        <span class="sm-suggest-text">${_escapeHtml(r.text)}</span>
        <span class="sm-suggest-type">${r.type}</span>
      `;
      _suggestBox.appendChild(item);
    }
    _suggestBox.hidden = false;
  }

  /* ---------- 工具 ---------- */
  function _getDomain(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); }
    catch { return u; }
  }

  function _escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();

export { SearchModule };
