import { api } from '../api.js';
import { toast } from '../toast.js';

function customerRow(c) {
  const cars = (c.cars || []).map((car) => car.plate_no).join(', ') || 'Tiada kereta';
  return `
    <a class="list-item" href="#/customers/${c.id}">
      <div class="main">
        <div class="title">${c.name}</div>
        <div class="subtitle">${c.phone || '-'} · ${cars}</div>
      </div>
      <div class="trailing">${c.last_service_date ? c.last_service_date.slice(0, 10) : ''}</div>
    </a>
  `;
}

export const customersList = {
  auth: true,
  async render(container, params, navigate) {
    const renderList = async (search) => {
      const list = await api.get(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      const listEl = container.querySelector('#customer-list');
      listEl.innerHTML = list.length
        ? list.map(customerRow).join('')
        : '<div class="empty-state">Tiada pelanggan lagi.</div>';
    };

    container.innerHTML = `
      <div class="search-bar"><input id="search-input" type="search" placeholder="Cari nama atau telefon…" /></div>
      <div class="card" id="customer-list"></div>
      <button class="fab" id="add-customer-btn" title="Tambah pelanggan">+</button>
    `;

    await renderList('');

    let debounce;
    container.querySelector('#search-input').addEventListener('input', (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderList(e.target.value), 250);
    });

    container.querySelector('#add-customer-btn').addEventListener('click', () => {
      navigate('/customers/new');
    });
  },
};

export const customerNew = {
  auth: true,
  render(container, params, navigate) {
    container.innerHTML = `
      <div class="card">
        <h3>Pelanggan Baru</h3>
        <form id="new-customer-form">
          <div class="field"><label>Nama *</label><input name="name" required /></div>
          <div class="field"><label>Telefon</label><input name="phone" type="tel" /></div>
          <div class="section-title">Kereta (pilihan)</div>
          <div class="field"><label>No. Plat</label><input name="plate_no" /></div>
          <div class="field"><label>Model</label><input name="model" /></div>
          <div class="btn-row">
            <button type="button" class="btn secondary full" id="cancel-btn">Batal</button>
            <button type="submit" class="btn full">Simpan</button>
          </div>
        </form>
      </div>
    `;

    container.querySelector('#cancel-btn').addEventListener('click', () => navigate('/customers'));
    container.querySelector('#new-customer-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      const plateNo = form.get('plate_no');
      try {
        const customer = await api.post('/customers', {
          name: form.get('name'),
          phone: form.get('phone') || undefined,
          car: plateNo ? { plate_no: plateNo, model: form.get('model') || undefined } : undefined,
        });
        toast('Pelanggan ditambah');
        navigate(`/customers/${customer.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  },
};

export const customerDetail = {
  auth: true,
  async render(container, params, navigate) {
    const c = await api.get(`/customers/${params.id}`);

    container.innerHTML = `
      <div class="card">
        <h3>${c.name}</h3>
        <div style="color:var(--text-muted);font-size:0.85rem;">${c.phone || '-'}</div>
        <div class="btn-row" style="margin-top:0.8rem;">
          <a class="btn full" href="#/pos?customer_id=${c.id}">Punch Sale</a>
          ${c.phone ? `<a class="btn secondary full" href="https://wa.me/${c.phone.replace(/[^0-9]/g, '')}" target="_blank">WhatsApp</a>` : ''}
        </div>
      </div>

      <div class="section-title">Kereta &amp; Sejarah Servis</div>
      ${
        c.cars.length
          ? c.cars
              .map(
                (car) => `
        <div class="card">
          <div style="font-weight:600;">${car.plate_no} ${car.model ? `— ${car.model}` : ''}</div>
          ${
            car.service_history.length
              ? car.service_history
                  .map(
                    (j) => `
              <a class="list-item" href="#/jobs/${j.id}">
                <div class="main"><div class="title">RM ${Number(j.total).toFixed(2)}</div><div class="subtitle">${j.created_at.slice(0, 10)}</div></div>
                <div class="trailing"><span class="badge ${j.status === 'dah_collect' ? 'success' : 'warning'}">${j.status}</span></div>
              </a>`
                  )
                  .join('')
              : '<div class="empty-state">Tiada sejarah servis.</div>'
          }
        </div>`
              )
              .join('')
          : '<div class="empty-state">Tiada kereta didaftarkan.</div>'
      }

      <div class="section-title">Tambah Kereta Baru</div>
      <div class="card">
        <form id="add-car-form">
          <div class="field"><label>No. Plat *</label><input name="plate_no" required /></div>
          <div class="field"><label>Model</label><input name="model" /></div>
          <button class="btn full" type="submit">Tambah Kereta</button>
        </form>
      </div>
    `;

    container.querySelector('#add-car-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      try {
        await api.post(`/customers/${c.id}/cars`, {
          plate_no: form.get('plate_no'),
          model: form.get('model') || undefined,
        });
        toast('Kereta ditambah');
        navigate(`/customers/${c.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  },
};
