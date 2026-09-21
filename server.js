const path = require('path');
const fs = require('fs');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const app = express();
const port = Number(process.env.PORT) || 3000;
const jwtSecret = process.env.JWT_SECRET || 'gamehub-development-secret';
const dataDirectory = path.join(__dirname, 'data');

fs.mkdirSync(dataDirectory, { recursive: true });

const database = new Database(path.join(dataDirectory, 'gamehub.sqlite'));
database.pragma('journal_mode = WAL');
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json());
app.use(express.static(__dirname));

function createToken(user) {
  return jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '2h' });
}

function authenticate(request, response, next) {
  const authorization = request.get('authorization');
  const token = authorization && authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';

  if (!token) {
    return response.status(401).json({ error: 'Autenticación requerida.' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = database.prepare('SELECT id, name, email FROM users WHERE id = ?').get(payload.userId);

    if (!user) {
      return response.status(401).json({ error: 'La sesión ya no es válida.' });
    }

    request.user = user;
    return next();
  } catch (error) {
    return response.status(401).json({ error: 'La sesión ya no es válida.' });
  }
}

app.post('/api/auth/register', (request, response) => {
  const { nombre, email, password } = request.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (typeof nombre !== 'string' || nombre.trim().length < 2) {
    return response.status(400).json({ error: 'El nombre no es válido.' });
  }

  if (!normalizedEmail || typeof password !== 'string' || password.length < 6) {
    return response.status(400).json({ error: 'Correo o contraseña no válidos.' });
  }

  const passwordHash = bcrypt.hashSync(password, 12);

  try {
    const result = database
      .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(nombre.trim(), normalizedEmail, passwordHash);
    const user = { id: result.lastInsertRowid, name: nombre.trim(), email: normalizedEmail };

    return response.status(201).json({ user, token: createToken(user) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return response.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }

    console.error('Error al registrar usuario:', error);
    return response.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
});

app.post('/api/auth/login', (request, response) => {
  const { email, password } = request.body;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const user = database.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

  if (!user || typeof password !== 'string' || !bcrypt.compareSync(password, user.password_hash)) {
    return response.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }

  const publicUser = { id: user.id, name: user.name, email: user.email };
  return response.json({ user: publicUser, token: createToken(publicUser) });
});

app.get('/api/auth/me', authenticate, (request, response) => {
  response.json({ user: request.user });
});

app.get('/api/games', authenticate, (request, response) => {
  response.json({
    games: [
      { nombre: 'Cyberpunk 2077', descripcion: 'Explora un mundo abierto lleno de desafíos y decisiones.' },
      { nombre: 'Fortnite', descripcion: 'Compite en partidas rápidas con estilo y estrategia.' },
      { nombre: 'Minecraft', descripcion: 'Construye, explora y crea mundos infinitos.' }
    ]
  });
});

app.listen(port, () => {
  console.log(`GameHub disponible en http://localhost:${port}`);
});
