import { api } from '../api.js';
import { toast } from '../toast.js';

const STATUS_BADGE = { pending: 'warning', confirmed: 'neutral', converted: 'success', cancelled: 'danger' };

export const bookingsList = {
  auth: true,
  async render(container, params, navigate) {
    const list = await api.get('/bookings');
    container.innerHTML = `
      <div class="card" id="bookings-list">
        ${
          list.length
            ? list
                .map(
                  (b) => `
          <a class="list-item" href="#/bookings/${b.id}">
            <div class="main">
              <div class="title">${b.customer_name} — ${b.plate_no}</div>
              <div class="subtitle">${b.booking_date} ${b.booking_time || ''} · ${b.service_name || 'Tiada servis'}</div>
            </div>
            <div class="trailing"><span class="badge ${STATUS_BADGE[b.status]}">${b.status}</span></div>
          </a>`
                )
                .join('')
            : '<div class="empty-state">Tiada booking.</div>'
        }
      </div>
      <button class="fab" id="add-booking-btn" title="Booking baru">+</button>
    `;
    container.querySelector('#add-booking-btn').addEventListener('click', () => navigate('/bookings/new'));
  },
};

export const bookingNew = {
  auth: true,
  async render(container, params, navigate) {
    const services = await api.get('/services');
    let selectedCustomer = null;
    let selectedCarId = null;

    function renderForm() {
      container.innerHTML = `
        <div class="card">
          <h3>Booking Baru</h3>
          ${
            selectedCustomer
              ? `
            <div class="list-item" style="padding:0;">
              <div class="main"><div class="title">${selectedCustomer.name}</div><div class="subtitle">${selectedCustomer.phone || '-'}</div></div>
              <button class="btn secondary" id="change-customer-btn">Tukar</button>
            </div>
            ${
              selectedCustomer.cars.length
                ? `<div class="field"><label>Kereta</label><select id="car-select">
                ${selectedCustomer.cars.map((c) => `<option value="${c.id}">${c.plate_no}</option>`).join('')}
              </select></div>`
                : `<div class="empty-state">Tiada kereta untuk pelanggan ini.</div>`
            }
            <form id="booking-form">
              <div class="field"><label>Servis</label>
                <select name="service_id">
                  <option value="">-</option>
                  ${services.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}
                </select>
              </div>
              <div class="field"><label>Tarikh *</label><input name="booking_date" type="date" required /></div>
              <div class="field"><label>Masa</label><input name="booking_time" type="time" /></div>
              <div class="field"><label>Nota</label><textarea name="notes"></textarea></div>
              <button class="btn full" type="submit" ${selectedCustomer.cars.length ? '' : 'disabled'}>Simpan Booking</button>
            </form>
          `
              : `
            <div class="search-bar"><input id="customer-search" type="search" placeholder="Cari pelanggan…" /></div>
            <div id="customer-results"></div>
          `
          }
        </div>
      `;

      if (!selectedCustomer) {
        const searchInput = container.querySelector('#customer-search');
        let debounce;
        searchInput.addEventListener('input', (e) => {
          clearTimeout(debounce);
          debounce = setTimeout(async () => {
            const q = e.target.value.trim();
            if (!q) return;
            const results = await api.get(`/customers?search=${encodeURIComponent(q)}`);
            container.querySelector('#customer-results').innerHTML = results
              .map(
                (c) =>
                  `<div class="list-item" data-pick="${c.id}"><div class="main"><div class="title">${c.name}</div><div class="subtitle">${c.phone || '-'}</div></div></div>`
              )
              .join('');
            container.querySelectorAll('[data-pick]').forEach((el) => {
              el.addEventListener('click', async () => {
                selectedCustomer = await api.get(`/customers/${el.dataset.pick}`);
                renderForm();
              });
            });
          }, 250);
        });
        return;
      }

      container.querySelector('#change-customer-btn').addEventListener('click', () => {
        selectedCustomer = null;
        renderForm();
      });
      container.querySelector('#car-select')?.addEventListener('change', (e) => (selectedCarId = e.target.value));
      selectedCarId = selectedCustomer.cars[0]?.id || null;

      container.querySelector('#booking-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = new FormData(e.target);
        try {
          const booking = await api.post('/bookings', {
            customer_id: selectedCustomer.id,
            car_id: selectedCarId,
            service_id: form.get('service_id') || undefined,
            booking_date: form.get('booking_date'),
            booking_time: form.get('booking_time') || undefined,
            notes: form.get('notes') || undefined,
          });
          toast('Booking disimpan');
          navigate(`/bookings/${booking.id}`);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }

    renderForm();
  },
};

export const bookingDetail = {
  auth: true,
  async render(container, params, navigate) {
    const b = await api.get(`/bookings/${params.id}`);
    container.innerHTML = `
      <div class="card">
        <h3>${b.customer_name} — ${b.plate_no}</h3>
        <div style="color:var(--text-muted);font-size:0.85rem;">${b.customer_phone || '-'}</div>
        <div class="line-item"><span>Tarikh</span><span>${b.booking_date} ${b.booking_time || ''}</span></div>
        <div class="line-item"><span>Servis</span><span>${b.service_name || '-'}</span></div>
        ${b.notes ? `<div class="line-item"><span>Nota</span><span>${b.notes}</span></div>` : ''}
        <div class="line-item"><span>Status</span><span><span class="badge ${STATUS_BADGE[b.status]}">${b.status}</span></span></div>
      </div>
      ${
        b.status === 'pending' || b.status === 'confirmed'
          ? `
        <div class="card">
          ${b.status === 'pending' ? `<button class="btn full" id="confirm-btn" style="margin-bottom:0.5rem;">Sahkan Booking</button>` : ''}
          <button class="btn full" id="convert-btn" style="margin-bottom:0.5rem;">Convert to Job</button>
          <button class="btn secondary full" id="cancel-btn">Batalkan</button>
        </div>`
          : ''
      }
    `;

    container.querySelector('#confirm-btn')?.addEventListener('click', async () => {
      try {
        await api.patch(`/bookings/${b.id}`, { status: 'confirmed' });
        navigate(`/bookings/${b.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    container.querySelector('#cancel-btn')?.addEventListener('click', async () => {
      try {
        await api.patch(`/bookings/${b.id}`, { status: 'cancelled' });
        navigate(`/bookings/${b.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    container.querySelector('#convert-btn')?.addEventListener('click', async () => {
      try {
        const job = await api.post(`/bookings/${b.id}/convert-to-job`);
        toast('Booking ditukar kepada job');
        navigate(`/jobs/${job.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  },
};
