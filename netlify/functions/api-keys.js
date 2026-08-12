const { Pool } = require('pg');
const crypto = require('crypto');
const { verifyAuth } = require('../../lib/authlib');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Cache-Control': 'no-store',
};
const J = (statusCode, body) => ({ statusCode, headers: CORS, body: JSON.stringify(body) });
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');

let ready = false;
async function ensureSchema() {
  if (ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      key_hash CHAR(64) UNIQUE NOT NULL,
      key_prefix VARCHAR(24) NOT NULL,
      scopes TEXT[] NOT NULL DEFAULT ARRAY['read','write'],
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS api_audit_log (
      id BIGSERIAL PRIMARY KEY,
      api_key_id BIGINT REFERENCES api_keys(id),
      api_key_name VARCHAR(120) NOT NULL,
      action VARCHAR(40) NOT NULL,
      resource VARCHAR(40) NOT NULL,
      resource_key TEXT,
      request_id UUID,
      ip_hash CHAR(64),
      before_data JSONB,
      after_data JSONB,
      success BOOLEAN NOT NULL DEFAULT TRUE,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS api_audit_log_created_idx ON api_audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS api_audit_log_key_idx ON api_audit_log(api_key_id, created_at DESC);
  `);
  ready = true;
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return J(200, {});
  if (event.httpMethod !== 'POST') return J(405, { success: false, error: 'POST only' });
  try {
    const auth = verifyAuth(event);
    if (!auth.ok || !auth.user || auth.user.role !== 'admin') return J(403, { success: false, error: 'Administrator access required' });
    await ensureSchema();
    const body = JSON.parse(event.body || '{}');

    if (body.op === 'list') {
      const rows = (await pool.query(`
        SELECT id,name,key_prefix,scopes,created_at,expires_at,last_used_at,revoked_at
        FROM api_keys ORDER BY created_at DESC
      `)).rows;
      return J(200, { success: true, keys: rows });
    }

    if (body.op === 'create') {
      const name = String(body.name || '').trim().slice(0, 120);
      if (!name) return J(400, { success: false, error: 'Key name is required' });
      const allowed = new Set(['read', 'write', 'delete']);
      const scopes = [...new Set((Array.isArray(body.scopes) ? body.scopes : ['read', 'write']).filter(x => allowed.has(x)))];
      if (!scopes.includes('read')) scopes.unshift('read');
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) return J(400, { success: false, error: 'Expiration date must be in the future' });
      const rawKey = 'zg_live_' + crypto.randomBytes(32).toString('base64url');
      const prefix = rawKey.slice(0, 16);
      const row = (await pool.query(`
        INSERT INTO api_keys(name,key_hash,key_prefix,scopes,created_by,expires_at)
        VALUES($1,$2,$3,$4,$5,$6)
        RETURNING id,name,key_prefix,scopes,created_at,expires_at
      `, [name, sha256(rawKey), prefix, scopes, auth.user.id || null, expiresAt])).rows[0];
      return J(201, { success: true, key: rawKey, record: row, warning: 'Save this key now. It will never be shown again.' });
    }

    if (body.op === 'revoke') {
      if (!body.id) return J(400, { success: false, error: 'Key id is required' });
      const row = (await pool.query('UPDATE api_keys SET revoked_at=COALESCE(revoked_at,NOW()) WHERE id=$1 RETURNING id,name,revoked_at', [body.id])).rows[0];
      if (!row) return J(404, { success: false, error: 'API key not found' });
      return J(200, { success: true, key: row });
    }

    if (body.op === 'audit') {
      const limit = Math.max(1, Math.min(500, Number(body.limit) || 100));
      const rows = (await pool.query(`
        SELECT id,api_key_name,action,resource,resource_key,request_id,before_data,after_data,success,error_message,created_at
        FROM api_audit_log ORDER BY created_at DESC LIMIT $1
      `, [limit])).rows;
      return J(200, { success: true, events: rows });
    }

    return J(400, { success: false, error: 'Unknown operation' });
  } catch (error) {
    console.error('API Keys Error:', error);
    return J(500, { success: false, error: 'Internal server error' });
  }
};
