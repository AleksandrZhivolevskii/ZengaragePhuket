// netlify/functions/staff.js
const { Pool } = require('pg');
const { verifyAuth } = require('../../lib/authlib');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  try {
    const _a = verifyAuth(event);
    if (!_a.ok) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
    if (event.httpMethod === 'GET') {
      const { rows } = await pool.query(
        'SELECT config_json FROM staff_config ORDER BY updated_at DESC LIMIT 1'
      );
      if (!rows.length) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, staff: null }) };
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, staff: rows[0].config_json }) };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const staff = body.staff;
      if (!staff) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'staff required' }) };

      const existing = await pool.query('SELECT id FROM staff_config ORDER BY updated_at DESC LIMIT 1');
      if (existing.rows.length) {
        await pool.query(
          'UPDATE staff_config SET config_json=$1, updated_at=NOW() WHERE id=$2',
          [JSON.stringify(staff), existing.rows[0].id]
        );
      } else {
        await pool.query('INSERT INTO staff_config (config_json) VALUES ($1)', [JSON.stringify(staff)]);
      }

      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('Staff Function Error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
