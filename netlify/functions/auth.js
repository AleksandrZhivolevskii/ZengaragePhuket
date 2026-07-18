// netlify/functions/auth.js — вход и управление аккаунтами сотрудников
const { Pool } = require('pg');
const { sign, verify, hash, compare } = require('../../lib/authlib');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
const J = (code, obj) => ({ statusCode: code, headers: CORS, body: JSON.stringify(obj) });

let ready = false;
async function ensureSchema() {
  if (ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name VARCHAR(200),
      role VARCHAR(20) DEFAULT 'staff',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  ready = true;
}

// Достаёт пользователя из Bearer-токена (или null)
function currentUser(event) {
  const a = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  return a.startsWith('Bearer ') ? verify(a.slice(7)) : null;
}
const publicUser = r => ({ id: r.id, username: r.username, name: r.name, role: r.role });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return J(405, { error: 'POST only' });

  try {
    await ensureSchema();
    const body = JSON.parse(event.body || '{}');
    const op = body.op;

    // Есть ли вообще пользователи (для экрана первого запуска)
    if (op === 'status') {
      const n = (await pool.query('SELECT COUNT(*)::int AS c FROM users')).rows[0].c;
      return J(200, { success: true, hasUsers: n > 0 });
    }

    // Создание первого администратора (только если пользователей ещё нет)
    if (op === 'bootstrap') {
      const n = (await pool.query('SELECT COUNT(*)::int AS c FROM users')).rows[0].c;
      if (n > 0) return J(403, { error: 'Администратор уже существует' });
      const { username, password, name } = body;
      if (!username || !password) return J(400, { error: 'Нужны логин и пароль' });
      const r = (await pool.query(
        'INSERT INTO users (username, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING *',
        [username.trim().toLowerCase(), hash(password), name || username, 'admin']
      )).rows[0];
      return J(200, { success: true, token: sign(publicUser(r)), user: publicUser(r) });
    }

    // Вход
    if (op === 'login') {
      const { username, password } = body;
      const r = (await pool.query('SELECT * FROM users WHERE username=$1', [String(username || '').trim().toLowerCase()])).rows[0];
      if (!r || !compare(password, r.password_hash)) return J(401, { error: 'Неверный логин или пароль' });
      return J(200, { success: true, token: sign(publicUser(r)), user: publicUser(r) });
    }

    // Смена своего пароля (любой вошедший)
    if (op === 'changePassword') {
      const me = currentUser(event);
      if (!me) return J(401, { error: 'Не авторизован' });
      if (!body.password) return J(400, { error: 'Нужен новый пароль' });
      await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash(body.password), me.id]);
      return J(200, { success: true });
    }

    // ── Действия администратора ────────────────────────────────────────────
    const me = currentUser(event);
    if (!me || me.role !== 'admin') return J(403, { error: 'Только для администратора' });

    if (op === 'list') {
      const rows = (await pool.query('SELECT id, username, name, role, created_at FROM users ORDER BY created_at')).rows;
      return J(200, { success: true, users: rows });
    }
    if (op === 'create') {
      const { username, password, name, role } = body;
      if (!username || !password) return J(400, { error: 'Нужны логин и пароль' });
      try {
        const r = (await pool.query(
          'INSERT INTO users (username, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id, username, name, role',
          [username.trim().toLowerCase(), hash(password), name || username, role === 'admin' ? 'admin' : 'staff']
        )).rows[0];
        return J(200, { success: true, user: r });
      } catch (e) {
        if (String(e.message).includes('duplicate')) return J(409, { error: 'Такой логин уже занят' });
        throw e;
      }
    }
    if (op === 'resetPassword') {
      if (!body.id || !body.password) return J(400, { error: 'Нужны id и пароль' });
      await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash(body.password), body.id]);
      return J(200, { success: true });
    }
    if (op === 'delete') {
      if (body.id === me.id) return J(400, { error: 'Нельзя удалить себя' });
      await pool.query('DELETE FROM users WHERE id=$1', [body.id]);
      return J(200, { success: true });
    }

    return J(400, { error: 'unknown op' });
  } catch (err) {
    console.error('Auth Error:', err);
    return J(500, { success: false, error: err.message });
  }
};
