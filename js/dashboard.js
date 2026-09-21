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
    document.getElementById('favoriteCount').textContent = '0';
  } catch (error) {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
  }

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
  });
});
