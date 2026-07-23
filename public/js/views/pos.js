import { api } from '../api.js';
import { toast } from '../toast.js';

export const pos = {
  auth: true,
  async render(container, params, navigate) {
    const state = {
      customer: null,
      carId: null,
      services: [], // full list from API
      selectedServiceIds: new Set(),
      parts: [], // { key, label, price, qty, inventory_id, is_manual_item, manual_item_name }
      paymentMethod: 'cash',
      company: null,
    };

    const [services, company] = await Promise.all([api.get('/services'), api.get('/company')]);
    state.services = services;
    state.company = company;

    if (params.customer_id) {
      try {
        state.customer = await api.get(`/customers/${params.customer_id}`);
        if (state.customer.cars.length === 1) state.carId = state.customer.cars[0].id;
      } catch {
        /* ignore, fall back to search */
      }
    }

    function calcTotals() {
      const serviceTotal = state.services
        .filter((s) => state.selectedServiceIds.has(s.id))
        .reduce((sum, s) => sum + s.price, 0);
      const partsTotal = state.parts.reduce((sum, p) => sum + p.price * p.qty, 0);
      const subtotal = serviceTotal + partsTotal;

      let discount = 0;
      if (state.company.discount_enabled && state.company.discount_type && state.company.discount_value) {
        discount =
          state.company.discount_type === 'percentage'
            ? subtotal * (state.company.discount_value / 100)
            : state.company.discount_value;
        discount = Math.min(discount, subtotal);
      }
      const taxable = subtotal - discount;
      const sst = state.company.sst_enabled ? taxable * (state.company.sst_rate / 100) : 0;
      const total = taxable + sst;
      return { subtotal, discount, sst, total };
    }

    function renderAll() {
      const t = calcTotals();
      container.innerHTML = `
        <div class="card">
          <h3>1. Pelanggan</h3>
          ${
            state.customer
              ? `
            <div class="list-item" style="padding:0;">
              <div class="main"><div class="title">${state.customer.name}</div><div class="subtitle">${state.customer.phone || '-'}</div></div>
              <button class="btn secondary" id="change-customer-btn">Tukar</button>
            </div>
            ${
              state.customer.cars.length
                ? `<div class="field" style="margin-top:0.6rem;"><label>Kereta</label>
                <select id="car-select">
                  ${state.customer.cars.map((c) => `<option value="${c.id}" ${c.id === state.carId ? 'selected' : ''}>${c.plate_no} ${c.model ? `— ${c.model}` : ''}</option>`).join('')}
                </select></div>`
                : `<div class="empty-state">Pelanggan ini tiada kereta. <a href="#/customers/${state.customer.id}">Tambah kereta</a></div>`
            }
          `
              : `
            <div class="search-bar"><input id="customer-search" type="search" placeholder="Cari nama/telefon…" /></div>
            <div id="customer-results"></div>
          `
          }
        </div>

        ${
          state.customer
            ? `
        <div class="card">
          <h3>2. Servis</h3>
          ${state.services
            .map(
              (s) => `
            <label class="checkbox-row" style="padding:0.4rem 0;">
              <input type="checkbox" data-service-id="${s.id}" ${state.selectedServiceIds.has(s.id) ? 'checked' : ''} />
              <span style="flex:1;">${s.name}</span>
              <span>RM ${s.price.toFixed(2)}</span>
            </label>`
            )
            .join('') || '<div class="empty-state">Belum ada menu servis. Tambah di Settings.</div>'}
        </div>

        <div class="card">
          <h3>3. Alat Ganti / Parts</h3>
          <div class="search-bar"><input id="part-search" type="search" placeholder="Cari inventori…" /></div>
          <div id="part-results"></div>
          <div class="section-title">Item Manual</div>
          <form id="manual-part-form" class="btn-row">
            <input name="name" placeholder="Nama item" style="flex:2;padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius);" required />
            <input name="price" type="number" step="0.01" placeholder="RM" style="flex:1;padding:0.5rem;border:1px solid var(--border);border-radius:var(--radius);" required />
            <button class="btn" type="submit">+</button>
          </form>
          ${
            state.parts.length
              ? `<div class="section-title">Dalam Troli</div>` +
                state.parts
                  .map(
                    (p, i) => `
              <div class="list-item">
                <div class="main"><div class="title">${p.label}</div><div class="subtitle">RM ${p.price.toFixed(2)} x ${p.qty}</div></div>
                <button class="btn secondary" data-remove-part="${i}">Buang</button>
              </div>`
                  )
                  .join('')
              : ''
          }
        </div>

        <div class="card">
          <h3>4. Bayaran</h3>
          <div class="field">
            <select id="payment-method">
              <option value="cash" ${state.paymentMethod === 'cash' ? 'selected' : ''}>Tunai</option>
              <option value="card" ${state.paymentMethod === 'card' ? 'selected' : ''}>Kad</option>
              <option value="split" ${state.paymentMethod === 'split' ? 'selected' : ''}>Split</option>
            </select>
          </div>
        </div>

        <div class="card">
          <h3>Jumlah</h3>
          <div class="line-item"><span>Subtotal</span><span>RM ${t.subtotal.toFixed(2)}</span></div>
          ${t.discount > 0 ? `<div class="line-item"><span>Diskaun</span><span>-RM ${t.discount.toFixed(2)}</span></div>` : ''}
          ${t.sst > 0 ? `<div class="line-item"><span>SST (${state.company.sst_rate}%)</span><span>RM ${t.sst.toFixed(2)}</span></div>` : ''}
          <div class="line-item total"><span>Jumlah</span><span>RM ${t.total.toFixed(2)}</span></div>
        </div>

        <button class="btn full" id="submit-job-btn" ${!state.carId ? 'disabled' : ''}>Simpan &amp; Punch Sale</button>
        `
            : ''
        }
      `;

      attachHandlers();
    }

    function attachHandlers() {
      if (!state.customer) {
        const searchInput = container.querySelector('#customer-search');
        let debounce;
        searchInput?.addEventListener('input', (e) => {
          clearTimeout(debounce);
          debounce = setTimeout(async () => {
            const q = e.target.value.trim();
            if (!q) {
              container.querySelector('#customer-results').innerHTML = '';
              return;
            }
            const results = await api.get(`/customers?search=${encodeURIComponent(q)}`);
            container.querySelector('#customer-results').innerHTML = results.length
              ? results
                  .map(
                    (c) => `<div class="list-item" data-pick-customer="${c.id}"><div class="main"><div class="title">${c.name}</div><div class="subtitle">${c.phone || '-'}</div></div></div>`
                  )
                  .join('') + `<button class="btn secondary full" id="quick-add-customer-btn" style="margin-top:0.5rem;">+ Pelanggan Baru: "${q}"</button>`
              : `<button class="btn secondary full" id="quick-add-customer-btn" data-name="${q}" style="margin-top:0.5rem;">+ Tambah Pelanggan Baru</button>`;

            container.querySelectorAll('[data-pick-customer]').forEach((el) => {
              el.addEventListener('click', async () => {
                state.customer = await api.get(`/customers/${el.dataset.pickCustomer}`);
                if (state.customer.cars.length === 1) state.carId = state.customer.cars[0].id;
                renderAll();
              });
            });
            const quickAddBtn = container.querySelector('#quick-add-customer-btn');
            quickAddBtn?.addEventListener('click', async () => {
              const name = quickAddBtn.dataset.name || q;
              const newCustomer = await api.post('/customers', { name });
              state.customer = await api.get(`/customers/${newCustomer.id}`);
              renderAll();
            });
          }, 250);
        });
        return;
      }

      container.querySelector('#change-customer-btn')?.addEventListener('click', () => {
        state.customer = null;
        state.carId = null;
        renderAll();
      });

      container.querySelector('#car-select')?.addEventListener('change', (e) => {
        state.carId = e.target.value;
      });

      container.querySelectorAll('[data-service-id]').forEach((cb) => {
        cb.addEventListener('change', (e) => {
          const id = e.target.dataset.serviceId;
          if (e.target.checked) state.selectedServiceIds.add(id);
          else state.selectedServiceIds.delete(id);
          renderAll();
        });
      });

      const partSearch = container.querySelector('#part-search');
      let partDebounce;
      partSearch?.addEventListener('input', (e) => {
        clearTimeout(partDebounce);
        partDebounce = setTimeout(async () => {
          const q = e.target.value.trim();
          if (!q) {
            container.querySelector('#part-results').innerHTML = '';
            return;
          }
          const results = await api.get(`/inventory?search=${encodeURIComponent(q)}`);
          container.querySelector('#part-results').innerHTML = results
            .map(
              (item) =>
                `<div class="list-item" data-pick-part='${JSON.stringify({ id: item.id, name: item.name, price: item.sell_price })}'>
                  <div class="main"><div class="title">${item.name}</div><div class="subtitle">Stok: ${item.stock_qty} · RM ${item.sell_price.toFixed(2)}</div></div>
                </div>`
            )
            .join('');
          container.querySelectorAll('[data-pick-part]').forEach((el) => {
            el.addEventListener('click', () => {
              const data = JSON.parse(el.dataset.pickPart);
              state.parts.push({ label: data.name, price: data.price, qty: 1, inventory_id: data.id, is_manual_item: false });
              partSearch.value = '';
              container.querySelector('#part-results').innerHTML = '';
              renderAll();
            });
          });
        }, 250);
      });

      container.querySelector('#manual-part-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = new FormData(e.target);
        state.parts.push({
          label: form.get('name'),
          price: Number(form.get('price')),
          qty: 1,
          is_manual_item: true,
          manual_item_name: form.get('name'),
        });
        renderAll();
      });

      container.querySelectorAll('[data-remove-part]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.parts.splice(Number(btn.dataset.removePart), 1);
          renderAll();
        });
      });

      container.querySelector('#payment-method')?.addEventListener('change', (e) => {
        state.paymentMethod = e.target.value;
      });

      container.querySelector('#submit-job-btn')?.addEventListener('click', async () => {
        const btn = container.querySelector('#submit-job-btn');
        btn.disabled = true;
        try {
          const job = await api.post('/jobs', {
            customer_id: state.customer.id,
            car_id: state.carId,
            services: [...state.selectedServiceIds].map((service_id) => ({ service_id })),
            parts: state.parts.map((p) =>
              p.is_manual_item
                ? { is_manual_item: true, manual_item_name: p.manual_item_name, price: p.price, qty: p.qty }
                : { inventory_id: p.inventory_id, qty: p.qty, price: p.price }
            ),
            payment_method: state.paymentMethod,
          });
          toast('Job berjaya disimpan!');
          navigate(`/jobs/${job.id}`);
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      });
    }

    renderAll();
  },
};
