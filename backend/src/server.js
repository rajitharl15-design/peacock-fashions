import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';

import pool, { initDbConnection } from './db.js';
import { migrate } from './migrate.js';
import {
  setSettings,
  getSettings,
  isConfigured,
  newSecret,
  signToken,
  verifyRequestAuth,
  setAdminCookie,
  clearAdminCookie,
  hashPassword,
  verifyPassword,
  isHashed,
  requireAdmin,
} from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const publicDir = path.resolve(__dirname, '../..');
const privateDir = path.resolve(__dirname, '../private');

app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : false,
  credentials: true,
  allowedHeaders: ['Content-Type', 'x-admin-key', 'Cache-Control', 'Pragma', 'Expires'],
}));
app.use(express.json({ limit: '25mb' }));

app.use((req, res, next) => {
  const p = req.path;
  if (p.startsWith('/api/') || p.startsWith('/js/') || p.startsWith('/css/') || p.endsWith('.html') || p === '/admin' || p === '/admin-login') {
    res.set('Cache-Control', 'no-store');
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'peacock-fashions-backend' });
});

// ---- Admin pages ----
function sendAdminPage(res, file) {
  try {
    res.set('Content-Type', 'text/html').send(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    res.status(500).send('Admin page unavailable');
  }
}

app.get(['/admin', '/admin.html'], (req, res) => {
  const user = verifyRequestAuth(req.headers);
  if (!user) return res.redirect('/admin-login');
  try {
    const html = fs.readFileSync(path.join(privateDir, 'admin.html'), 'utf8');
    const out = html.replace(
      '<script src="js/catalog-admin.js"></script>',
      `<script>try{localStorage.setItem('peacock_admin_key', ${JSON.stringify(signToken(user))});}catch(e){}</script>\n  <script src="js/catalog-admin.js"></script>`
    );
    res.set('Content-Type', 'text/html').send(out);
  } catch (err) {
    res.status(500).send('Admin page unavailable');
  }
});

app.get('/admin-login', (req, res) => {
  if (verifyRequestAuth(req.headers)) return res.redirect('/admin');
  sendAdminPage(res, path.join(privateDir, 'login.html'));
});

// ---- Admin auth ----
const limiterBuckets = new Map();
function rateLimit(group, id) {
  const key = group + ':' + id;
  const now = Date.now();
  const win = 15 * 60 * 1000;
  const rec = limiterBuckets.get(key) || { n: 0, start: now };
  if (now - rec.start > win) {
    rec.n = 0;
    rec.start = now;
  }
  if (rec.n >= 10) return { ok: false, fail() {} };
  limiterBuckets.set(key, rec);
  return {
    ok: true,
    fail() {
      rec.n++;
      limiterBuckets.set(key, rec);
    },
  };
}

app.get('/api/admin/status', (req, res) => {
  res.json({ configured: isConfigured() });
});

app.post('/api/admin/setup', async (req, res) => {
  try {
    if (isConfigured()) return res.status(409).json({ error: 'Admin is already configured.' });
    const username = String((req.body || {}).username || '').trim();
    const password = String((req.body || {}).password || '');
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const hashed = hashPassword(password);
    const secret = newSecret();
    await pool.query(
      'INSERT INTO admin_settings(username, password, auth_secret) VALUES($1,$2,$3)',
      [username, hashed, secret]
    );
    setSettings({ username, password: hashed, secret });
    setAdminCookie(res, username);
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/setup]', err.message);
    res.status(500).json({ error: 'Setup failed. Please try again.' });
  }
});

app.post('/api/admin/login', async (req, res) => {
  const lim = rateLimit('login', req.ip || (req.socket && req.socket.remoteAddress));
  if (!lim.ok) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' });
  try {
    const username = String((req.body || {}).username || '').trim();
    const password = String((req.body || {}).password || '');
    const envUser = process.env.ADMIN_USER && process.env.ADMIN_PASS
      ? { username: process.env.ADMIN_USER, password: process.env.ADMIN_PASS }
      : null;
    const current = getSettings();
    const creds = envUser || current;
    if (creds && username === creds.username) {
      const ok = verifyPassword(creds.password, password);
      if (ok) {
        if (ok === 'legacy' && current && !isHashed(current.password)) {
          const hashed = hashPassword(password);
          await pool.query('UPDATE admin_settings SET password = $1 WHERE username = $2', [hashed, current.username]);
          current.password = hashed;
        }
        setAdminCookie(res, username);
        return res.json({ ok: true });
      }
    }
    lim.fail();
    return res.status(401).json({ error: 'Incorrect username or password.' });
  } catch (err) {
    console.error('[admin/login]', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ ok: true, user: req.adminUser });
});

