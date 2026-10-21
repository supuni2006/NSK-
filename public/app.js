const $ = (s) => document.querySelector(s);
let vehicles = [], token = null;
const money = (n) => '$' + Number(n).toLocaleString('en-US');

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
    <dl>${Object.entries(v.specs).map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join('')}</dl>`;
  $('#specModal').hidden = false;
}
$('#grid').addEventListener('click', e => { const c = e.target.closest('.card'); c && openSpecs(c.dataset.id); });
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
  await fetch('/api/vehicles/' + id, { method: 'DELETE', headers: {'x-admin-token': token} });
  load();
});
load();
