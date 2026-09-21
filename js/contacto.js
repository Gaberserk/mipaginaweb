document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('authToken');

  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error('Sesión inválida');
    }
  } catch (error) {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
    return;
  }

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
  });
});
