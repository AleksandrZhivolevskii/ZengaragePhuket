// netlify/functions/auth.js — вход и управление аккаунтами сотрудников
const { Pool } = require('pg');
const crypto = require('crypto');
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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email           VARCHAR(200);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires   TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_attempts  INTEGER DEFAULT 0;
  `);
  ready = true;
}

// Достаёт пользователя из Bearer-токена (или null)
function currentUser(event) {
  const a = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  return a.startsWith('Bearer ') ? verify(a.slice(7)) : null;
}
const publicUser = r => ({ id: r.id, username: r.username, name: r.name, role: r.role, email: r.email || null });
const V = x => (x === undefined || x === '' ? null : x);
const maskEmail = e => { const [u, d] = String(e || '').split('@'); return d ? (u[0] || '') + '***@' + d : '***'; };
const clearReset = id => pool.query('UPDATE users SET reset_code_hash=NULL, reset_expires=NULL, reset_attempts=0 WHERE id=$1', [id]);

// Отправка письма с кодом через Resend (https://resend.com). Требует env RESEND_API_KEY.
async function sendResetEmail(to, name, code) {
  const from = process.env.RESET_FROM_EMAIL || 'Zen Garage <onboarding@resend.dev>';
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#132a24">
      <div style="font-size:13px;letter-spacing:.12em;color:#0fa47f;font-weight:700">ZEN GARAGE PHUKET</div>
      <h2 style="margin:8px 0 4px;font-size:20px">Восстановление пароля</h2>
      <p style="color:#5a7168;font-size:14px;margin:4px 0 18px">Здравствуйте, ${name || ''}! Ваш код для смены пароля:</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:.32em;background:#f4f8f6;border:1px solid #d6e2dc;border-radius:12px;padding:16px;text-align:center;color:#0a6b54">${code}</div>
      <p style="color:#5a7168;font-size:13px;margin:18px 0 0">Код действует 20 минут. Если вы не запрашивали смену пароля — просто проигнорируйте это письмо.</p>
    </div>`;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: 'Zen Garage — код восстановления пароля', html }),
  });
  if (!resp.ok) throw new Error('Email send failed: ' + (await resp.text()));
}

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
      const { username, password, name, email } = body;
      if (!username || !password) return J(400, { error: 'Нужны логин и пароль' });
      const r = (await pool.query(
        'INSERT INTO users (username, password_hash, name, role, email) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [username.trim().toLowerCase(), hash(password), name || username, 'admin', V(email)]
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

    // ── Восстановление пароля по email (без авторизации) ───────────────────────
    // Шаг 1: запросить код
    if (op === 'requestReset') {
      const login = String(body.login || '').trim().toLowerCase();
      if (!login) return J(400, { error: 'Введите логин или email' });
      const generic = { success: true, message: 'Если такой аккаунт существует и к нему привязан email — мы отправили код.' };
      const r = (await pool.query('SELECT * FROM users WHERE username=$1 OR lower(email)=$1', [login])).rows[0];
      if (!r || !r.email) return J(200, generic); // не раскрываем, есть ли аккаунт
      if (!process.env.RESEND_API_KEY) return J(503, { error: 'Email-сервис ещё не подключён. Обратитесь к администратору.' });
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const expires = new Date(Date.now() + 20 * 60 * 1000);
      await pool.query('UPDATE users SET reset_code_hash=$1, reset_expires=$2, reset_attempts=0 WHERE id=$3', [hash(code), expires, r.id]);
      await sendResetEmail(r.email, r.name || r.username, code);
      return J(200, { ...generic, sent: true, emailHint: maskEmail(r.email) });
    }

    // Шаг 2: подтвердить код и задать новый пароль
    if (op === 'confirmReset') {
      const login = String(body.login || '').trim().toLowerCase();
      const code = String(body.code || '').trim();
      const password = body.password;
      if (!login || !code || !password) return J(400, { error: 'Нужны логин, код и новый пароль' });
      const r = (await pool.query('SELECT * FROM users WHERE username=$1 OR lower(email)=$1', [login])).rows[0];
      if (!r || !r.reset_code_hash || !r.reset_expires) return J(400, { error: 'Код не запрашивался. Запросите заново.' });
      if (new Date(r.reset_expires).getTime() < Date.now()) { await clearReset(r.id); return J(400, { error: 'Код истёк. Запросите новый.' }); }
      if ((r.reset_attempts || 0) >= 5) { await clearReset(r.id); return J(400, { error: 'Слишком много попыток. Запросите новый код.' }); }
      if (!compare(code, r.reset_code_hash)) {
        await pool.query('UPDATE users SET reset_attempts=reset_attempts+1 WHERE id=$1', [r.id]);
        return J(400, { error: 'Неверный код' });
      }
      await pool.query('UPDATE users SET password_hash=$1, reset_code_hash=NULL, reset_expires=NULL, reset_attempts=0 WHERE id=$2', [hash(password), r.id]);
      return J(200, { success: true });
    }

    // Смена своего пароля (любой вошедший)
    if (op === 'changePassword') {
      const me = currentUser(event);
      if (!me) return J(401, { error: 'Не авторизован' });
      if (!body.password) return J(400, { error: 'Нужен новый пароль' });
      await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash(body.password), me.id]);
      return J(200, { success: true });
    }

    // Привязать/сменить свой email для восстановления (любой вошедший)
    if (op === 'setMyEmail') {
      const me = currentUser(event);
      if (!me) return J(401, { error: 'Не авторизован' });
      await pool.query('UPDATE users SET email=$1 WHERE id=$2', [V(body.email), me.id]);
      return J(200, { success: true, email: V(body.email) });
    }

    // ── Действия администратора ────────────────────────────────────────────
    const me = currentUser(event);
    if (!me || me.role !== 'admin') return J(403, { error: 'Только для администратора' });

    if (op === 'list') {
      const rows = (await pool.query('SELECT id, username, name, role, email, created_at FROM users ORDER BY created_at')).rows;
      return J(200, { success: true, users: rows });
    }
    if (op === 'create') {
      const { username, password, name, role, email } = body;
      if (!username || !password) return J(400, { error: 'Нужны логин и пароль' });
      try {
        const r = (await pool.query(
          'INSERT INTO users (username, password_hash, name, role, email) VALUES ($1,$2,$3,$4,$5) RETURNING id, username, name, role, email',
          [username.trim().toLowerCase(), hash(password), name || username, role === 'admin' ? 'admin' : 'staff', V(email)]
        )).rows[0];
        return J(200, { success: true, user: r });
      } catch (e) {
        if (String(e.message).includes('duplicate')) return J(409, { error: 'Такой логин уже занят' });
        throw e;
      }
    }
    if (op === 'setEmail') {
      if (!body.id) return J(400, { error: 'Нужен id' });
      await pool.query('UPDATE users SET email=$1 WHERE id=$2', [V(body.email), body.id]);
      return J(200, { success: true });
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
