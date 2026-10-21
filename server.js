const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nsk2026'; // set ADMIN_PASSWORD in Vercel
const DB = path.join(__dirname, 'data', 'vehicles.json');
const SEED = DB;

// Storage mode: Vercel Blob when a token exists (production), local files otherwise (npm start)
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const ON_VERCEL = !!process.env.VERCEL;
const blob = USE_BLOB ? require('@vercel/blob') : null;
const LOCAL_UPLOADS = path.join(__dirname, 'public', 'uploads');

const BLOB_DB_NAME = 'vehicles.json';

async function readVehicles() {
  if (!USE_BLOB) return JSON.parse(fs.readFileSync(DB, 'utf8'));
  const { blobs } = await blob.list({ prefix: BLOB_DB_NAME });
  const found = blobs.find(b => b.pathname === BLOB_DB_NAME);
  if (!found) {
    // first run: start from the vehicles bundled with the site
    const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
    await writeVehicles(seed);
    return seed;
  }
  const r = await fetch(found.url + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Could not load vehicles');
  return r.json();
}

async function writeVehicles(data) {
  const json = JSON.stringify(data, null, 2);
  if (!USE_BLOB) {
    if (ON_VERCEL) {
      const e = new Error('Storage is not connected. In Vercel, create a Blob store and connect it to this project, then redeploy.');
      e.status = 501; throw e;
    }
    return fs.writeFileSync(DB, json);
  }
  await blob.put(BLOB_DB_NAME, json, {
    access: 'public', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60
  });
}

async function saveImage(file) {
  const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
  const name = Date.now() + ext;
  if (USE_BLOB) {
    const r = await blob.put('vehicles/' + name, file.buffer, { access: 'public', contentType: file.mimetype });
    return r.url;
  }
  if (ON_VERCEL) {
    const e = new Error('Storage is not connected. Connect a Vercel Blob store to upload photos.');
    e.status = 501; throw e;
  }
  fs.mkdirSync(LOCAL_UPLOADS, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_UPLOADS, name), file.buffer);
  return '/uploads/' + name;
}

// Vercel functions accept ~4.5 MB request bodies, so keep photos under 4 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, /^image\//.test(f.mimetype))
});

// Stateless signed tokens (work across serverless invocations)
const sign = (exp) => crypto.createHmac('sha256', ADMIN_PASSWORD).update(String(exp)).digest('hex');
const makeToken = () => { const exp = Date.now() + 12 * 3600 * 1000; return exp + '.' + sign(exp); };
const validToken = (t) => {
  if (!t || typeof t !== 'string') return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
};
const auth = (req, res, next) =>
  validToken(req.headers['x-admin-token']) ? next() : res.status(401).json({ error: 'Sign in required' });

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/vehicles', wrap(async (req, res) => {
  const { brand } = req.query;
  const all = await readVehicles();
  res.set('Cache-Control', 'no-store');
  res.json(brand ? all.filter(v => v.brand.toLowerCase() === brand.toLowerCase()) : all);
}));

app.post('/api/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
  res.json({ token: makeToken() });
});

app.post('/api/vehicles', auth, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Photo is too large (max 4 MB)' });
    err ? next(err) : next();
  });
}, wrap(async (req, res) => {
  const b = req.body;
  if (!b.brand || !b.model) return res.status(400).json({ error: 'Brand and model are required' });
  const image = req.file ? await saveImage(req.file) : '/img/hero.jpg';
  const v = {
    id: Date.now().toString(36),
    brand: b.brand.trim(), model: b.model.trim(), year: +b.year || null, price: +b.price || 0,
    image,
    specs: {
      Engine: b.engine || '-', Transmission: b.transmission || '-', Mileage: b.mileage || '-',
      Fuel: b.fuel || '-', Drive: b.drive || '-', Colour: b.colour || '-',
      'Auction grade': b.grade || '-'
    }
  };
  const all = await readVehicles(); all.unshift(v); await writeVehicles(all);
  res.status(201).json(v);
}));

app.delete('/api/vehicles/:id', auth, wrap(async (req, res) => {
  const all = await readVehicles();
  const gone = all.find(v => v.id === req.params.id);
  await writeVehicles(all.filter(v => v.id !== req.params.id));
  // tidy up the uploaded photo (ignore failures)
  if (USE_BLOB && gone && /^https:\/\/.+blob\.vercel-storage\.com\//.test(gone.image || '')) {
    blob.del(gone.image).catch(() => {});
  }
  res.json({ ok: true });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

if (!ON_VERCEL) {
  app.listen(PORT, () => console.log(`NSK Japan running at http://localhost:${PORT}`));
}

module.exports = app;