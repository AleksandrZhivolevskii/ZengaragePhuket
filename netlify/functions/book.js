// netlify/functions/book.js — простое создание брони для внешнего агента
// POST { staffId, date:"YYYY-MM-DD", slotId, client, car?, work?, status?, notes?, clientId?, carId? }
const { Pool } = require('pg');
const { verifyAuth } = require('../../lib/authlib');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const pad = n => String(n).padStart(2, '0');
const err = (code, msg) => ({ statusCode: code, headers: CORS, body: JSON.stringify({ success: false, error: msg }) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return err(405, 'POST only');

  try {
    const _a = verifyAuth(event);
    if (!_a.ok) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
    const b = JSON.parse(event.body || '{}');
    const { staffId, date, slotId } = b;
    if (!staffId || !date || !slotId) return err(400, 'Нужны поля: staffId, date, slotId');
    if (!b.client || !String(b.client).trim()) return err(400, 'Нужно поле: client (имя)');

    // Конфигурация мастеров → время/цвет слота
    const cfgRow = (await pool.query('SELECT config_json FROM staff_config ORDER BY updated_at DESC LIMIT 1')).rows[0];
    const staffList = (cfgRow && cfgRow.config_json) || [];
    const staff = staffList.find(s => s.id === staffId);
    if (!staff) return err(400, `Неизвестный мастер: ${staffId}`);
    const slot = (staff.slots || []).find(sl => sl.id === slotId);
    if (!slot) return err(400, `У мастера ${staffId} нет слота ${slotId}`);

    // Проверка рабочего дня
    const parts = String(date).split('-');
    if (parts.length !== 3) return err(400, 'date должно быть в формате YYYY-MM-DD');
    const dd = `${parts[0]}-${pad(parts[1])}-${pad(parts[2])}`;
    const dow = (((new Date(dd + 'T12:00:00Z').getUTCDay()) + 6) % 7) + 1;
    if (!(staff.workDays || []).includes(dow)) return err(400, `Мастер ${staffId} не работает в этот день`);

    // Схема (на всякий случай)
    await pool.query(`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_id INTEGER;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS car_id INTEGER;
    `);

    // Занят ли слот
    const ex = await pool.query('SELECT status FROM bookings WHERE staff_id=$1 AND slot_id=$2 AND date=$3', [staffId, slotId, dd]);
    if (ex.rows.length && ex.rows[0].status !== 'cancelled') {
      return err(409, 'Слот уже занят');
    }

    const startH = slot.startTime;
    const endH = slot.startTime + slot.hours;
    const work = (b.work && String(b.work).trim()) || slot.label;
    const status = ['confirmed', 'pending', 'cancelled'].includes(b.status) ? b.status : 'confirmed';

    await pool.query(`
      INSERT INTO bookings
        (staff_id, slot_id, date, client, car, work, status, notes,
         start_h, end_h, dur, color, slot_index, total_slots, booking_days, client_id, car_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,1,1,$13,$14)
      ON CONFLICT (staff_id, slot_id, date) DO UPDATE SET
        client=EXCLUDED.client, car=EXCLUDED.car, work=EXCLUDED.work, status=EXCLUDED.status,
        notes=EXCLUDED.notes, start_h=EXCLUDED.start_h, end_h=EXCLUDED.end_h, dur=EXCLUDED.dur,
        color=EXCLUDED.color, client_id=EXCLUDED.client_id, car_id=EXCLUDED.car_id, updated_at=NOW()
    `, [
      staffId, slotId, dd, String(b.client).trim(), b.car || null, work, status, b.notes || null,
      startH, endH, slot.hours, slot.color || null, b.clientId || null, b.carId || null,
    ]);

    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({ success: true, booked: { staffId, date: dd, slotId, startH, endH, work, status, client: String(b.client).trim() } }),
    };
  } catch (e) {
    console.error('Book Error:', e);
    return err(500, e.message);
  }
};