// ---- Catalog ----
app.get('/api/catalog', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT products, updated_at FROM catalog WHERE id = 1');
    if (rows.length === 0) return res.status(404).json({ error: 'No catalog published yet.' });
    const products = Array.isArray(rows[0].products) ? rows[0].products : [];
    res.set('Cache-Control', 'no-store');
    res.json({ products, updated_at: rows[0].updated_at ? new Date(rows[0].updated_at).getTime() : Date.now() });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/publish', requireAdmin, async (req, res, next) => {
  try {
    const { products } = req.body || {};
    if (!Array.isArray(products)) return res.status(400).json({ error: 'products must be an array' });
    await pool.query(
      `INSERT INTO catalog(id, products, updated_at) VALUES(1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET products = EXCLUDED.products, updated_at = NOW()`,
      [JSON.stringify(products)]
    );
    res.json({ ok: true, count: products.length });
  } catch (err) {
    next(err);
  }
});

// ---- Orders ----
app.post('/api/orders', async (req, res, next) => {
  try {
    const { name, phone, address, items, total } = req.body || {};
    if (!name || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'name and items are required' });
    }
    const orderNumber = 'PF' + Date.now().toString(36).toUpperCase();
    const r = await pool.query(
      `INSERT INTO orders(order_number, customer_name, phone, address, items, total)
       VALUES($1, $2, $3, $4, $5, $6) RETURNING id, order_number`,
      [orderNumber, String(name).trim(), phone || null, address || null, JSON.stringify(items), Number(total) || 0]
    );
    res.json({ ok: true, order_number: r.rows[0].order_number });
  } catch (err) {
    next(err);
  }
});

app.get('/api/orders/:orderNumber', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT order_number, customer_name, items, total, status, payment_status, created_at
         FROM orders WHERE order_number = $1 LIMIT 1`,
      [req.params.orderNumber]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json({ order: rows[0] });
  } catch (err) {
    next(err);
  }
});

app.get('/api/admin/orders', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, order_number, customer_name, phone, address, items, total, status, payment_status, created_at
         FROM orders ORDER BY id DESC LIMIT 200`
    );
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res, next) => {
  try {
    const { status, payment_status } = req.body || {};
    const allowedStatus = ['new', 'packed', 'shipped', 'delivered', 'cancelled'];
    if (status && !allowedStatus.includes(status)) return res.status(400).json({ error: 'invalid order status' });
    if (payment_status && !['pending', 'paid'].includes(payment_status)) return res.status(400).json({ error: 'invalid payment status' });
    await pool.query(
      `UPDATE orders SET
         status = COALESCE($1, status),
         payment_status = COALESCE($2, payment_status),
         updated_at = NOW()
       WHERE id = $3`,
      [status || null, payment_status || null, req.params.id]
    );
    const { rows } = await pool.query('SELECT id, order_number, status, payment_status FROM orders WHERE id = $1', [req.params.id]);
    res.json({ order: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---- Image upload ----
const useMount = !!process.env.UPLOAD_DIR;
const productsDir = useMount
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(publicDir, 'images/products');
try {
  fs.mkdirSync(productsDir, { recursive: true });
} catch (err) {
  console.warn('[upload] upload dir not writable:', err.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try { fs.mkdirSync(productsDir, { recursive: true }); } catch (e) {}
    cb(null, productsDir);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const safe = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

app.post('/api/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const url = useMount
    ? path.posix.join('/uploads', req.file.filename)
    : path.posix.join('images', 'products', req.file.filename);
  res.status(201).json({ url, filename: req.file.filename });
});

// ---- Static site ----
app.use(['/backend', '/database', '/.git', '/node_modules'], (req, res) => res.status(404).end());
app.use(express.static(publicDir));
if (process.env.UPLOAD_DIR) {
  app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR)));
}

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : (err.message || 'Request failed') });
});

async function loadSettings() {
  try {
    const { rows } = await pool.query('SELECT username, password, auth_secret FROM admin_settings ORDER BY id LIMIT 1');
    if (rows[0] && !rows[0].auth_secret) {
      rows[0].auth_secret = newSecret();
      await pool.query('UPDATE admin_settings SET auth_secret = $1 WHERE username = $2', [rows[0].auth_secret, rows[0].username]);
    }
    setSettings(rows[0] || null);
    console.log('[auth] admin settings loaded:', rows[0] ? 'yes' : 'no');
  } catch (err) {
    setSettings(null);
    console.warn('[auth] could not load admin settings:', err.message);
  }
}

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initDbConnection();
    await migrate();
    await loadSettings();
  } catch (err) {
    console.error('[startup] database unavailable; static site will still run:', err.message);
  }
  app.listen(PORT, () => console.log(`[server] Peacock Fashions listening on :${PORT}`));
}

start();
