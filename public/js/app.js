import { Router } from './router.js';
import { getToken, clearSession, getSession } from './api.js';
import { login } from './views/login.js';
import { signup } from './views/signup.js';
import { dashboard } from './views/dashboard.js';
import { customersList, customerNew, customerDetail } from './views/customers.js';
import { inventoryList, inventoryNew, inventoryDetail } from './views/inventory.js';
import { jobsBoard, jobDetail } from './views/jobs.js';
import { pos } from './views/pos.js';
import { bookingsList, bookingNew, bookingDetail } from './views/bookings.js';
import { documentsList } from './views/documents.js';
import { reportsHome, reportDetail } from './views/reports.js';
import { settings } from './views/settings.js';

const routes = [
  { pattern: '/login', view: login },
  { pattern: '/signup', view: signup },
  { pattern: '/dashboard', view: dashboard, nav: 'dashboard' },
  { pattern: '/pos', view: pos, nav: 'pos' },
  { pattern: '/jobs', view: jobsBoard, nav: 'jobs' },
  { pattern: '/jobs/:id', view: jobDetail, nav: 'jobs' },
  { pattern: '/customers', view: customersList, nav: 'customers' },
  { pattern: '/customers/new', view: customerNew, nav: 'customers' },
  { pattern: '/customers/:id', view: customerDetail, nav: 'customers' },
  { pattern: '/inventory', view: inventoryList, nav: 'inventory' },
  { pattern: '/inventory/new', view: inventoryNew, nav: 'inventory' },
  { pattern: '/inventory/:id', view: inventoryDetail, nav: 'inventory' },
  { pattern: '/bookings', view: bookingsList, nav: 'more' },
  { pattern: '/bookings/new', view: bookingNew, nav: 'more' },
  { pattern: '/bookings/:id', view: bookingDetail, nav: 'more' },
  { pattern: '/documents', view: documentsList, nav: 'more' },
  { pattern: '/reports', view: reportsHome, nav: 'more' },
  { pattern: '/reports/:type', view: reportDetail, nav: 'more' },
  { pattern: '/settings', view: settings, nav: 'more' },
];

const NAV_ITEMS = [
  { key: 'dashboard', path: '/dashboard', icon: '🏠', label: 'Dashboard' },
  { key: 'pos', path: '/pos', icon: '🧾', label: 'POS' },
  { key: 'jobs', path: '/jobs', icon: '🔧', label: 'Jobs' },
  { key: 'customers', path: '/customers', icon: '👤', label: 'CRM' },
  { key: 'more', path: '/settings', icon: '☰', label: 'Lagi' },
];

const header = document.getElementById('app-header');
const bottomNav = document.getElementById('app-bottom-nav');

function renderBottomNav(activeKey) {
  bottomNav.innerHTML = NAV_ITEMS.map(
    (item) =>
      `<a href="#${item.path}" class="${item.key === activeKey ? 'active' : ''}"><span class="icon">${item.icon}</span>${item.label}</a>`
  ).join('');
}

function renderHeader(route) {
  const showAuthUi = !!getToken();
  header.innerHTML = `
    <span>JJU Workshop</span>
    ${
      showAuthUi
        ? `<div class="header-actions"><a href="#/reports" title="Laporan" style="color:#fff;text-decoration:none;">📊</a><span id="logout-btn" style="cursor:pointer;">⏻</span></div>`
        : ''
    }
  `;
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearSession();
      router.navigate('/login');
    });
  }
}

const router = new Router(routes, {
  onNavigate(route) {
    const hasToken = !!getToken();
    const isGuestOnlyRoute = route.pattern === '/login' || route.pattern === '/signup';

    if (route.view.auth && !hasToken) {
      router.navigate('/login');
      return false;
    }
    if (isGuestOnlyRoute && hasToken) {
      router.navigate('/dashboard');
      return false;
    }

    renderHeader(route);
    if (hasToken && route.nav) {
      bottomNav.style.display = 'flex';
      renderBottomNav(route.nav);
    } else {
      bottomNav.style.display = 'none';
    }
  },
});

router.resolve();
