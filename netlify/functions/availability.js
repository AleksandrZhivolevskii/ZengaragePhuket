// netlify/functions/availability.js — свободные слоты мастеров для внешнего агента
// GET /.netlify/functions/availability?from=YYYY-MM-DD&to=YYYY-MM-DD&staff=<id?>&onlyFree=1?
const { Pool } = require('pg');
const { verifyAuth } = require('../../lib/authlib');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fmtH = h => `${pad(Math.floor(h))}:${(h % 1) === 0.5 ? '30' : '00'}`;
// понедельник=1 … воскресенье=7
const dow = dateStr => (((new Date(dateStr + 'T12:00:00Z').getUTCDay()) + 6) % 7) + 1;

// Дефолтная конфигурация, если в БД её нет (совпадает с приложением)
const DEFAULT_STAFF = [
  { id:'leg', name:'Лег', role:'Механик', workDays:[1,2,3,4,5,6], slots:[
    {id:'l1',label:'ТО — слот 1',startTime:9,hours:1.5,eff:true},{id:'l2',label:'ТО — слот 2',startTime:10.5,hours:1.5,eff:true},
    {id:'l3',label:'Мех. работы 1',startTime:13,hours:1,eff:true},{id:'l4',label:'Мех. работы 2',startTime:15,hours:1,eff:true},
    {id:'l5',label:'Мех. работы 3',startTime:17,hours:1,eff:true},{id:'l6',label:'Буфер',startTime:14,hours:1,eff:false}]},
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'GET only' }) };

  try {
    const _a = verifyAuth(event);
    if (!_a.ok) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
    const p = event.queryStringParameters || {};
    const from = p.from || iso(new Date());
    const to   = p.to   || iso(new Date(Date.now() + 14 * 86400000));
    const onlyStaff = p.staff || null;
    const onlyFree = p.onlyFree === '0' ? false : true; // по умолчанию отдаём только свободные слоты

    // Конфигурация мастеров
    const cfgRow = (await pool.query('SELECT config_json FROM staff_config ORDER BY updated_at DESC LIMIT 1')).rows[0];
    let staff = (cfgRow && cfgRow.config_json) || DEFAULT_STAFF;
    if (onlyStaff) staff = staff.filter(s => s.id === onlyStaff);

    // Брони в диапазоне → множество занятых (staff|date|slot)
    const booked = new Set();
    const { rows } = await pool.query(
      `SELECT staff_id, date::text AS d, slot_id, status FROM bookings WHERE date BETWEEN $1 AND $2`,
      [from, to]
    );
    rows.forEach(r => { if (r.status !== 'cancelled') booked.add(`${r.staff_id}|${r.d}|${r.slot_id}`); });

    // Перебор дат
    const dates = [];
    for (let t = new Date(from + 'T00:00:00Z'); iso(t) <= to; t = new Date(t.getTime() + 86400000)) dates.push(iso(t));

    const result = staff.map(s => {
      const slots = [...(s.slots || [])].sort((a, b) => a.startTime - b.startTime);
      const days = dates.map(date => {
        if (!(s.workDays || []).includes(dow(date))) return { date, dayOff: true, free: [], freeHours: 0 };
        const free = slots
          .filter(sl => !booked.has(`${s.id}|${date}|${sl.id}`))
          .map(sl => ({ slot: sl.id, label: sl.label, start: fmtH(sl.startTime), end: fmtH(sl.startTime + sl.hours), hours: sl.hours, eff: !!sl.eff }));
        const shown = onlyFree ? free : free; // (free already excludes booked)
        const freeHours = free.filter(f => f.eff).reduce((a, f) => a + f.hours, 0);
        return { date, dayOff: false, free: shown, freeHours };
      });
      return { id: s.id, name: s.name, role: s.role || '', days };
    });

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, from, to, staff: result }) };
  } catch (err) {
    console.error('Availability Error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ success: false, error: err.message }) };
  }
};
