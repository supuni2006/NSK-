const $ = (s) => document.querySelector(s);
let vehicles = [], token = null;
const money = (n) => '$' + Number(n).toLocaleString('en-US');

// ===== WhatsApp settings =====
// Digits only, with country code, no "+" or spaces. Example: Sri Lanka 077 123 4567 -> '94771234567'
const WA_NUMBER = '94775533923'; // +94 77 553 3923
const waLink = (text) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
const waText = (v) =>
  `Hello NSK Japan, I'm interested in the ${v.year ? v.year + ' ' : ''}${v.brand} ${v.model} (${money(v.price)}). Is it still available?`;
const WA_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.1-1.3A10 10 0 1 0 12 2z"/></svg>';

async function load() {
  vehicles = await (await fetch('/api/vehicles')).json();
  const brands = [...new Set(vehicles.map(v => v.brand))];
  $('#fBrand').innerHTML = '<option value="">All brands</option>' + brands.map(b => `<option>${b}</option>`).join('');
  render(vehicles);
  renderManage();
}

function render(list) {
  $('#grid').innerHTML = list.map(v => `
    <article class="card" data-id="${v.id}" tabindex="0">
      <h4>${esc(v.brand)} ${esc(v.model)}</h4>
      <small>${v.year || ''}</small>
      <img src="${v.image}" alt="${esc(v.brand + ' ' + v.model)}">
      <div class="foot"><span class="price">${money(v.price)}</span><button class="pill">View specs</button></div>
      <a class="wa" href="${waLink(waText(v))}" target="_blank" rel="noopener">${WA_ICON} Inquire on WhatsApp</a>
    </article>`).join('');
  $('#empty').hidden = list.length > 0;
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function filter(e) {
  e && e.preventDefault();
  const b = $('#fBrand').value, max = +$('#fBudget').value, yr = +$('#fYear').value;
  render(vehicles.filter(v => (!b || v.brand === b) && (!max || v.price <= max) && (!yr || v.year >= yr)));
  $('#fleet').scrollIntoView();
}
$('#finder').addEventListener('submit', filter);
$('#showAll').onclick = () => render(vehicles);
document.querySelectorAll('.cats button').forEach(btn => btn.onclick = () => {
  $('#fBrand').value = btn.dataset.brand; filter();
});

function openSpecs(id) {
  const v = vehicles.find(x => x.id === id);
  $('#specBody').innerHTML = `
    <img src="${v.image}" alt="">
    <div><h3>${esc(v.brand)} ${esc(v.model)}</h3><p>${v.year || ''}</p><h3>${money(v.price)}</h3></div>
    <dl>${Object.entries(v.specs).map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join('')}</dl>
    <a class="wa big" href="${waLink(waText(v))}" target="_blank" rel="noopener">${WA_ICON} Inquire on WhatsApp</a>`;
  $('#specModal').hidden = false;
}
$('#grid').addEventListener('click', e => {
  if (e.target.closest('a.wa')) return; // WhatsApp link opens chat, not the specs modal
  const c = e.target.closest('.card'); c && openSpecs(c.dataset.id);
});
$('#grid').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.click(); });
$('#specModal').addEventListener('click', e => { if (e.target.id === 'specModal') e.target.hidden = true; });
addEventListener('keydown', e => { if (e.key === 'Escape') { $('#specModal').hidden = true; $('#drawer').hidden = true; } });

addEventListener('scroll', () => $('#nav').classList.toggle('solid', scrollY > 80));

// Admin (built into the page)
$('#adminBtn').onclick = () => $('#drawer').hidden = false;
$('#closeDrawer').onclick = () => $('#drawer').hidden = true;
$('#loginBtn').onclick = async () => {
  const r = await fetch('/api/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ password: $('#pw').value }) });
  const d = await r.json();
  if (!r.ok) return $('#loginMsg').textContent = d.error;
  token = d.token; $('#login').hidden = true; $('#panel').hidden = false;
};
$('#addForm').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await fetch('/api/vehicles', { method: 'POST', headers: {'x-admin-token': token}, body: new FormData(e.target) });
  const d = await r.json();
  $('#addMsg').textContent = r.ok ? 'Vehicle published.' : d.error;
  if (r.ok) { e.target.reset(); load(); }
});
function renderManage() {
  $('#manage').innerHTML = vehicles.map(v => `<li><span>${esc(v.brand)} ${esc(v.model)}</span><button data-del="${v.id}">Delete</button></li>`).join('');
}
$('#manage').addEventListener('click', async e => {
  const id = e.target.dataset.del; if (!id) return;
  const r = await fetch('/api/vehicles/' + id, { method: 'DELETE', headers: {'x-admin-token': token} });
  if (!r.ok) alert((await r.json()).error || 'Could not delete');
  load();
});
// General WhatsApp links (footer + floating button)
document.querySelectorAll('[data-wa-general]').forEach(a => {
  a.href = waLink("Hello NSK Japan, I'd like to ask about importing a vehicle.");
});
load();