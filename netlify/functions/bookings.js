// netlify/functions/bookings.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  try {
    // ── GET ──────────────────────────────────────────────────────────────
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const fromDate = params.from || new Date(Date.now() - 30*86400000).toISOString().split('T')[0];
      const toDate   = params.to   || new Date(Date.now() + 90*86400000).toISOString().split('T')[0];

      const { rows } = await pool.query(`
        SELECT staff_id, slot_id, date::text, client, car, work, status, notes,
               start_h, end_h, dur, color, multi_group, is_continuation,
               slot_index, total_slots, booking_days
        FROM bookings
        WHERE date BETWEEN $1 AND $2
        ORDER BY date, start_h
      `, [fromDate, toDate]);

      const result = {};
      rows.forEach(r => {
        const [y, mo, d] = r.date.split('-').map(Number);
        const key = `${r.staff_id}__${y}-${mo}-${d}__${r.slot_id}`;
        result[key] = {
          client: r.client, car: r.car, work: r.work, status: r.status,
          notes: r.notes, startH: parseFloat(r.start_h), endH: parseFloat(r.end_h),
          dur: parseFloat(r.dur), color: r.color,
          multiGroup: r.multi_group, isContinuation: r.is_continuation,
          slotIndex: r.slot_index, totalSlots: r.total_slots, bookingDays: r.booking_days,
        };
      });

      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, bookings: result }) };
    }

    // ── POST ─────────────────────────────────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const bookings = body.bookings;
      if (!bookings?.length) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'bookings array required' }) };
      }

      for (const { key, data } of bookings) {
        const [staffId, dateRaw, slotId] = key.split('__');
        const parts = dateRaw.split('-');
        const date = `${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;

        await pool.query(`
          INSERT INTO bookings
            (staff_id, slot_id, date, client, car, work, status, notes,
             start_h, end_h, dur, color, multi_group, is_continuation,
             slot_index, total_slots, booking_days)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          ON CONFLICT (staff_id, slot_id, date) DO UPDATE SET
            client=EXCLUDED.client, car=EXCLUDED.car, work=EXCLUDED.work,
            status=EXCLUDED.status, notes=EXCLUDED.notes,
            start_h=EXCLUDED.start_h, end_h=EXCLUDED.end_h, dur=EXCLUDED.dur,
            color=EXCLUDED.color, multi_group=EXCLUDED.multi_group,
            is_continuation=EXCLUDED.is_continuation, slot_index=EXCLUDED.slot_index,
            total_slots=EXCLUDED.total_slots, booking_days=EXCLUDED.booking_days,
            updated_at=NOW()
        `, [
          staffId, slotId, date,
          data.client, data.car||null, data.work||null, data.status||'confirmed', data.notes||null,
          data.startH||null, data.endH||null, data.dur||null, data.color||null,
          data.multiGroup||null, data.isContinuation||false,
          data.slotIndex||0, data.totalSlots||1, data.bookingDays||1,
        ]);
      }

      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, saved: bookings.length }) };
    }

    // ── DELETE ───────────────────────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const body = JSON.parse(event.body || '{}');
      const key = body.key;
      if (!key) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'key required' }) };

      const [staffId, dateRaw, slotId] = key.split('__');
      const parts = dateRaw.split('-');
      const date = `${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;

      await pool.query('DELETE FROM bookings WHERE staff_id=$1 AND slot_id=$2 AND date=$3', [staffId, slotId, date]);

      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Function Error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
