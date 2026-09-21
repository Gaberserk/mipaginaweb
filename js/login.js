document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    const storedUser = JSON.parse(localStorage.getItem('registroUsuario') || 'null');

    if (!storedUser) {
      alert('No hay una cuenta registrada. Primero crea una cuenta.');
      window.location.href = 'registro.html';
      return;
    }

    if (storedUser.email !== email || storedUser.password !== password) {
      alert('Correo o contraseña incorrectos.');
      return;
    }

    localStorage.setItem('usuarioActivo', JSON.stringify({
      nombre: storedUser.nombre,
      email: storedUser.email
    }));

    window.location.href = 'dashboard.html';
  });
});
