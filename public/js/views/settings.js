import { api, openBlobInNewTab } from '../api.js';
import { toast } from '../toast.js';

const TABS = [
  { key: 'profile', label: 'Profil' },
  { key: 'billing', label: 'Sst / Diskaun' },
  { key: 'services', label: 'Menu Servis' },
  { key: 'staff', label: 'Staf & Roles' },
];

export const settings = {
  auth: true,
  async render(container, params, navigate) {
    const activeTab = params.tab || 'profile';

    container.innerHTML = `
      <div class="tabs">
        ${TABS.map((t) => `<button data-tab="${t.key}" class="${t.key === activeTab ? 'active' : ''}">${t.label}</button>`).join('')}
      </div>
      <div id="tab-content"></div>
    `;

    container.querySelectorAll('.tabs button').forEach((btn) => {
      btn.addEventListener('click', () => navigate(`/settings?tab=${btn.dataset.tab}`));
    });

    const tabContent = container.querySelector('#tab-content');
    if (activeTab === 'profile') await renderProfile(tabContent, navigate);
    else if (activeTab === 'billing') await renderBilling(tabContent, navigate);
    else if (activeTab === 'services') await renderServices(tabContent, navigate);
    else if (activeTab === 'staff') await renderStaff(tabContent, navigate);
  },
};

