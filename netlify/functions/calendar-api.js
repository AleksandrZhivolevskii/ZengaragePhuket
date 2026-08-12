const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-API-Key,X-Request-Id',
  'Cache-Control': 'no-store',
};
const J = (statusCode, body, extra = {}) => ({ statusCode, headers: { ...CORS, ...extra }, body: JSON.stringify(body) });
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const pad = n => String(n).padStart(2, '0');
const dateOk = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(value + 'T12:00:00Z').getTime());
const dow = date => (((new Date(date + 'T12:00:00Z').getUTCDay()) + 6) % 7) + 1;
const fmtH = h => `${pad(Math.floor(h))}:${Number(h) % 1 === 0.5 ? '30' : '00'}`;
const clean = (v, max = 500) => v == null ? null : String(v).trim().slice(0, max);
const ipHash = event => sha256((process.env.JWT_SECRET || process.env.DATABASE_URL || 'zg') + '|' + ((event.headers || {})['x-nf-client-connection-ip'] || (event.headers || {})['client-ip'] || 'unknown'));

let ready = false;
async function ensureSchema() {
  if (ready) return;
  await pool.query(`
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_id INTEGER;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS car_id INTEGER;
    CREATE TABLE IF NOT EXISTS api_keys (
      id BIGSERIAL PRIMARY KEY, name VARCHAR(120) NOT NULL, key_hash CHAR(64) UNIQUE NOT NULL,
      key_prefix VARCHAR(24) NOT NULL, scopes TEXT[] NOT NULL DEFAULT ARRAY['read','write'],
      created_by INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS api_audit_log (
      id BIGSERIAL PRIMARY KEY, api_key_id BIGINT REFERENCES api_keys(id), api_key_name VARCHAR(120) NOT NULL,
      action VARCHAR(40) NOT NULL, resource VARCHAR(40) NOT NULL, resource_key TEXT, request_id UUID,
      ip_hash CHAR(64), before_data JSONB, after_data JSONB, success BOOLEAN NOT NULL DEFAULT TRUE,
      error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS api_audit_log_created_idx ON api_audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS api_audit_log_key_idx ON api_audit_log(api_key_id, created_at DESC);
  `);
  ready = true;
}

async function authenticate(event, requiredScope) {
  const headers = event.headers || {};
  const raw = headers['x-api-key'] || headers['X-Api-Key'] || '';
  if (!raw || !raw.startsWith('zg_live_') || raw.length < 40) return { error: J(401, { success: false, error: 'Valid X-API-Key required' }) };
  const key = (await pool.query(`
    SELECT id,name,scopes,expires_at,revoked_at FROM api_keys WHERE key_hash=$1
  `, [sha256(raw)])).rows[0];
  if (!key || key.revoked_at || (key.expires_at && new Date(key.expires_at) <= new Date())) return { error: J(401, { success: false, error: 'API key is invalid, expired, or revoked' }) };
  if (!(key.scopes || []).includes(requiredScope)) return { error: J(403, { success: false, error: `API key requires '${requiredScope}' scope` }) };
  const count = (await pool.query(`SELECT COUNT(*)::int AS n FROM api_audit_log WHERE api_key_id=$1 AND created_at > NOW()-INTERVAL '1 minute'`, [key.id])).rows[0].n;
  if (count >= 120) return { error: J(429, { success: false, error: 'Rate limit exceeded (120 requests/minute)' }, { 'Retry-After': '60' }) };
  await pool.query('UPDATE api_keys SET last_used_at=NOW() WHERE id=$1', [key.id]);
  return { key };
}

async function audit(event, key, action, resourceKey, beforeData, afterData, success = true, errorMessage = null) {
  let requestId = ((event.headers || {})['x-request-id'] || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) requestId = crypto.randomUUID();
  await pool.query(`
    INSERT INTO api_audit_log(api_key_id,api_key_name,action,resource,resource_key,request_id,ip_hash,before_data,after_data,success,error_message)
    VALUES($1,$2,$3,'booking',$4,$5,$6,$7,$8,$9,$10)
  `, [key.id, key.name, action, resourceKey || null, requestId, ipHash(event), beforeData || null, afterData || null, success, errorMessage]);
  return requestId;
}

