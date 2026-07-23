export class Router {
  constructor(routes, { onNavigate } = {}) {
    this.routes = routes;
    this.onNavigate = onNavigate;
    window.addEventListener('hashchange', () => this.resolve());
    window.addEventListener('load', () => this.resolve());
  }

  navigate(path) {
    if (location.hash === `#${path}`) this.resolve();
    else location.hash = `#${path}`;
  }

  matchRoute(hashPath) {
    for (const route of this.routes) {
      const paramNames = [];
      const regexPath = route.pattern.replace(/:[^/]+/g, (m) => {
        paramNames.push(m.slice(1));
        return '([^/]+)';
      });
      const match = hashPath.match(new RegExp(`^${regexPath}$`));
      if (match) {
        const params = {};
        paramNames.forEach((name, i) => (params[name] = decodeURIComponent(match[i + 1])));
        return { route, params };
      }
    }
    return null;
  }

  async resolve() {
    const raw = (location.hash || '#/dashboard').slice(1) || '/dashboard';
    const [hashPath, queryString] = raw.split('?');
    const query = Object.fromEntries(new URLSearchParams(queryString || ''));
    const matched = this.matchRoute(hashPath);

    if (!matched) {
      this.navigate('/dashboard');
      return;
    }

    const { route, params } = matched;
    const mergedParams = { ...params, ...query };
    if (this.onNavigate) {
      const shouldContinue = this.onNavigate(route, mergedParams);
      if (shouldContinue === false) return;
    }

    const container = document.getElementById('app-content');
    container.innerHTML = '<div class="empty-state">Memuatkan…</div>';
    try {
      await route.view.render(container, mergedParams, (path) => this.navigate(path));
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div class="empty-state">Ralat: ${e.message || 'tidak diketahui'}</div>`;
    }
  }
}
