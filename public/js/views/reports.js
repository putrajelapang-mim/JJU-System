import { api, openBlobInNewTab } from '../api.js';
import { toast } from '../toast.js';

const REPORT_TYPES = [
  { key: 'sales', label: 'Laporan Jualan' },
  { key: 'inventory', label: 'Laporan Stok' },
  { key: 'low-stock', label: 'Amaran Stok Rendah' },
  { key: 'pnl', label: 'Untung Rugi (P&L)' },
  { key: 'cashflow', label: 'Aliran Tunai' },
  { key: 'customers', label: 'Senarai Pelanggan' },
  { key: 'jobs', label: 'Sejarah Servis' },
  { key: 'daily-closing', label: 'Penutupan Harian' },
];

export const reportsHome = {
  auth: true,
  render(container, params, navigate) {
    container.innerHTML = `
      <div class="card">
        ${REPORT_TYPES.map(
          (r) => `<a class="list-item" href="#/reports/${r.key}"><div class="main"><div class="title">${r.label}</div></div><div class="trailing">›</div></a>`
        ).join('')}
      </div>
    `;
  },
};

export const reportDetail = {
  auth: true,
  async render(container, params, navigate) {
    const type = params.type;
    const label = REPORT_TYPES.find((r) => r.key === type)?.label || type;
    const needsDateRange = ['sales', 'pnl', 'cashflow', 'jobs'].includes(type);
    const needsDate = type === 'daily-closing';

    const buildQuery = () => {
      const q = new URLSearchParams();
      if (needsDateRange) {
        const from = container.querySelector('#from-input')?.value;
        const to = container.querySelector('#to-input')?.value;
        if (from) q.set('from', from);
        if (to) q.set('to', to);
      }
      if (needsDate) {
        const date = container.querySelector('#date-input')?.value;
        if (date) q.set('date', date);
      }
      return q.toString();
    };

    async function loadPreview() {
      const report = await api.get(`/reports/${type}?${buildQuery()}`);
      const previewEl = container.querySelector('#report-preview');
      previewEl.innerHTML = `
        <div class="card">
          ${report.summary.map((s) => `<div class="line-item"><span>${s.label}</span><span>${s.value}</span></div>`).join('')}
        </div>
        <div class="card" style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
            <thead><tr>${report.columns.map((c) => `<th style="text-align:left;padding:0.4rem;border-bottom:1px solid var(--border);">${c.label}</th>`).join('')}</tr></thead>
            <tbody>
              ${report.rows
                .map((row) => `<tr>${report.columns.map((c) => `<td style="padding:0.4rem;border-bottom:1px solid var(--border);">${row[c.key] ?? ''}</td>`).join('')}</tr>`)
                .join('') || `<tr><td colspan="${report.columns.length}" style="padding:0.6rem;color:var(--text-muted);">Tiada data.</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="card">
        <h3>${label}</h3>
        ${needsDateRange ? `<div class="btn-row"><div class="field"><label>Dari</label><input id="from-input" type="date" /></div><div class="field"><label>Hingga</label><input id="to-input" type="date" /></div></div>` : ''}
        ${needsDate ? `<div class="field"><label>Tarikh</label><input id="date-input" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>` : ''}
        ${needsDateRange || needsDate ? `<button class="btn secondary full" id="refresh-btn">Kemaskini Preview</button>` : ''}
      </div>

      <div id="report-preview"></div>

      <div class="card">
        <h3>Muat Turun / Hantar</h3>
        <div class="btn-row" style="margin-bottom:0.5rem;">
          <button class="btn full" id="download-pdf-btn">Download PDF</button>
          <button class="btn secondary full" id="download-csv-btn">Download Excel (CSV)</button>
        </div>
        <form id="whatsapp-form" class="btn-row">
          <input name="phone" type="tel" placeholder="No. telefon" style="flex:1;padding:0.6rem;border:1px solid var(--border);border-radius:var(--radius);" required />
          <button class="btn secondary" type="submit">Hantar WA</button>
        </form>
      </div>
    `;

    await loadPreview();

    container.querySelector('#refresh-btn')?.addEventListener('click', loadPreview);

    container.querySelector('#download-pdf-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const blob = await api.getBlob(`/reports/${type}/pdf?${buildQuery()}`);
        openBlobInNewTab(blob);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        e.target.disabled = false;
      }
    });

    container.querySelector('#download-csv-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        const blob = await api.getBlob(`/reports/${type}/csv?${buildQuery()}`);
        openBlobInNewTab(blob);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        e.target.disabled = false;
      }
    });

    container.querySelector('#whatsapp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      try {
        await api.post(`/reports/${type}/whatsapp`, { phone: form.get('phone') });
        toast('Laporan dalam giliran untuk dihantar via WhatsApp');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  },
};
