document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('authToken');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  try {
    const userResponse = await fetch(`${API_URL}/api/auth/me`, { headers });

    if (!userResponse.ok) {
      throw new Error('Sesión inválida');
    }

    const { user } = await userResponse.json();
    document.getElementById('welcomeUser').textContent = `Bienvenido, ${user.name}`;

    const gamesResponse = await fetch(`${API_URL}/api/games`, { headers });
    if (!gamesResponse.ok) {
      throw new Error('No se pudieron cargar los juegos');
    }

    const { games } = await gamesResponse.json();
    document.getElementById('favoriteCount').textContent = String(games.length).padStart(2, '0');
    const gamesGrid = document.getElementById('gamesGrid');
    gamesGrid.replaceChildren();

    games.forEach((game, index) => {
      const number = String(index + 1).padStart(2, '0');
      const card = document.createElement('article');
      card.className = `game-card game-card-${index + 1}`;

      const cover = document.createElement('div');
      cover.className = 'game-cover';
      cover.style.backgroundImage = `linear-gradient(0deg, rgba(8, 13, 16, 0.72), transparent), url("${game.imagen}")`;
      const coverNumber = document.createElement('span');
      coverNumber.textContent = number;
      cover.append(coverNumber);

      const content = document.createElement('div');
      content.className = 'game-content';
      const tag = document.createElement('span');
      tag.className = 'game-tag';
      tag.textContent = game.categoria;
      const title = document.createElement('h3');
      title.textContent = game.nombre;
      const description = document.createElement('p');
      description.textContent = game.descripcion;
      const link = document.createElement('a');
      link.className = 'game-link';
      link.href = game.enlace;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Descargar / jugar ↗';

      content.append(tag, title, description, link);
      card.append(cover, content);
      gamesGrid.append(card);
    });
  } catch (error) {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
  }

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
  });
});
