document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('authToken');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    const [userResponse, gamesResponse] = await Promise.all([
      fetch(`${API_URL}/api/auth/me`, { headers }),
      fetch(`${API_URL}/api/games`, { headers })
    ]);

    if (!userResponse.ok || !gamesResponse.ok) {
      throw new Error('Sesión inválida');
    }

    const { user } = await userResponse.json();
    const { games } = await gamesResponse.json();
    document.getElementById('welcomeUser').textContent = `Bienvenido, ${user.name}`;
    document.getElementById('favoriteCount').textContent = String(games.length);
    document.getElementById('gamesList').innerHTML = games.map((juego) => `
      <article class="game-card">
        <div class="game-cover">GAME</div>
        <div class="game-content">
          <h3>${juego.nombre}</h3>
          <p>${juego.descripcion}</p>
          <span class="game-link">Ver detalle</span>
        </div>
      </article>
    `).join('');
  } catch (error) {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
  }

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
  });
});