function parseKey(key) {
  const parts = String(key || '').split('__');
  if (parts.length !== 3 || !parts[0] || !dateOk(parts[1]) || !parts[2]) return null;
  return { staffId: parts[0], date: parts[1], slotId: parts[2] };
}
const makeKey = r => `${r.staff_id}__${r.date}__${r.slot_id}`;
const publicBooking = r => ({
  key: makeKey(r), staffId: r.staff_id, slotId: r.slot_id, date: r.date, client: r.client,
  car: r.car, work: r.work, status: r.status, notes: r.notes, startH: Number(r.start_h),
  endH: Number(r.end_h), duration: Number(r.dur), color: r.color, multiGroup: r.multi_group,
  isContinuation: !!r.is_continuation, slotIndex: r.slot_index, totalSlots: r.total_slots,
  bookingDays: r.booking_days, clientId: r.client_id, carId: r.car_id,
});
const SELECT_BOOKING = `SELECT staff_id,slot_id,date::text,client,car,work,status,notes,start_h,end_h,dur,color,multi_group,is_continuation,slot_index,total_slots,booking_days,client_id,car_id FROM bookings`;

async function staffConfig() {
  const row = (await pool.query('SELECT config_json FROM staff_config ORDER BY updated_at DESC LIMIT 1')).rows[0];
  return (row && row.config_json) || [];
}

