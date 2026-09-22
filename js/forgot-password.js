document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgotPasswordForm');
  const message = document.getElementById('formMessage');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = 'Enviando enlace...';

    try {
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('email').value.trim() })
      });
      const result = await response.json();
      message.textContent = result.message || 'Si existe una cuenta con ese correo, recibirás un enlace.';
      form.reset();
    } catch (error) {
      message.textContent = 'No se pudo conectar con el servidor. Intenta nuevamente.';
    }
  });
});
