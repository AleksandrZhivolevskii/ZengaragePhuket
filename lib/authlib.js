// lib/authlib.js — общие помощники авторизации (используются всеми функциями)
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Секрет для подписи токенов: отдельный JWT_SECRET, иначе из DATABASE_URL (он уже секретный и стабильный)
const SECRET = process.env.JWT_SECRET || process.env.DATABASE_URL || 'zg-dev-secret-change-me';

const sign = (payload) => jwt.sign(payload, SECRET, { expiresIn: '30d' });
const verify = (token) => { try { return jwt.verify(token, SECRET); } catch (e) { return null; } };

const hash = (pw) => bcrypt.hashSync(String(pw), 10);
const compare = (pw, h) => bcrypt.compareSync(String(pw), h || '');

// Проверка запроса: валидный Bearer-токен пользователя ИЛИ ключ агента (X-API-Key).
// Возвращает { ok, user? , agent? }.
function verifyAuth(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  if (auth.startsWith('Bearer ')) {
    const u = verify(auth.slice(7));
    if (u) return { ok: true, user: u };
  }
  const key = h['x-api-key'] || h['X-Api-Key'] || '';
  if (process.env.AGENT_API_KEY && key && key === process.env.AGENT_API_KEY) {
    return { ok: true, agent: true };
  }
  return { ok: false };
}

module.exports = { sign, verify, hash, compare, verifyAuth };
