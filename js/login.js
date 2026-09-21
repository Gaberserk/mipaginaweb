document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const result = await response.json();

      if (!response.ok) {
        alert(result.error || 'No se pudo iniciar sesión.');
        return;
      }

      localStorage.setItem('authToken', result.token);
      window.location.href = 'dashboard.html';
    } catch (error) {
      alert('No se pudo conectar con el servidor.');
    }
  });
});
