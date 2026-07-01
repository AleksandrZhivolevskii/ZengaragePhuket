// netlify/functions/directory.js — база клиентов и машин
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    // ── GET: все клиенты с машинами ──────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const clients = (await pool.query(
        'SELECT id, name, phone, messenger, note FROM clients ORDER BY name'
      )).rows;
      const cars = (await pool.query(
        'SELECT id, client_id, make, model, vin, plate FROM cars ORDER BY id'
      )).rows;
      const byClient = {};
      cars.forEach(c => {
        (byClient[c.client_id] = byClient[c.client_id] || []).push({
          id: c.id, make: c.make, model: c.model, vin: c.vin, plate: c.plate,
        });
      });
      const result = clients.map(cl => ({ ...cl, cars: byClient[cl.id] || [] }));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, clients: result }) };
    }

    // ── POST: операции ───────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const op = body.op;

      if (op === 'upsertClient') {
        const c = body.client || {};
        if (!c.name || !c.name.trim()) {
          return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'name required' }) };
        }
        let id = c.id;
        if (id) {
          await pool.query(
            'UPDATE clients SET name=$1, phone=$2, messenger=$3, note=$4, updated_at=NOW() WHERE id=$5',
            [c.name, c.phone || null, c.messenger || null, c.note || null, id]
          );
        } else {
          id = (await pool.query(
            'INSERT INTO clients (name, phone, messenger, note) VALUES ($1,$2,$3,$4) RETURNING id',
            [c.name, c.phone || null, c.messenger || null, c.note || null]
          )).rows[0].id;
        }
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, id }) };
      }

      if (op === 'deleteClient') {
        await pool.query('DELETE FROM clients WHERE id=$1', [body.id]);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
      }

      if (op === 'upsertCar') {
        const c = body.car || {};
        if (!c.client_id) {
          return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'client_id required' }) };
        }
        let id = c.id;
        if (id) {
          await pool.query(
            'UPDATE cars SET make=$1, model=$2, vin=$3, plate=$4 WHERE id=$5',
            [c.make || null, c.model || null, c.vin || null, c.plate || null, id]
          );
        } else {
          id = (await pool.query(
            'INSERT INTO cars (client_id, make, model, vin, plate) VALUES ($1,$2,$3,$4,$5) RETURNING id',
            [c.client_id, c.make || null, c.model || null, c.vin || null, c.plate || null]
          )).rows[0].id;
        }
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, id }) };
      }

      if (op === 'deleteCar') {
        await pool.query('DELETE FROM cars WHERE id=$1', [body.id]);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
      }

      // Импорт из Excel: body.clients=[{name,phone,messenger,note,cars:[{make,model,vin,plate}]}]
      // replace=true → полностью заменяет базу
      if (op === 'import') {
        const rows = body.clients || [];
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          if (body.replace) await client.query('DELETE FROM clients');
          for (const cl of rows) {
            if (!cl.name || !cl.name.trim()) continue;
            const cid = (await client.query(
              'INSERT INTO clients (name, phone, messenger, note) VALUES ($1,$2,$3,$4) RETURNING id',
              [cl.name, cl.phone || null, cl.messenger || null, cl.note || null]
            )).rows[0].id;
            for (const car of (cl.cars || [])) {
              if (!car.make && !car.model && !car.vin && !car.plate) continue;
              await client.query(
                'INSERT INTO cars (client_id, make, model, vin, plate) VALUES ($1,$2,$3,$4,$5)',
                [cid, car.make || null, car.model || null, car.vin || null, car.plate || null]
              );
            }
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, imported: rows.length }) };
      }

      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'unknown op' }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('Directory Error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
