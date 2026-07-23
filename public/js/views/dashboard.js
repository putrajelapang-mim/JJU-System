import { api, getSession } from '../api.js';

const CHECKLIST_LABELS = {
  logo: 'Muat naik logo syarikat',
  service_menu: 'Tambah menu servis',
  staff: 'Jemput staf lain',
  inventory: 'Tambah item inventori',
};
const CHECKLIST_LINKS = {
  logo: '#/settings',
  service_menu: '#/settings',
  staff: '#/settings',
  inventory: '#/inventory',
};

export const dashboard = {
  auth: true,
  async render(container) {
    const session = getSession();
    const data = await api.get('/dashboard');
    const checklistPending = Object.entries(data.setup_checklist).filter(([, done]) => !done);

    container.innerHTML = `
      <div class="section-title">Selamat kembali</div>
      <div class="card" style="margin-bottom:1rem;">
        <div style="font-size:1.1rem;font-weight:700;">${session?.role || ''}</div>
        <div style="color:var(--text-muted);font-size:0.85rem;">Ringkasan hari ini</div>
      </div>

      <div class="stat-grid">
        <div class="stat-tile"><div class="value">RM ${Number(data.sales_today).toFixed(2)}</div><div class="label">Jualan Hari Ini</div></div>
        <div class="stat-tile"><div class="value">${data.jobs_in_progress}</div><div class="label">Dalam Kerja</div></div>
        <div class="stat-tile"><div class="value">${data.jobs_ready}</div><div class="label">Siap (Belum Ambil)</div></div>
        <div class="stat-tile"><div class="value">${data.low_stock_count}</div><div class="label">Stok Rendah</div></div>
      </div>

      <div class="section-title">Akses Pantas</div>
      <div class="btn-row" style="margin-bottom:0.5rem;">
        <a class="btn full" href="#/pos">+ Punch Sale</a>
        <a class="btn secondary full" href="#/bookings">+ Booking</a>
      </div>

      ${
        data.notifications.jobs_ready_not_notified.length > 0
          ? `
        <div class="section-title">Job Siap, Belum Notify</div>
        <div class="card">
          ${data.notifications.jobs_ready_not_notified
            .map(
              (j) => `
            <a class="list-item" href="#/jobs/${j.id}">
              <div class="main"><div class="title">${j.plate_no}</div><div class="subtitle">${j.customer_name}</div></div>
              <div class="trailing"><span class="badge warning">Belum Notify</span></div>
            </a>`
            )
            .join('')}
        </div>`
          : ''
      }

      ${
        data.notifications.low_stock_items.length > 0
          ? `
        <div class="section-title">Amaran Stok Rendah</div>
        <div class="card">
          ${data.notifications.low_stock_items
            .map(
              (i) => `
            <a class="list-item" href="#/inventory/${i.id}">
              <div class="main"><div class="title">${i.name}</div></div>
              <div class="trailing"><span class="badge danger">${i.stock_qty}/${i.min_stock}</span></div>
            </a>`
            )
            .join('')}
        </div>`
          : ''
      }

      ${
        checklistPending.length > 0
          ? `
        <div class="section-title">Setup Belum Lengkap</div>
        <div class="card">
          ${checklistPending
            .map(
              ([key]) => `
            <a href="${CHECKLIST_LINKS[key]}" class="checklist-item"><span class="dot"></span> ${CHECKLIST_LABELS[key]}</a>`
            )
            .join('')}
        </div>`
          : ''
      }
    `;
  },
};
