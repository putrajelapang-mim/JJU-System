import { api, openBlobInNewTab } from '../api.js';
import { toast } from '../toast.js';

const STATUS_LABELS = { dalam_kerja: 'Dalam Kerja', siap: 'Siap', dah_collect: 'Dah Collect' };
const STATUS_BADGE = { dalam_kerja: 'warning', siap: 'neutral', dah_collect: 'success' };

export const jobsBoard = {
  auth: true,
  async render(container, params, navigate) {
    const activeTab = params.status || 'dalam_kerja';

    const renderTab = async (status) => {
      const list = await api.get(`/jobs?status=${status}`);
      const listEl = container.querySelector('#jobs-list');
      listEl.innerHTML = list.length
        ? list
            .map(
              (j) => `
        <a class="list-item" href="#/jobs/${j.id}">
          <div class="main">
            <div class="title">${j.plate_no} — ${j.customer_name}</div>
            <div class="subtitle">${(j.services || []).join(', ') || '-'}</div>
          </div>
          <div class="trailing">
            RM ${Number(j.total).toFixed(2)}
            ${status === 'siap' && !j.notified_wa ? '<div><span class="badge warning">Belum Notify</span></div>' : ''}
          </div>
        </a>`
            )
            .join('')
        : '<div class="empty-state">Tiada job.</div>';
    };

    container.innerHTML = `
      <div class="tabs">
        ${['dalam_kerja', 'siap', 'dah_collect']
          .map((s) => `<button data-status="${s}" class="${s === activeTab ? 'active' : ''}">${STATUS_LABELS[s]}</button>`)
          .join('')}
      </div>
      <div class="card" id="jobs-list"></div>
      <a class="fab" href="#/pos" title="Punch sale baru">+</a>
    `;

    await renderTab(activeTab);

    container.querySelectorAll('.tabs button').forEach((btn) => {
      btn.addEventListener('click', () => navigate(`/jobs?status=${btn.dataset.status}`));
    });
  },
};

export const jobDetail = {
  auth: true,
  async render(container, params, navigate) {
    const job = await api.get(`/jobs/${params.id}`);

    const nextStatus = { dalam_kerja: 'siap', siap: 'dah_collect' }[job.status];

    container.innerHTML = `
      <div class="card">
        <h3>${job.plate_no} ${job.model ? `— ${job.model}` : ''}</h3>
        <div style="color:var(--text-muted);font-size:0.85rem;">${job.customer_name} · ${job.customer_phone || '-'}</div>
        <div style="margin-top:0.5rem;"><span class="badge ${STATUS_BADGE[job.status]}">${STATUS_LABELS[job.status]}</span></div>
      </div>

      <div class="card">
        <h3>Butiran</h3>
        ${job.services.map((s) => `<div class="line-item"><span>${s.name}</span><span>RM ${Number(s.price).toFixed(2)}</span></div>`).join('')}
        ${job.parts
          .map(
            (p) =>
              `<div class="line-item"><span>${p.manual_item_name || p.inventory_name} x${p.qty}</span><span>RM ${(p.price * p.qty).toFixed(2)}</span></div>`
          )
          .join('')}
        <div class="line-item"><span>Subtotal</span><span>RM ${Number(job.subtotal).toFixed(2)}</span></div>
        ${job.discount_amount > 0 ? `<div class="line-item"><span>Diskaun</span><span>-RM ${Number(job.discount_amount).toFixed(2)}</span></div>` : ''}
        ${job.sst_amount > 0 ? `<div class="line-item"><span>SST</span><span>RM ${Number(job.sst_amount).toFixed(2)}</span></div>` : ''}
        <div class="line-item total"><span>Jumlah</span><span>RM ${Number(job.total).toFixed(2)}</span></div>
        <div class="line-item"><span>Bayaran</span><span>${job.payment_status} ${job.payment_method ? `(${job.payment_method})` : ''}</span></div>
      </div>

      <div class="card">
        <div class="btn-row" style="margin-bottom:0.5rem;">
          ${nextStatus ? `<button class="btn full" id="advance-status-btn">Tandakan: ${STATUS_LABELS[nextStatus]}</button>` : ''}
          ${!job.notified_wa && job.status !== 'dalam_kerja' ? `<button class="btn secondary full" id="notify-wa-btn">Notify WA</button>` : ''}
        </div>
        ${
          job.payment_status !== 'dah_bayar'
            ? `<button class="btn secondary full" id="mark-paid-btn" style="margin-bottom:0.5rem;">Tandakan Dah Bayar</button>`
            : ''
        }
        <div class="btn-row">
          <button class="btn secondary full" data-doc="invoice">Jana Invois</button>
          <button class="btn secondary full" data-doc="resit">Jana Resit</button>
        </div>
      </div>
    `;

    if (nextStatus) {
      container.querySelector('#advance-status-btn').addEventListener('click', async () => {
        try {
          await api.patch(`/jobs/${job.id}/status`, { status: nextStatus });
          toast('Status dikemaskini');
          navigate(`/jobs/${job.id}`);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }

    const notifyBtn = container.querySelector('#notify-wa-btn');
    if (notifyBtn) {
      notifyBtn.addEventListener('click', async () => {
        try {
          const res = await api.post(`/jobs/${job.id}/notify-wa`);
          if (res.phone) window.open(`https://wa.me/${res.phone.replace(/[^0-9]/g, '')}`, '_blank');
          toast('Ditandakan sudah notify');
          navigate(`/jobs/${job.id}`);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }

    const paidBtn = container.querySelector('#mark-paid-btn');
    if (paidBtn) {
      paidBtn.addEventListener('click', async () => {
        try {
          await api.patch(`/jobs/${job.id}/payment`, { payment_status: 'dah_bayar' });
          toast('Ditandakan dah bayar');
          navigate(`/jobs/${job.id}`);
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    }

    container.querySelectorAll('[data-doc]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const doc = await api.post('/documents', { job_id: job.id, doc_type: btn.dataset.doc });
          const blob = await api.getBlob(doc.pdf_url.replace('/api', ''));
          openBlobInNewTab(blob);
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });
  },
};
