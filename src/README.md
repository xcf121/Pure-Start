# Pure Start — 模块化架构

## 目录结构

```
src/
├── app.js                  # 应用入口：加载数据 → 初始化模块 → 全局事件
├── core/                   # 基础设施（无业务逻辑）
│   ├── constants.js        # 常量、默认配置、内置引擎
│   ├── utils.js            # 纯工具函数（$, $$, genId, compressImage...）
│   ├── store.js            # 响应式状态管理（get/set/subscribe）
│   ├── storage.js          # 持久化存储（chrome.storage / localStorage）
│   └── component.js        # 组件基类（生命周期、DOM 快捷方法）
├── modules/                # 功能模块
│   ├── theme.js            # 主题切换（light/dark/system）
│   ├── clock.js            # 时钟显示
│   ├── wallpaper.js        # 壁纸管理（Bing/自定义）
│   ├── hitokoto.js         # 每日一言
│   ├── bookmarks.js        # 书签（CRUD、排序、弹窗、管理列表）
│   ├── editmode.js         # 编辑模式（模块拖放布局）
│   ├── cloudsync.js        # 云同步（认证、推送/拉取、邀请码）
│   └── settings.js         # 设置面板（表单、子面板、导入导出）
└── styles/                 # （预留）模块级样式

search-module.js            # 搜索框组件（独立模块，CSS/JS 自包含）
search-module.css
style.css                   # 全局样式
index.html                  # 页面模板
```

## 状态管理

使用轻量 `store` 对象管理全局状态：

```js
import { store } from './core/store.js';

// 读取
store.get('settings');

// 写入（自动通知订阅者）
store.set('settings', newSettings);

// 订阅变化
const unsub = store.subscribe('settings', (val, old) => {
  console.log('settings changed', val);
});
// 取消订阅
unsub();
```

### Store 中的 key

| Key | 类型 | 说明 |
|-----|------|------|
| `settings` | Object | 用户设置（主题、引擎、模块开关…） |
| `bookmarks` | Array | 书签列表 |
| `customWallpaper` | string|null | 自定义壁纸 data URL |
| `authToken` | string|null | 云同步 JWT |
| `isEditMode` | boolean | 是否处于布局编辑模式 |
| `_bookmarksDirty` | number | 书签变更时间戳（触发同步） |
| `_settingsDirty` | number | 设置变更时间戳（触发同步） |

## 组件模式

每个功能模块继承 `Component` 基类：

```js
import { Component } from '../core/component.js';
import { store } from '../core/store.js';

class MyModule extends Component {
  constructor() { super('mymodule'); }

  init() {
    // 初始化 DOM、绑定事件
    this.on(element, 'click', handler); // 自动清理

    // 响应状态变化
    store.subscribe('settings', (s) => { ... });
  }

  destroy() {
    super.destroy(); // 清理所有事件监听
  }
}

export const MyModule = new MyModule();
```

## 添加新模块

1. 在 `src/modules/` 创建文件
2. 继承 `Component`，实现 `init()` / `destroy()`
3. 在 `app.js` 中导入并调用 `init()`
4. 如需持久化数据，使用 `Storage` 并在 `store` 中管理状态

## 数据兼容性

- 存储 key 完全不变（`ps_settings`, `psl_bookmarks` 等）
- 数据结构向后兼容，旧数据自动迁移
- `SearchModule` 通过 `settingsGetter` 桥接，保持独立
