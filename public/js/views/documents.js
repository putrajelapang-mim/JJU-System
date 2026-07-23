import { api, openBlobInNewTab } from '../api.js';
import { toast } from '../toast.js';

const TYPE_LABELS = { quotation: 'Sebut Harga', invoice: 'Invois', resit: 'Resit' };

export const documentsList = {
  auth: true,
  async render(container, params, navigate) {
    const activeType = params.type || '';

    async function renderList(type) {
      const list = await api.get(`/documents${type ? `?doc_type=${type}` : ''}`);
      const listEl = container.querySelector('#doc-list');
      listEl.innerHTML = list.length
        ? list
            .map(
              (d) => `
        <div class="list-item">
          <div class="main"><div class="title">${d.doc_number}</div><div class="subtitle">${TYPE_LABELS[d.doc_type]} · ${d.created_at.slice(0, 10)}</div></div>
          <button class="btn secondary" data-download="${d.id}" data-url="${d.pdf_url}">Muat Turun</button>
        </div>`
            )
            .join('')
        : '<div class="empty-state">Tiada dokumen lagi. Jana dari halaman job.</div>';

      listEl.querySelectorAll('[data-download]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const blob = await api.getBlob(btn.dataset.url.replace('/api', ''));
            openBlobInNewTab(blob);
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            btn.disabled = false;
          }
        });
      });
    }

    container.innerHTML = `
      <div class="tabs">
        <button data-type="" class="${activeType === '' ? 'active' : ''}">Semua</button>
        <button data-type="quotation" class="${activeType === 'quotation' ? 'active' : ''}">Sebut Harga</button>
        <button data-type="invoice" class="${activeType === 'invoice' ? 'active' : ''}">Invois</button>
        <button data-type="resit" class="${activeType === 'resit' ? 'active' : ''}">Resit</button>
      </div>
      <div class="card" id="doc-list"></div>
    `;

    await renderList(activeType);

    container.querySelectorAll('.tabs button').forEach((btn) => {
      btn.addEventListener('click', () => navigate(`/documents${btn.dataset.type ? `?type=${btn.dataset.type}` : ''}`));
    });
  },
};
