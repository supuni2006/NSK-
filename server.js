const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nsk2026'; // change this
const DB = path.join(__dirname, 'data', 'vehicles.json');
const UPLOADS = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

const tokens = new Set();
const read = () => JSON.parse(fs.readFileSync(DB, 'utf8'));
const write = (d) => fs.writeFileSync(DB, JSON.stringify(d, null, 2));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (_, f, cb) => cb(null, Date.now() + path.extname(f.originalname).toLowerCase())
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, /^image\//.test(f.mimetype))
});

const auth = (req, res, next) =>
  tokens.has(req.headers['x-admin-token']) ? next() : res.status(401).json({ error: 'Sign in required' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/vehicles', (req, res) => {
  const { brand } = req.query;
  const all = read();
  res.json(brand ? all.filter(v => v.brand.toLowerCase() === brand.toLowerCase()) : all);
});

app.post('/api/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong password' });
  const t = crypto.randomBytes(24).toString('hex');
  tokens.add(t);
  res.json({ token: t });
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

app.listen(PORT, () => console.log(`NSK Japan running at http://localhost:${PORT}`));
