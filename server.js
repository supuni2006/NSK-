const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nsk2026'; // change this
const DB = path.join(__dirname, 'data', 'vehicles.json');
const ON_VERCEL = !!process.env.VERCEL;
// Vercel's filesystem is read-only (except /tmp), so only touch disk locally
const UPLOADS = ON_VERCEL ? '/tmp/uploads' : path.join(__dirname, 'public', 'uploads');
try { fs.mkdirSync(UPLOADS, { recursive: true }); } catch (e) { console.warn('uploads dir:', e.message); }

// Stateless signed tokens (an in-memory Set is lost between serverless invocations)
const sign = (exp) => crypto.createHmac('sha256', ADMIN_PASSWORD).update(String(exp)).digest('hex');
const makeToken = () => { const exp = Date.now() + 12 * 3600 * 1000; return exp + '.' + sign(exp); };
const validToken = (t) => {
  if (!t || typeof t !== 'string') return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
};
const read = () => JSON.parse(fs.readFileSync(DB, 'utf8'));
const write = (d) => {
  if (ON_VERCEL) {
    const e = new Error('Saving is not supported on Vercel (read-only storage). Connect a database such as Vercel Blob, KV or Supabase.');
    e.status = 501; throw e;
  }
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_, f, cb) => cb(null, Date.now() + path.extname(f.originalname).toLowerCase())
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, /^image\//.test(f.mimetype))
});

const auth = (req, res, next) =>
  validToken(req.headers['x-admin-token']) ? next() : res.status(401).json({ error: 'Sign in required' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/vehicles', (req, res) => {
  const { brand } = req.query;
  const all = read();
  res.json(brand ? all.filter(v => v.brand.toLowerCase() === brand.toLowerCase()) : all);
});

app.post('/api/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
  res.json({ token: makeToken() });
});

app.post('/api/vehicles', auth, upload.single('image'), (req, res) => {
  const b = req.body;
  if (!b.brand || !b.model) return res.status(400).json({ error: 'Brand and model are required' });
  const v = {
    id: Date.now().toString(36),
    brand: b.brand, model: b.model, year: +b.year || null, price: +b.price || 0,
    image: req.file ? '/uploads/' + req.file.filename : '/img/hero.jpg',
    specs: {
      Engine: b.engine || '-', Transmission: b.transmission || '-', Mileage: b.mileage || '-',
      Fuel: b.fuel || '-', Drive: b.drive || '-', Colour: b.colour || '-',
      'Auction grade': b.grade || '-'
    }
  };
  const all = read(); all.unshift(v); write(all);
  res.status(201).json(v);
});

app.delete('/api/vehicles/:id', auth, (req, res) => {
  write(read().filter(v => v.id !== req.params.id));
  res.json({ ok: true });
});

// Error handler so failures return JSON instead of crashing the function
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

if (!ON_VERCEL) {
  app.listen(PORT, () => console.log(`NSK Japan running at http://localhost:${PORT}`));
}

module.exports = app;