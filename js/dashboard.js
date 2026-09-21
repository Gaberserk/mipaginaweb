document.addEventListener('DOMContentLoaded', () => {
  const user = JSON.parse(localStorage.getItem('usuarioActivo') || 'null');

  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  const welcomeUser = document.getElementById('welcomeUser');
  const favoriteCount = document.getElementById('favoriteCount');
  const gamesList = document.getElementById('gamesList');
  const logoutBtn = document.getElementById('logoutBtn');

  welcomeUser.textContent = `Bienvenido, ${user.nombre}`;
  favoriteCount.textContent = '3';

  const juegos = [
    { nombre: 'Cyberpunk 2077', descripcion: 'Explora un mundo abierto lleno de desafíos y decisiones.', icono: '🎮' },
    { nombre: 'Fortnite', descripcion: 'Compite en partidas rápidas con estilo y estrategia.', icono: '🛡️' },
    { nombre: 'Minecraft', descripcion: 'Construye, explora y crea mundos infinitos.', icono: '🧱' }
  ];

  gamesList.innerHTML = juegos.map((juego) => `
    <article class="game-card">
      <div class="game-cover">${juego.icono}</div>
      <div class="game-content">
        <h3>${juego.nombre}</h3>
        <p>${juego.descripcion}</p>
      </div>
    </article>
  `).join('');

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('usuarioActivo');
    window.location.href = 'login.html';
  });
});
