import { api, setSession } from '../api.js';
import { toast } from '../toast.js';

export const signup = {
  auth: false,
  render(container, params, navigate) {
    container.innerHTML = `
      <div class="center-screen">
        <div class="logo-title">🔧 JJU Workshop</div>
        <div class="card">
          <form id="signup-form">
            <div class="field">
              <label>Nama Workshop</label>
              <input type="text" name="workshop_name" required />
            </div>
            <div class="field">
              <label>No. Telefon</label>
              <input type="tel" name="phone" />
            </div>
            <div class="field">
              <label>Emel</label>
              <input type="email" name="email" required autocomplete="username" />
            </div>
            <div class="field">
              <label>Kata Laluan (min. 8 aksara)</label>
              <input type="password" name="password" required minlength="8" autocomplete="new-password" />
            </div>
            <button class="btn full" type="submit">Daftar & Mula</button>
          </form>
        </div>
        <div class="link-row">Dah ada akaun? <a href="#/login">Log masuk</a></div>
      </div>
    `;

    container.querySelector('#signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      const submitBtn = e.target.querySelector('button');
      submitBtn.disabled = true;
      try {
        const data = await api.post('/auth/signup', {
          workshop_name: form.get('workshop_name'),
          phone: form.get('phone') || undefined,
          email: form.get('email'),
          password: form.get('password'),
        });
        setSession(data.token, data);
        navigate('/dashboard');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  },
};
