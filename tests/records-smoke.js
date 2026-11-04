// Home page: shows links that match the login state and role. Depends on common.js.

const user = auth.getUser();
const links = document.getElementById('home-links');

if (!auth.getToken() || !user) {
  links.append(el('a', { class: 'btn primary', href: '/login.html' }, 'Log in'));
} else {
  renderTopbar();
  links.append(
    el('a', { class: 'btn primary', href: '/applications.html' }, 'Applications'),
    el('a', { class: 'btn primary', href: '/applicants.html' }, 'Applicants'),
    el('a', { class: 'btn primary', href: '/programs.html' }, 'Scholarship programs'));
  if (user.role === 'admin') {
    links.append(el('a', { class: 'btn primary', href: '/users.html' }, 'Users (admin)'));
  }
}