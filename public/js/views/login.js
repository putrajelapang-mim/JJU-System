import { api, setSession } from '../api.js';
import { toast } from '../toast.js';

export const login = {
  auth: false,
  render(container, params, navigate) {
    container.innerHTML = `
      <div class="center-screen">
        <div class="logo-title">🔧 JJU Workshop</div>
        <div class="card">
          <form id="login-form">
            <div class="field">
              <label>Emel</label>
              <input type="email" name="email" required autocomplete="username" />
            </div>
            <div class="field">
              <label>Kata Laluan</label>
              <input type="password" name="password" required autocomplete="current-password" />
            </div>
            <button class="btn full" type="submit">Log Masuk</button>
          </form>
        </div>
        <div class="link-row">Belum ada akaun? <a href="#/signup">Daftar workshop</a></div>
      </div>
    `;

    container.querySelector('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(e.target);
      const submitBtn = e.target.querySelector('button');
      submitBtn.disabled = true;
      try {
        const data = await api.post('/auth/login', {
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
