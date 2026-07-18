// netlify/functions/directory.js — база клиентов и машин
const { Pool } = require('pg');
const { verifyAuth } = require('../../lib/authlib');

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

// Гарантирует, что таблицы и колонки существуют (идемпотентно, безопасно).
let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone           VARCHAR(50);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS email           VARCHAR(200);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS messenger       VARCHAR(120);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS note            TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS type            VARCHAR(20) DEFAULT 'individual';
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_person  VARCHAR(200);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_number      VARCHAR(80);
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_address TEXT;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    CREATE TABLE IF NOT EXISTS cars (id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE);
    ALTER TABLE cars ADD COLUMN IF NOT EXISTS make         VARCHAR(120);
    ALTER TABLE cars ADD COLUMN IF NOT EXISTS model        VARCHAR(120);
    ALTER TABLE cars ADD COLUMN IF NOT EXISTS submodel     VARCHAR(120);
    ALTER TABLE cars ADD COLUMN IF NOT EXISTS year         VARCHAR(10);
    ALTER TABLE cars ADD COLUMN IF NOT EXISTS fuel         VARCHAR(40);
    ALTER TABLE cars ADD COLUMN IF NOT EXISTS vin          VARCHAR(60);
    ALTER TABLE cars ADD COLUMN IF NOT EXISTS plate        VARCHAR(40);
    ALTER TABLE cars ADD COLUMN IF NOT EXISTS drivetrain   VARCHAR(40);
    ALTER TABLE cars ADD COLUMN IF NOT EXISTS transmission VARCHAR(40);
    ALTER TABLE cars ADD COLUMN IF NOT EXISTS bodytype     VARCHAR(40);
    ALTER TABLE cars ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_cars_client ON cars(client_id);
  `);
  schemaReady = true;
}

const norm      = s => (s == null ? '' : String(s)).trim().toLowerCase().replace(/\s+/g, ' ');
const normPhone = s => (s == null ? '' : String(s)).replace(/\D/g, '');
const normVin   = s => (s == null ? '' : String(s)).trim().toUpperCase();
const clientKey = c => norm(c.name) + '|' + normPhone(c.phone);
const V = x => (x === undefined || x === '' ? null : x);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const _a = verifyAuth(event);
    if (!_a.ok) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
    await ensureSchema();

    // ── GET: все клиенты с машинами ──────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const clients = (await pool.query(
        `SELECT id, name, phone, email, messenger, note, type,
                contact_person AS "contactPerson",
                tax_number AS "taxNumber", company_address AS "companyAddress"
         FROM clients ORDER BY name`
      )).rows;
      const cars = (await pool.query(
        'SELECT id, client_id, make, model, submodel, year, fuel, vin, plate, drivetrain, transmission, bodytype FROM cars ORDER BY id'
      )).rows;
      const byClient = {};
      cars.forEach(c => {
        (byClient[c.client_id] = byClient[c.client_id] || []).push({
          id: c.id, make: c.make, model: c.model, submodel: c.submodel, year: c.year,
          fuel: c.fuel, vin: c.vin, plate: c.plate, drivetrain: c.drivetrain,
          transmission: c.transmission, bodytype: c.bodytype,
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
        const typ = c.type === 'company' ? 'company' : 'individual';
        const vals = [c.name, V(c.phone), V(c.email), V(c.messenger), V(c.note), typ, V(c.contactPerson), V(c.taxNumber), V(c.companyAddress)];
        let id = c.id;
        if (id) {
          await pool.query(
            `UPDATE clients SET name=$1, phone=$2, email=$3, messenger=$4, note=$5, type=$6,
                    contact_person=$7, tax_number=$8, company_address=$9, updated_at=NOW() WHERE id=$10`,
            [...vals, id]
          );
        } else {
          id = (await pool.query(
            `INSERT INTO clients (name, phone, email, messenger, note, type, contact_person, tax_number, company_address)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            vals
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
        const cv = [V(c.make), V(c.model), V(c.submodel), V(c.year), V(c.fuel), V(c.vin), V(c.plate), V(c.drivetrain), V(c.transmission), V(c.bodytype)];
        let id = c.id;
        if (id) {
          await pool.query(
            `UPDATE cars SET make=$1, model=$2, submodel=$3, year=$4, fuel=$5, vin=$6, plate=$7,
                    drivetrain=$8, transmission=$9, bodytype=$10 WHERE id=$11`,
            [...cv, id]
          );
        } else {
          id = (await pool.query(
            `INSERT INTO cars (make, model, submodel, year, fuel, vin, plate, drivetrain, transmission, bodytype, client_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [...cv, c.client_id]
          )).rows[0].id;
        }
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, id }) };
      }

      if (op === 'deleteCar') {
        await pool.query('DELETE FROM cars WHERE id=$1', [body.id]);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
      }

      // ── ИМПОРТ с дедупликацией ───────────────────────────────────────────
      // body.clients = [{name,type,contactPerson,phone,email,...,cars:[{...,vin,plate}]}]
      // body.mode = 'add'  → добавлять только новых, дубли пропускать
      //             'upsert' → добавлять новых и обновлять совпавших
      // Дубль клиента: имя+телефон. Дубль машины: VIN (или клиент+гос.номер, если VIN пуст).
      if (op === 'import') {
        const rows = body.clients || [];
        const mode = body.mode === 'upsert' ? 'upsert' : 'add';
        const stats = { clientsAdded: 0, clientsUpdated: 0, carsAdded: 0, carsUpdated: 0, carsSkipped: 0 };
        const db = await pool.connect();
        try {
          await db.query('BEGIN');
          // Загружаем существующие
          const exClients = (await db.query('SELECT id, name, phone FROM clients')).rows;
          const exCars = (await db.query('SELECT id, client_id, vin, plate FROM cars')).rows;
          const cMap = new Map();       // name|phone -> id
          exClients.forEach(c => cMap.set(clientKey(c), c.id));
          const vinMap = new Map();     // VIN -> car id (глобально)
          const platMap = new Map();    // clientId|plate -> car id
          exCars.forEach(c => {
            if (c.vin) vinMap.set(normVin(c.vin), c.id);
            if (c.plate) platMap.set(c.client_id + '|' + norm(c.plate), c.id);
          });

          for (const cl of rows) {
            if (!cl.name || !cl.name.trim()) continue;
            const key = clientKey(cl);
            let cid = cMap.get(key);
            const typ = cl.type === 'company' ? 'company' : 'individual';
            const cvals = [cl.name, V(cl.phone), V(cl.email), V(cl.messenger), V(cl.note), typ, V(cl.contactPerson), V(cl.taxNumber), V(cl.companyAddress)];
            if (cid) {
              if (mode === 'upsert') {
                await db.query(
                  `UPDATE clients SET name=$1, phone=$2, email=$3, messenger=$4, note=$5, type=$6,
                          contact_person=$7, tax_number=$8, company_address=$9, updated_at=NOW() WHERE id=$10`,
                  [...cvals, cid]
                );
                stats.clientsUpdated++;
              }
            } else {
              cid = (await db.query(
                `INSERT INTO clients (name, phone, email, messenger, note, type, contact_person, tax_number, company_address)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
                cvals
              )).rows[0].id;
              cMap.set(key, cid);
              stats.clientsAdded++;
            }

            for (const car of (cl.cars || [])) {
              const hasData = car.make || car.model || car.vin || car.plate || car.year;
              if (!hasData) continue;
              const vinK = normVin(car.vin);
              const platK = cid + '|' + norm(car.plate);
              let existId = vinK ? vinMap.get(vinK) : (car.plate ? platMap.get(platK) : null);
              const carv = [V(car.make), V(car.model), V(car.submodel), V(car.year), V(car.fuel), V(car.vin), V(car.plate), V(car.drivetrain), V(car.transmission), V(car.bodytype)];
              if (existId) {
                if (mode === 'upsert') {
                  await db.query(
                    `UPDATE cars SET make=$1, model=$2, submodel=$3, year=$4, fuel=$5, vin=$6, plate=$7,
                            drivetrain=$8, transmission=$9, bodytype=$10 WHERE id=$11`,
                    [...carv, existId]
                  );
                  stats.carsUpdated++;
                } else {
                  stats.carsSkipped++;
                }
              } else {
                const newId = (await db.query(
                  `INSERT INTO cars (make, model, submodel, year, fuel, vin, plate, drivetrain, transmission, bodytype, client_id)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
                  [...carv, cid]
                )).rows[0].id;
                if (vinK) vinMap.set(vinK, newId);
                if (car.plate) platMap.set(platK, newId);
                stats.carsAdded++;
              }
            }
          }
          await db.query('COMMIT');
        } catch (e) {
          await db.query('ROLLBACK');
          throw e;
        } finally {
          db.release();
        }
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, ...stats }) };
      }

      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'unknown op' }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    console.error('Directory Error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
