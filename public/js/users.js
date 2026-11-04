// Users test console (admin only). Depends on common.js.

const $ = (id) => document.getElementById(id);

const me = auth.guard(['admin']); // non-admins are sent back to the home page
renderTopbar();

const formatDate = (iso) => (iso ? String(iso).slice(0, 10) : '');

async function loadUsers() {
  try {
    const res = await api('GET', '/users?limit=100');
    renderUsers(res.data.items);
  } catch (err) {
    showError(err);
  }
}

function renderUsers(users) {
  const body = $('users-body');
  body.replaceChildren();
  if (users.length === 0) {
    body.append(el('tr', {}, el('td', { class: 'empty', colspan: 6 }, 'No users.')));
  }
  for (const u of users) {
    body.append(el('tr', {},
      el('td', {}, el('strong', {}, u.username), me && u.id === me.id ? el('div', { class: 'sub' }, 'you') : ''),
      el('td', {}, u.fullName),
      el('td', {}, el('span', { class: 'tag' }, u.role)),
      el('td', {}, el('span', { class: 'tag ' + (u.isActive ? '' : 'inactive') }, u.isActive ? 'active' : 'inactive')),
      el('td', {}, formatDate(u.createdAt)),
      el('td', { class: 'actions' },
        el('button', { class: 'btn small', type: 'button', onclick: () => openForm(u) }, 'Edit'))
    ));
  }
}

function clearErrors() {
  $('user-errors').hidden = true;
  $('user-errors').replaceChildren();
}

function showFormErrors(err) {
  const box = $('user-errors');
  box.replaceChildren(el('strong', {}, err.message));
  if (err.errors && err.errors.length) {
    box.append(el('ul', {}, err.errors.map((e) => el('li', {}, `${e.field}: ${e.message}`))));
  }
  box.hidden = false;
}

function openForm(user) {
  clearErrors();
  $('user-form').reset();
  $('user-id').value = user ? user.id : '';
  $('user-dialog-title').textContent = user ? 'Edit user' : 'New user';

  // Username can only be chosen when creating. Password is optional when editing.
  $('u-username').disabled = Boolean(user);
  $('u-password-label').textContent = user ? 'New password (leave blank to keep the current one)' : 'Password';
  $('u-active-field').hidden = !user;

  if (user) {
    $('u-username').value = user.username;
    $('u-fullname').value = user.fullName;
    $('u-role').value = user.role;
    $('u-active').checked = user.isActive;
  }
  $('user-dialog').showModal();
}

$('user-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  const id = $('user-id').value;

  try {
    let res;
    if (id) {
      const body = {
        fullName: $('u-fullname').value,
        role: $('u-role').value,
        isActive: $('u-active').checked
      };
      if ($('u-password').value) body.password = $('u-password').value;
      res = await api('PATCH', '/users/' + id, body);
    } else {
      res = await api('POST', '/users', {
        username: $('u-username').value,
        password: $('u-password').value,
        fullName: $('u-fullname').value,
        role: $('u-role').value
      });
    }
    $('user-dialog').close();
    showMessage(res.message);
    await loadUsers();
  } catch (err) {
    showFormErrors(err); // dialog stays open so the admin can fix the input
  }
});

$('btn-user-cancel').addEventListener('click', () => $('user-dialog').close());
$('btn-new').addEventListener('click', () => openForm(null));

if (me) loadUsers();