async function validateTarget(staffId, date, slotId) {
  if (!dateOk(date)) throw Object.assign(new Error('date must use YYYY-MM-DD'), { status: 400 });
  const staff = (await staffConfig()).find(s => s.id === staffId);
  if (!staff) throw Object.assign(new Error('Unknown staffId'), { status: 400 });
  if (!(staff.workDays || []).includes(dow(date))) throw Object.assign(new Error('Technician does not work on this date'), { status: 409 });
  const slot = (staff.slots || []).find(s => s.id === slotId);
  if (!slot) throw Object.assign(new Error('Unknown slotId for this technician'), { status: 400 });
  return { staff, slot };
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return J(200, {});
  try {
    await ensureSchema();
    const resource = ((event.queryStringParameters || {}).resource || 'bookings').toLowerCase();
    const requiredScope = event.httpMethod === 'GET' ? 'read' : event.httpMethod === 'DELETE' ? 'delete' : 'write';
    const auth = await authenticate(event, requiredScope);
    if (auth.error) return auth.error;
    const apiKey = auth.key;

    if (event.httpMethod === 'GET' && resource === 'staff') {
      return J(200, { success: true, staff: await staffConfig() });
    }

    if (event.httpMethod === 'GET' && resource === 'availability') {
      const q = event.queryStringParameters || {};
      const from = dateOk(q.from) ? q.from : new Date().toISOString().slice(0, 10);
      const to = dateOk(q.to) ? q.to : new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      if (to < from) return J(400, { success: false, error: 'to must be on or after from' });
      const days = Math.floor((new Date(to) - new Date(from)) / 86400000) + 1;
      if (days > 120) return J(400, { success: false, error: 'Maximum availability range is 120 days' });
      let staff = await staffConfig();
      if (q.staffId) staff = staff.filter(s => s.id === q.staffId);
      const occupied = new Set((await pool.query(`SELECT staff_id,date::text,slot_id FROM bookings WHERE date BETWEEN $1 AND $2 AND status<>'cancelled'`, [from, to])).rows.map(r => `${r.staff_id}|${r.date}|${r.slot_id}`));
      const result = [];
      for (const s of staff) for (let i = 0; i < days; i++) {
        const d = new Date(from + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + i); const date = d.toISOString().slice(0, 10);
        if (!(s.workDays || []).includes(dow(date))) continue;
        for (const slot of (s.slots || [])) if (!occupied.has(`${s.id}|${date}|${slot.id}`)) result.push({ staffId: s.id, staffName: s.name, date, slotId: slot.id, label: slot.label, start: fmtH(slot.startTime), end: fmtH(slot.startTime + slot.hours), hours: slot.hours, effective: !!slot.eff });
      }
      return J(200, { success: true, from, to, availability: result });
    }

    if (event.httpMethod === 'GET' && resource === 'bookings') {
      const q = event.queryStringParameters || {};
      const from = dateOk(q.from) ? q.from : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const to = dateOk(q.to) ? q.to : new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
      if (to < from) return J(400, { success: false, error: 'to must be on or after from' });
      const params = [from, to]; let where = 'date BETWEEN $1 AND $2';
      if (q.staffId) { params.push(q.staffId); where += ` AND staff_id=$${params.length}`; }
      if (q.status) { params.push(q.status); where += ` AND status=$${params.length}`; }
      const rows = (await pool.query(`${SELECT_BOOKING} WHERE ${where} ORDER BY date,start_h LIMIT 5000`, params)).rows;
      return J(200, { success: true, count: rows.length, bookings: rows.map(publicBooking) });
    }

    const body = JSON.parse(event.body || '{}');
    if (event.httpMethod === 'POST' && resource === 'bookings') {
      const staffId = clean(body.staffId, 100), date = clean(body.date, 10), slotId = clean(body.slotId, 100);
      const client = clean(body.client, 300);
      if (!staffId || !date || !slotId || !client) return J(400, { success: false, error: 'staffId, date, slotId, and client are required' });
      const { slot } = await validateTarget(staffId, date, slotId);
      const status = ['confirmed', 'pending', 'cancelled'].includes(body.status) ? body.status : 'confirmed';
      const existing = (await pool.query(`${SELECT_BOOKING} WHERE staff_id=$1 AND date=$2 AND slot_id=$3`, [staffId, date, slotId])).rows[0];
      if (existing && existing.status !== 'cancelled' && body.upsert !== true) return J(409, { success: false, error: 'Slot is already booked; use PATCH or set upsert=true' });
      const row = (await pool.query(`
        INSERT INTO bookings(staff_id,slot_id,date,client,car,work,status,notes,start_h,end_h,dur,color,multi_group,is_continuation,slot_index,total_slots,booking_days,client_id,car_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT(staff_id,slot_id,date) DO UPDATE SET client=EXCLUDED.client,car=EXCLUDED.car,work=EXCLUDED.work,status=EXCLUDED.status,notes=EXCLUDED.notes,start_h=EXCLUDED.start_h,end_h=EXCLUDED.end_h,dur=EXCLUDED.dur,color=EXCLUDED.color,multi_group=EXCLUDED.multi_group,is_continuation=EXCLUDED.is_continuation,slot_index=EXCLUDED.slot_index,total_slots=EXCLUDED.total_slots,booking_days=EXCLUDED.booking_days,client_id=EXCLUDED.client_id,car_id=EXCLUDED.car_id,updated_at=NOW()
        RETURNING staff_id,slot_id,date::text,client,car,work,status,notes,start_h,end_h,dur,color,multi_group,is_continuation,slot_index,total_slots,booking_days,client_id,car_id
      `, [staffId,slotId,date,client,clean(body.car,300),clean(body.work,300)||slot.label, status,clean(body.notes,4000),slot.startTime,slot.startTime+slot.hours,slot.hours,slot.color||null,clean(body.multiGroup,120),!!body.isContinuation,Number(body.slotIndex)||0,Number(body.totalSlots)||1,Number(body.bookingDays)||1,body.clientId||null,body.carId||null])).rows[0];
      const after = publicBooking(row); const requestId = await audit(event, apiKey, existing ? 'upsert' : 'create', after.key, existing ? publicBooking(existing) : null, after);
      return J(existing ? 200 : 201, { success: true, requestId, booking: after });
    }

    if (event.httpMethod === 'PATCH' && resource === 'bookings') {
      const source = parseKey(body.key); if (!source) return J(400, { success: false, error: 'Valid booking key is required' });
      const beforeRow = (await pool.query(`${SELECT_BOOKING} WHERE staff_id=$1 AND date=$2 AND slot_id=$3`, [source.staffId,source.date,source.slotId])).rows[0];
      if (!beforeRow) return J(404, { success: false, error: 'Booking not found' });
      const c = body.changes || {};
      const target = { staffId: clean(c.staffId,100)||source.staffId, date: clean(c.date,10)||source.date, slotId: clean(c.slotId,100)||source.slotId };
      const { slot } = await validateTarget(target.staffId,target.date,target.slotId);
      const targetChanged = target.staffId!==source.staffId || target.date!==source.date || target.slotId!==source.slotId;
      if (targetChanged) {
        const occupied = (await pool.query(`SELECT 1 FROM bookings WHERE staff_id=$1 AND date=$2 AND slot_id=$3 AND status<>'cancelled'`, [target.staffId,target.date,target.slotId])).rowCount;
        if (occupied) return J(409, { success:false,error:'Target slot is already booked' });
      }
      const merged = { ...publicBooking(beforeRow), ...c, ...target };
      if (!['confirmed','pending','cancelled'].includes(merged.status)) return J(400,{success:false,error:'Invalid status'});
      const clientDb = await pool.connect();
      try {
        await clientDb.query('BEGIN');
        if (targetChanged) await clientDb.query('DELETE FROM bookings WHERE staff_id=$1 AND date=$2 AND slot_id=$3',[source.staffId,source.date,source.slotId]);
        const row = (await clientDb.query(`
          INSERT INTO bookings(staff_id,slot_id,date,client,car,work,status,notes,start_h,end_h,dur,color,multi_group,is_continuation,slot_index,total_slots,booking_days,client_id,car_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
          ON CONFLICT(staff_id,slot_id,date) DO UPDATE SET client=EXCLUDED.client,car=EXCLUDED.car,work=EXCLUDED.work,status=EXCLUDED.status,notes=EXCLUDED.notes,start_h=EXCLUDED.start_h,end_h=EXCLUDED.end_h,dur=EXCLUDED.dur,color=EXCLUDED.color,multi_group=EXCLUDED.multi_group,is_continuation=EXCLUDED.is_continuation,slot_index=EXCLUDED.slot_index,total_slots=EXCLUDED.total_slots,booking_days=EXCLUDED.booking_days,client_id=EXCLUDED.client_id,car_id=EXCLUDED.car_id,updated_at=NOW()
          RETURNING staff_id,slot_id,date::text,client,car,work,status,notes,start_h,end_h,dur,color,multi_group,is_continuation,slot_index,total_slots,booking_days,client_id,car_id
        `,[target.staffId,target.slotId,target.date,clean(merged.client,300),clean(merged.car,300),clean(merged.work,300)||slot.label,merged.status,clean(merged.notes,4000),slot.startTime,slot.startTime+slot.hours,slot.hours,slot.color||null,clean(merged.multiGroup,120),!!merged.isContinuation,Number(merged.slotIndex)||0,Number(merged.totalSlots)||1,Number(merged.bookingDays)||1,merged.clientId||null,merged.carId||null])).rows[0];
        await clientDb.query('COMMIT'); const after=publicBooking(row); const requestId=await audit(event,apiKey,targetChanged?'move':'update',body.key,publicBooking(beforeRow),after);
        return J(200,{success:true,requestId,booking:after});
      } catch(e) { await clientDb.query('ROLLBACK'); throw e; } finally { clientDb.release(); }
    }

    if (event.httpMethod === 'DELETE' && resource === 'bookings') {
      const parsed = parseKey(body.key); if (!parsed) return J(400,{success:false,error:'Valid booking key is required'});
      const row=(await pool.query(`${SELECT_BOOKING} WHERE staff_id=$1 AND date=$2 AND slot_id=$3`,[parsed.staffId,parsed.date,parsed.slotId])).rows[0];
      if(!row)return J(404,{success:false,error:'Booking not found'});
      await pool.query('DELETE FROM bookings WHERE staff_id=$1 AND date=$2 AND slot_id=$3',[parsed.staffId,parsed.date,parsed.slotId]);
      const requestId=await audit(event,apiKey,'delete',body.key,publicBooking(row),null);
      return J(200,{success:true,requestId,deleted:body.key});
    }

    return J(405, { success: false, error: 'Unsupported method or resource' });
  } catch (error) {
    console.error('Calendar API Error:', error);
    return J(error.status || 500, { success: false, error: error.status ? error.message : 'Internal server error' });
  }
};
