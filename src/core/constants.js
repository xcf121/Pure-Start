/**
 * Constants & Defaults — 全局常量与默认配置
 * 所有模块共享的配置数据，不包含任何逻辑
 */

export const API_BASE = 'http://47.109.79.10:3080/api';

export const SNAP_THRESHOLD = 3.5;
export const SNAP_MAGNET    = 2.0;

export const BUILTIN_ENGINES = {
  google:     { name: 'Google',     url: 'https://www.google.com/search?q=' },
  bing:       { name: 'Bing',       url: 'https://www.bing.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
};

export const DEFAULT_POSITIONS = {
  clock:     { x: 50, y: 10 },
  search:    { x: 50, y: 35 },
  bookmarks: { x: 50, y: 52 },
};

export const DEFAULT_SETTINGS = {
  theme: 'light',
  wallpaperSource: 'bing',
  searchEngine: 'google',
  searchStyle: 'frosted',
  showBookmarkNames: true,
  customSearchEngines: [],
  positions: { ...DEFAULT_POSITIONS },
  modules: { clock: true, search: true, bookmarks: true, hitokoto: true },
};

export const DEFAULT_BOOKMARKS = [
  { id: 'bm_github',   name: 'GitHub',    url: 'https://github.com',    icon: null },
  { id: 'bm_youtube',  name: 'YouTube',   url: 'https://youtube.com',   icon: null },
  { id: 'bm_gmail',    name: 'Gmail',     url: 'https://mail.google.com', icon: null },
  { id: 'bm_twitter',  name: 'Twitter',   url: 'https://twitter.com',   icon: null },
  { id: 'bm_reddit',   name: 'Reddit',    url: 'https://reddit.com',    icon: null },
  { id: 'bm_bilibili', name: 'Bilibili',  url: 'https://bilibili.com',  icon: null },
];
