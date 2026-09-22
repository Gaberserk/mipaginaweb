const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT) || 3000;
const jwtSecret = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production' ? '' : 'local-development-secret-change-me-32-chars'
);
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const dataDirectory = path.join(__dirname, 'data');
const resetEmailFrom = process.env.RESET_EMAIL_FROM || process.env.SMTP_USER;
const mailTransport = process.env.SMTP_HOST && resetEmailFrom
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  })
  : null;

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
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
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

function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function sendPasswordResetEmail(email, resetUrl) {
  if (!mailTransport) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`Enlace de recuperación para ${email}: ${resetUrl}`);
    }
    return;
  }

  await mailTransport.sendMail({
    from: resetEmailFrom,
    to: email,
    subject: 'Restablecer contraseña de GameHub',
    text: `Solicitaste cambiar tu contraseña de GameHub. Abre este enlace antes de una hora:\n\n${resetUrl}\n\nSi no fuiste tú, ignora este correo.`,
    html: `<p>Solicitaste cambiar tu contraseña de GameHub.</p><p><a href="${resetUrl}">Crear una nueva contraseña</a></p><p>Este enlace vence en una hora. Si no fuiste tú, ignora este correo.</p>`
  });
}

async function findUserByEmail(email) {
  if (postgres) {
    const result = await postgres.query('SELECT id, name, email FROM users WHERE LOWER(email) = $1', [email]);
    return result.rows[0];
  }

  return sqlite.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
}

async function createPasswordResetToken(user) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  if (postgres) {
    await postgres.query('DELETE FROM password_reset_tokens WHERE user_id = $1 OR expires_at < NOW()', [user.id]);
    await postgres.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );
  } else {
    sqlite.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at < ?').run(user.id, expiresAt.toISOString());
    sqlite.prepare(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)'
    ).run(user.id, tokenHash, expiresAt.toISOString());
  }

  return rawToken;
}

async function resetPasswordWithToken(rawToken, passwordHash) {
  const tokenHash = hashResetToken(rawToken);

  if (postgres) {
    const client = await postgres.connect();
    try {
      await client.query('BEGIN');
      const tokenResult = await client.query(
        'SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE',
        [tokenHash]
      );
      if (!tokenResult.rows[0]) {
        await client.query('ROLLBACK');
        return false;
      }

      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, tokenResult.rows[0].user_id]);
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1', [tokenHash]);
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const reset = sqlite.transaction(() => {
    const token = sqlite.prepare(
      'SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?'
    ).get(tokenHash, new Date().toISOString());
    if (!token) return false;

    sqlite.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, token.user_id);
    sqlite.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?').run(new Date().toISOString(), tokenHash);
    return true;
  });

  return reset();
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

app.post('/api/auth/forgot-password', async (request, response) => {
  const normalizedEmail = typeof request.body.email === 'string'
    ? request.body.email.trim().toLowerCase()
    : '';
  const genericResponse = {
    message: 'Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.'
  };

  if (!normalizedEmail) {
    return response.json(genericResponse);
  }

  try {
    const user = await findUserByEmail(normalizedEmail);
    if (user) {
      const rawToken = await createPasswordResetToken(user);
      const resetUrl = `${frontendUrl.replace(/\/$/, '')}/reset-password.html?token=${encodeURIComponent(rawToken)}`;
      await sendPasswordResetEmail(user.email, resetUrl);
    }
  } catch (error) {
    console.error('Error al solicitar recuperación de contraseña:', error);
  }

  return response.json(genericResponse);
});

app.post('/api/auth/reset-password', async (request, response) => {
  const { token, password } = request.body;

  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    return response.status(400).json({ error: 'El enlace de recuperación no es válido.' });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return response.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 12);
    const updated = await resetPasswordWithToken(token, passwordHash);
    if (!updated) {
      return response.status(400).json({ error: 'El enlace no es válido o ya venció.' });
    }

    return response.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (error) {
    console.error('Error al cambiar la contraseña:', error);
    return response.status(503).json({ error: 'No se pudo cambiar la contraseña.' });
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
