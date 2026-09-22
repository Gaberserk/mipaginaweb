const path = require('path');
const fs = require('fs');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT) || 3000;
const jwtSecret = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production' ? '' : 'local-development-secret-change-me-32-chars'
);
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const dataDirectory = path.join(__dirname, 'data');

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET debe existir y tener al menos 32 caracteres.');
}

fs.mkdirSync(dataDirectory, { recursive: true });

const sqlite = process.env.DATABASE_URL
  ? null
  : new (require('better-sqlite3'))(path.join(dataDirectory, 'gamehub.sqlite'));
const postgres = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

if (postgres) {
  postgres.on('error', (error) => {
    console.error('Error inesperado del pool de PostgreSQL:', error);
  });
}

if (sqlite) {
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function initializeDatabase() {
  if (postgres) {
    await postgres.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
}

app.use(cors({ origin: frontendUrl }));
app.use(express.json());
app.use('/data', (request, response) => {
  response.sendStatus(404);
});
app.use(express.static(__dirname));

app.get('/api/health', (request, response) => {
  response.json({ status: 'ok' });
});

function createToken(user) {
  return jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '2h' });
}

async function findUserById(id) {
  if (postgres) {
    const result = await postgres.query('SELECT id, name, email FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }

  return sqlite.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id);
}

async function authenticate(request, response, next) {
  const authorization = request.get('authorization');
  const token = authorization && authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';

  if (!token) {
    return response.status(401).json({ error: 'Autenticación requerida.' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await findUserById(payload.userId);

    if (!user) {
      return response.status(401).json({ error: 'La sesión ya no es válida.' });
    }

    request.user = user;
    return next();
  } catch (error) {
    return response.status(401).json({ error: 'La sesión ya no es válida.' });
  }
}

app.post('/api/auth/register', async (request, response) => {
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
    let user;
    if (postgres) {
      const result = await postgres.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
        [nombre.trim(), normalizedEmail, passwordHash]
      );
      user = result.rows[0];
    } else {
      const result = sqlite
        .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
        .run(nombre.trim(), normalizedEmail, passwordHash);
      user = { id: result.lastInsertRowid, name: nombre.trim(), email: normalizedEmail };
    }

    return response.status(201).json({ user, token: createToken(user) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === '23505') {
      return response.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }

    console.error('Error al registrar usuario:', error);
    return response.status(500).json({ error: 'No se pudo crear la cuenta.' });
  }
});

app.post('/api/auth/login', async (request, response) => {
  try {
    const { email, password } = request.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const result = postgres
      ? await postgres.query('SELECT * FROM users WHERE LOWER(email) = $1', [normalizedEmail])
      : null;
    const user = postgres
      ? result.rows[0]
      : sqlite.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

    if (!user || typeof password !== 'string' || !bcrypt.compareSync(password, user.password_hash)) {
      return response.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const publicUser = { id: user.id, name: user.name, email: user.email };
    return response.json({ user: publicUser, token: createToken(publicUser) });
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    return response.status(503).json({ error: 'El servicio de autenticación no está disponible.' });
  }
});

app.get('/api/auth/me', authenticate, (request, response) => {
  response.json({ user: request.user });
});

const games = [
  {
    nombre: 'DESTROY ZOMBIES',
    categoria: 'Survival · Acción',
    descripcion: 'Sobrevive a oleadas de zombies, administra tus recursos y consigue la extracción.',
    imagen: 'assets/images/destroy-zombies.jpg',
    enlace: 'https://developerberserk.itch.io/destroy-zombies'
  },
  {
    nombre: 'Escuela Maldita',
    categoria: 'Puzzle · Terror',
    descripcion: 'Completa tus tareas en una escuela abandonada mientras una presencia acecha cada rincón.',
    imagen: 'assets/images/escuela-maldita.jpg',
    enlace: 'https://developerberserk.itch.io/escuela-maldita'
  },
  {
    nombre: 'Ecos del Matadero',
    categoria: 'Survival · Horror',
    descripcion: 'Adéntrate en un mundo de terror psicológico donde cada paso puede ser el último.',
    imagen: 'assets/images/ecos-del-matadero.jpg',
    enlace: 'https://developerberserk.itch.io/ecos-del-matadero/purchase'
  },
  {
    nombre: 'DECAY',
    categoria: 'Platformer · Acción',
    descripcion: 'Acompaña a Alice entre castillos, cuevas y hordas de criaturas en un mundo decadente.',
    imagen: 'assets/images/decay.jpg',
    enlace: 'https://developerberserk.itch.io/decay/purchase'
  },
  {
    nombre: 'Las Aventuras de Tipiriki',
    categoria: 'Platformer · Aventura',
    descripcion: 'Ayuda a Tipiriki a recuperar el Cristal del Tiempo y devolver el equilibrio a Lumaria.',
    imagen: 'assets/images/tipiriki.jpg',
    enlace: 'https://developerberserk.itch.io/las-aventuras-de-tipiriki'
  },
  {
    nombre: 'The Adventures of Kuro',
    categoria: 'Platformer · Shooter',
    descripcion: 'Avanza por niveles nostálgicos, elimina enemigos y supera obstáculos con Kuro.',
    imagen: 'assets/images/kuro.jpg',
    enlace: 'https://developerberserk.itch.io/the-adventures-of-kuro/purchase'
  },
  {
    nombre: 'Aprender a programar',
    categoria: 'Educativo · GDScript',
    descripcion: 'Proyecto de preguntas para aprender conceptos de programación de videojuegos y GDScript.',
    imagen: 'assets/images/aprender-a-programar.jpg',
    enlace: 'https://developerberserk.itch.io/aprender-a-programar'
  },
  {
    nombre: 'doomdanger',
    categoria: 'Experimental · Gratis',
    descripcion: 'Un proyecto experimental de DeveloperBerserk para explorar nuevas ideas de juego.',
    imagen: 'assets/images/doom-lang.jpg',
    enlace: 'https://developerberserk.itch.io/doom-lang'
  }
];

app.get('/api/games', authenticate, (request, response) => {
  response.json({ games });
});

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`GameHub disponible en http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo inicializar la base de datos:', error);
    process.exit(1);
  });
