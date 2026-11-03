// Login page. Depends on common.js (api, auth, showMessage, showError).

// Already logged in? Go straight to the console.
if (auth.getToken() && auth.getUser()) {
  window.location.href = '/';
}

document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('btn-login');
  button.disabled = true; // avoid double submits (and wasted rate-limit attempts)

  try {
    const res = await api('POST', '/auth/login', {
      username: document.getElementById('username').value,
      password: document.getElementById('password').value
    });
    auth.save(res.data.token, res.data.user);
    window.location.href = '/';
  } catch (err) {
    showError(err); // shows the server's message (e.g. the generic 401 or the 429 lockout)
    document.getElementById('password').value = '';
    button.disabled = false;
  }
});