async function renderProfile(container, navigate) {
  const company = await api.get('/company');

  container.innerHTML = `
    <div class="card" style="text-align:center;">
      <div style="display:flex;gap:1rem;justify-content:center;">
        <div>
          <img id="logo-preview" src="${company.logo_url || ''}" style="width:80px;height:80px;object-fit:contain;background:var(--border);border-radius:var(--radius);display:block;" />
          <label class="btn secondary" style="margin-top:0.4rem;cursor:pointer;font-size:0.75rem;">Logo<input id="logo-input" type="file" accept="image/png,image/jpeg,image/webp" style="display:none;" /></label>
        </div>
        <div>
          <img id="letterhead-preview" src="${company.letterhead_url || ''}" style="width:80px;height:80px;object-fit:contain;background:var(--border);border-radius:var(--radius);display:block;" />
          <label class="btn secondary" style="margin-top:0.4rem;cursor:pointer;font-size:0.75rem;">Letterhead<input id="letterhead-input" type="file" accept="image/png,image/jpeg,image/webp" style="display:none;" /></label>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Profil Syarikat</h3>
      <form id="profile-form">
        <div class="field"><label>Nama</label><input name="name" value="${company.name}" /></div>
        <div class="field"><label>Telefon</label><input name="phone" value="${company.phone || ''}" /></div>
        <div class="field"><label>Alamat</label><textarea name="address">${company.address || ''}</textarea></div>
        <button class="btn full" type="submit">Kemaskini</button>
      </form>
    </div>

    <div class="card">
      <h3>Pelan Langganan</h3>
      <div class="line-item"><span>Pelan</span><span>${company.plan}</span></div>
      <div class="line-item"><span>Tarikh Renewal</span><span>${company.plan_renewal_date || '-'}</span></div>
    </div>
  `;

  container.querySelector('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api.patch('/company', { name: form.get('name'), phone: form.get('phone'), address: form.get('address') });
      toast('Profil dikemaskini');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  container.querySelector('#logo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await api.putBinary('/company/logo', await file.arrayBuffer(), file.type);
      toast('Logo dimuat naik');
      navigate('/settings?tab=profile');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  container.querySelector('#letterhead-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await api.putBinary('/company/letterhead', await file.arrayBuffer(), file.type);
      toast('Letterhead dimuat naik');
      navigate('/settings?tab=profile');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function renderBilling(container) {
  const company = await api.get('/company');
  container.innerHTML = `
    <div class="card">
      <h3>SST</h3>
      <form id="sst-form">
        <label class="checkbox-row" style="margin-bottom:0.6rem;"><input type="checkbox" name="sst_enabled" ${company.sst_enabled ? 'checked' : ''} /> Aktifkan SST</label>
        <div class="field"><label>Kadar SST (%)</label><input name="sst_rate" type="number" step="0.1" value="${company.sst_rate}" /></div>
        <button class="btn full" type="submit">Simpan</button>
      </form>
    </div>
    <div class="card">
      <h3>Diskaun / Promo</h3>
      <form id="discount-form">
        <label class="checkbox-row" style="margin-bottom:0.6rem;"><input type="checkbox" name="discount_enabled" ${company.discount_enabled ? 'checked' : ''} /> Aktifkan Diskaun</label>
        <div class="field"><label>Jenis</label>
          <select name="discount_type">
            <option value="percentage" ${company.discount_type === 'percentage' ? 'selected' : ''}>Peratus (%)</option>
            <option value="fixed" ${company.discount_type === 'fixed' ? 'selected' : ''}>Tetap (RM)</option>
          </select>
        </div>
        <div class="field"><label>Nilai</label><input name="discount_value" type="number" step="0.01" value="${company.discount_value || ''}" /></div>
        <button class="btn full" type="submit">Simpan</button>
      </form>
    </div>
    <div class="card">
      <h3>Konfigurasi Inventori</h3>
      <form id="inventory-config-form">
        <div class="field"><label>Stok Min Default</label><input name="default_min_stock" type="number" value="${company.default_min_stock}" /></div>
        <button class="btn full" type="submit">Simpan</button>
      </form>
    </div>
  `;

  container.querySelector('#sst-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api.patch('/company/settings', { sst_enabled: form.get('sst_enabled') === 'on', sst_rate: Number(form.get('sst_rate')) });
      toast('SST dikemaskini');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  container.querySelector('#discount-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api.patch('/company/settings', {
        discount_enabled: form.get('discount_enabled') === 'on',
        discount_type: form.get('discount_type'),
        discount_value: Number(form.get('discount_value')),
      });
      toast('Diskaun dikemaskini');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  container.querySelector('#inventory-config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api.patch('/company/settings', { default_min_stock: Number(form.get('default_min_stock')) });
      toast('Konfigurasi dikemaskini');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function renderServices(container, navigate) {
  const services = await api.get('/services?all=true');
  container.innerHTML = `
    <div class="card">
      ${
        services.length
          ? services
              .map(
                (s) => `
        <div class="list-item">
          <div class="main"><div class="title">${s.name} ${!s.active ? '<span class="badge neutral">Tidak Aktif</span>' : ''}</div><div class="subtitle">RM ${s.price.toFixed(2)}</div></div>
          <button class="btn secondary" data-toggle="${s.id}" data-active="${s.active}">${s.active ? 'Padam' : 'Aktifkan'}</button>
        </div>`
              )
              .join('')
          : '<div class="empty-state">Tiada servis lagi.</div>'
      }
    </div>
    <div class="card">
      <h3>Tambah Servis</h3>
      <form id="add-service-form">
        <div class="field"><label>Nama *</label><input name="name" required /></div>
        <div class="field"><label>Harga (RM) *</label><input name="price" type="number" step="0.01" required /></div>
        <button class="btn full" type="submit">Tambah</button>
      </form>
    </div>
  `;

  container.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const isActive = btn.dataset.active === '1' || btn.dataset.active === 'true';
        if (isActive) await api.delete(`/services/${btn.dataset.toggle}`);
        else await api.patch(`/services/${btn.dataset.toggle}`, { active: true });
        navigate('/settings?tab=services');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });

  container.querySelector('#add-service-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api.post('/services', { name: form.get('name'), price: Number(form.get('price')) });
      toast('Servis ditambah');
      navigate('/settings?tab=services');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

async function renderStaff(container, navigate) {
  const [staffList, roles] = await Promise.all([api.get('/staff'), api.get('/staff/roles')]);
  container.innerHTML = `
    <div class="card">
      ${staffList
        .map(
          (s) => `
        <div class="list-item">
          <div class="main"><div class="title">${s.name} ${!s.active ? '<span class="badge neutral">Tidak Aktif</span>' : ''}</div><div class="subtitle">${s.email} · ${s.role_name}</div></div>
        </div>`
        )
        .join('')}
    </div>

    <div class="card">
      <h3>Roles</h3>
      ${roles.map((r) => `<div class="line-item"><span>${r.name}</span><span>${r.is_system ? 'Default' : 'Custom'}</span></div>`).join('')}
      <form id="add-role-form" style="margin-top:0.8rem;" class="btn-row">
        <input name="name" placeholder="cth. Mekanik" style="flex:1;padding:0.6rem;border:1px solid var(--border);border-radius:var(--radius);" required />
        <button class="btn" type="submit">+ Role</button>
      </form>
    </div>

    <div class="card">
      <h3>Jemput Staf</h3>
      <form id="invite-staff-form">
        <div class="field"><label>Nama *</label><input name="name" required /></div>
        <div class="field"><label>Emel *</label><input name="email" type="email" required /></div>
        <div class="field"><label>Telefon</label><input name="phone" /></div>
        <div class="field"><label>Kata Laluan Sementara *</label><input name="password" type="password" minlength="8" required /></div>
        <div class="field"><label>Role</label>
          <select name="role_id">${roles.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select>
        </div>
        <button class="btn full" type="submit">Jemput</button>
      </form>
    </div>
  `;

  container.querySelector('#add-role-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api.post('/staff/roles', { name: form.get('name') });
      toast('Role ditambah');
      navigate('/settings?tab=staff');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  container.querySelector('#invite-staff-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    try {
      await api.post('/staff', {
        name: form.get('name'),
        email: form.get('email'),
        phone: form.get('phone') || undefined,
        password: form.get('password'),
        role_id: form.get('role_id'),
      });
      toast('Staf dijemput');
      navigate('/settings?tab=staff');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
