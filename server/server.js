/* ================================================================
   Pure Start — 云同步服务端
   Express + sql.js + JWT + 文件存储
   ================================================================ */
'use strict';

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3080;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const DATA_DIR = path.join(__dirname, 'data');
const ICONS_DIR = path.join(DATA_DIR, 'icons');
const DB_PATH = path.join(DATA_DIR, 'database.sqlite');

// 确保目录存在
[DATA_DIR, ICONS_DIR].forEach(dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); });

// ================================================================
// 数据库（sql.js — 纯 JS，无需编译）
// ================================================================
let db;

async function initDB() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  saveDB();
  console.log('[DB] 初始化完成');
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// ================================================================
// 密码哈希（scrypt）
// ================================================================
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, hash) {
  return hashPassword(password, salt) === hash;
}

// ================================================================
// JWT 认证中间件
// ================================================================
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: 'Token 无效或已过期' });
  }
}

// ================================================================
// Multer 图标上传配置
// ================================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(ICONS_DIR, String(req.userId));
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 最大 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片'));
  }
});

// ================================================================
// 中间件
// ================================================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ================================================================
// 路由 — 认证
// ================================================================

// 注册
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (username.length < 2 || username.length > 32) return res.status(400).json({ error: '用户名长度 2-32 字符' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });

  // 检查用户名是否已存在
  const existing = db.exec('SELECT id FROM users WHERE username = ?', [username]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    return res.status(409).json({ error: '用户名已存在' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);

  db.run('INSERT INTO users (username, password_hash, salt, config) VALUES (?, ?, ?, ?)', [username, passwordHash, salt, '{}']);
  saveDB();

  const row = db.exec('SELECT id FROM users WHERE username = ?', [username]);
  const userId = row[0].values[0][0];
  const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '365d' });

  console.log(`[注册] ${username} (ID: ${userId})`);
  res.json({ token, userId, username });
});

// 登录
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

  const rows = db.exec('SELECT id, password_hash, salt FROM users WHERE username = ?', [username]);
  if (!rows.length || !rows[0].values.length) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const [userId, passwordHash, salt] = rows[0].values[0];
  if (!verifyPassword(password, salt, passwordHash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '365d' });
  console.log(`[登录] ${username} (ID: ${userId})`);
  res.json({ token, userId, username });
});

// ================================================================
// 路由 — 配置同步
// ================================================================

// 获取配置
app.get('/api/config', authMiddleware, (req, res) => {
  const rows = db.exec('SELECT config FROM users WHERE id = ?', [req.userId]);
  if (!rows.length || !rows[0].values.length) {
    return res.status(404).json({ error: '用户不存在' });
  }
  const configStr = rows[0].values[0][0] || '{}';
  try {
    res.json(JSON.parse(configStr));
  } catch {
    res.json({});
  }
});

// 保存配置
app.put('/api/config', authMiddleware, (req, res) => {
  const config = req.body;
  const configStr = JSON.stringify(config);
  db.run('UPDATE users SET config = ?, updated_at = datetime(\'now\') WHERE id = ?', [configStr, req.userId]);
  saveDB();
  console.log(`[配置更新] ${req.username} (${configStr.length} bytes)`);
  res.json({ ok: true });
});

// ================================================================
// 路由 — 图标管理
// ================================================================

// 上传图标
app.post('/api/icons/upload', authMiddleware, upload.single('icon'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有上传文件' });
  const relativePath = path.join(String(req.userId), req.file.filename);
  console.log(`[图标上传] ${req.username} → ${relativePath}`);
  res.json({ filename: req.file.filename, path: relativePath });
});

// 下载图标
app.get('/api/icons/:userId/:filename', authMiddleware, (req, res) => {
  // 只允许访问自己的图标
  if (String(req.userId) !== String(req.params.userId)) {
    return res.status(403).json({ error: '无权访问' });
  }
  const filePath = path.join(ICONS_DIR, req.params.userId, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' });
  res.sendFile(filePath);
});

// 删除图标
app.delete('/api/icons/:userId/:filename', authMiddleware, (req, res) => {
  if (String(req.userId) !== String(req.params.userId)) {
    return res.status(403).json({ error: '无权访问' });
  }
  const filePath = path.join(ICONS_DIR, req.params.userId, req.params.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  console.log(`[图标删除] ${req.username} → ${req.params.filename}`);
  res.json({ ok: true });
});

// ================================================================
// 路由 — 图标代理
// ================================================================

const faviconCache = new Map();

const FAVICON_SOURCES = [
  // 优先获取高清 apple-touch-icon（通常 180x180+）
  (domain) => `https://${domain}/apple-touch-icon.png`,
  (domain) => `https://${domain}/apple-touch-icon-precomposed.png`,
  // 回退到代理和标准 favicon
  (domain) => `https://statics.dnspod.cn/proxy_favicon/_/favicon?domain=${domain}`,
  (domain) => `https://${domain}/favicon.ico`,
  (domain) => `https://cravatar.cn/favicon?url=https://${domain}`,
];

app.get('/api/favicon/:domain', async (req, res) => {
  const domain = req.params.domain;
  if (!domain || domain.length > 255) return res.status(400).json({ error: '无效域名' });

  // 检查缓存
  if (faviconCache.has(domain)) {
    return res.json({ domain, dataUrl: faviconCache.get(domain) });
  }

  for (const srcFn of FAVICON_SOURCES) {
    try {
      const url = srcFn(domain);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PureStart/1.0)' },
      });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('image') && !ct.includes('octet-stream')) continue;
      const buffer = Buffer.from(await resp.arrayBuffer());
      if (buffer.length < 100) continue;
      // 超过 200KB 的跳过（可能是错误页面）
      if (buffer.length > 200 * 1024) continue;
      const mime = ct.includes('png') ? 'image/png' : ct.includes('svg') ? 'image/svg+xml' : 'image/jpeg';
      const base64 = `data:${mime};base64,${buffer.toString('base64')}`;
      faviconCache.set(domain, base64);
      console.log(`[图标获取] ${domain} → 成功 (${buffer.length} bytes)`);
      return res.json({ domain, dataUrl: base64 });
    } catch { continue; }
  }

  console.log(`[图标获取] ${domain} → 全部失败`);
  res.status(404).json({ error: '无法获取图标' });
});

// ================================================================
// 健康检查
// ================================================================
app.get('/api/health', (req, res) => {
  const userCount = db.exec('SELECT COUNT(*) FROM users');
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    users: userCount[0]?.values[0][0] || 0,
  });
});

// ================================================================
// 启动
// ================================================================
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pure Start 服务端已启动 → http://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
