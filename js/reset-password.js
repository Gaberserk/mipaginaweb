document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('resetPasswordForm');
  const message = document.getElementById('formMessage');
  const token = new URLSearchParams(window.location.search).get('token') || '';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password.length < 6) {
      message.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }

    if (password !== confirmPassword) {
      message.textContent = 'Las contraseñas no coinciden.';
      return;
    }

    message.textContent = 'Guardando contraseña...';

    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const result = await response.json();
      message.textContent = result.message || result.error || 'No se pudo cambiar la contraseña.';

      if (response.ok) {
        form.reset();
        setTimeout(() => { window.location.href = 'login.html'; }, 1400);
      }
    } catch (error) {
      message.textContent = 'No se pudo conectar con el servidor. Intenta nuevamente.';
    }
  });
});
