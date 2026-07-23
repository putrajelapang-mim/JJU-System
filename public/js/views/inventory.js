import { api } from '../api.js';
import { toast } from '../toast.js';

function itemRow(item) {
  return `
    <a class="list-item" href="#/inventory/${item.id}">
      <div class="main">
        <div class="title">${item.name}</div>
        <div class="subtitle">${item.sku || '-'} · Stok: ${item.stock_qty}</div>
      </div>
      <div class="trailing">
        RM ${Number(item.sell_price).toFixed(2)}
        ${item.low_stock ? '<div><span class="badge danger">Stok Rendah</span></div>' : ''}
      </div>
    </a>
  `;
}

export const inventoryList = {
  auth: true,
  async render(container, params, navigate) {
    const renderList = async (search) => {
      const list = await api.get(`/inventory${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      const listEl = container.querySelector('#inventory-list');
      listEl.innerHTML = list.length ? list.map(itemRow).join('') : '<div class="empty-state">Tiada item.</div>';
    };

    container.innerHTML = `
      <div class="search-bar"><input id="search-input" type="search" placeholder="Cari nama atau SKU…" /></div>
      <div class="card" id="inventory-list"></div>
      <button class="fab" id="add-item-btn" title="Tambah item">+</button>
    `;

    await renderList('');

    let debounce;
    container.querySelector('#search-input').addEventListener('input', (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(() => renderList(e.target.value), 250);
    });

    container.querySelector('#add-item-btn').addEventListener('click', () => navigate('/inventory/new'));
  },
};

export const inventoryNew = {
  auth: true,
  render(container, params, navigate) {
    container.innerHTML = `
      <div class="card">
        <h3>Item Baru</h3>
        <form id="new-item-form">
          <div class="field"><label>Nama *</label><input name="name" required /></div>
          <div class="field"><label>SKU</label><input name="sku" /></div>
          <div class="field"><label>Stok Awal</label><input name="stock_qty" type="number" value="0" /></div>
          <div class="field"><label>Stok Min (kosongkan untuk default)</label><input name="min_stock" type="number" /></div>
          <div class="field"><label>Harga Beli (RM)</label><input name="buy_price" type="number" step="0.01" /></div>
          <div class="field"><label>Harga Jual (RM) *</label><input name="sell_price" type="number" step="0.01" required /></div>
          <div class="btn-row">
            <button type="button" class="btn secondary full" id="cancel-btn">Batal</button>
            <button type="submit" class="btn full">Simpan</button>
          </div>
        </form>
      </div>
    `;

    container.querySelector('#cancel-btn').addEventListener('click', () => navigate('/inventory'));
    container.querySelector('#new-item-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      try {
        const item = await api.post('/inventory', {
          name: form.get('name'),
          sku: form.get('sku') || undefined,
          stock_qty: Number(form.get('stock_qty') || 0),
          min_stock: form.get('min_stock') ? Number(form.get('min_stock')) : undefined,
          buy_price: form.get('buy_price') ? Number(form.get('buy_price')) : undefined,
          sell_price: Number(form.get('sell_price')),
        });
        toast('Item ditambah');
        navigate(`/inventory/${item.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  },
};

export const inventoryDetail = {
  auth: true,
  async render(container, params, navigate) {
    const item = await api.get(`/inventory/${params.id}`);

    container.innerHTML = `
      <div class="card" style="text-align:center;">
        ${
          item.image_url
            ? `<img src="${item.image_url}" style="width:140px;height:140px;object-fit:cover;border-radius:var(--radius);" />`
            : `<div style="width:140px;height:140px;background:var(--border);border-radius:var(--radius);margin:0 auto;display:flex;align-items:center;justify-content:center;color:var(--text-muted);">Tiada Gambar</div>`
        }
        <div style="margin-top:0.6rem;">
          <label class="btn secondary" style="cursor:pointer;">
            Muat Naik Gambar
            <input id="image-input" type="file" accept="image/png,image/jpeg,image/webp" style="display:none;" />
          </label>
        </div>
      </div>

      <div class="card">
        <h3>${item.name} ${item.low_stock ? '<span class="badge danger">Stok Rendah</span>' : ''}</h3>
        <div class="line-item"><span>SKU</span><span>${item.sku || '-'}</span></div>
        <div class="line-item"><span>Stok Semasa</span><span>${item.stock_qty}</span></div>
        <div class="line-item"><span>Stok Min</span><span>${item.min_stock}</span></div>
        <div class="line-item"><span>Harga Beli</span><span>RM ${item.buy_price != null ? Number(item.buy_price).toFixed(2) : '-'}</span></div>
        <div class="line-item"><span>Harga Jual</span><span>RM ${Number(item.sell_price).toFixed(2)}</span></div>
      </div>

      <div class="card">
        <h3>Laraskan Stok</h3>
        <form id="adjust-form" class="btn-row">
          <input name="delta" type="number" placeholder="cth. -2 atau 10" required style="flex:1;padding:0.6rem 0.7rem;border:1px solid var(--border);border-radius:var(--radius);" />
          <button class="btn" type="submit">Laraskan</button>
        </form>
      </div>

      <div class="card">
        <h3>Edit Butiran</h3>
        <form id="edit-form">
          <div class="field"><label>Nama</label><input name="name" value="${item.name}" /></div>
          <div class="field"><label>SKU</label><input name="sku" value="${item.sku || ''}" /></div>
          <div class="field"><label>Stok Min</label><input name="min_stock" type="number" value="${item.min_stock}" /></div>
          <div class="field"><label>Harga Beli (RM)</label><input name="buy_price" type="number" step="0.01" value="${item.buy_price ?? ''}" /></div>
          <div class="field"><label>Harga Jual (RM)</label><input name="sell_price" type="number" step="0.01" value="${item.sell_price}" /></div>
          <button class="btn full" type="submit">Kemaskini</button>
        </form>
      </div>
    `;

    container.querySelector('#image-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        await api.putBinary(`/inventory/${item.id}/image`, buffer, file.type);
        toast('Gambar dimuat naik');
        navigate(`/inventory/${item.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    container.querySelector('#adjust-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      try {
        await api.post(`/inventory/${item.id}/adjust-stock`, { delta: Number(form.get('delta')) });
        toast('Stok dikemaskini');
        navigate(`/inventory/${item.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    container.querySelector('#edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      try {
        await api.patch(`/inventory/${item.id}`, {
          name: form.get('name'),
          sku: form.get('sku') || undefined,
          min_stock: Number(form.get('min_stock')),
          buy_price: form.get('buy_price') ? Number(form.get('buy_price')) : undefined,
          sell_price: Number(form.get('sell_price')),
        });
        toast('Item dikemaskini');
        navigate(`/inventory/${item.id}`);
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  },
};
