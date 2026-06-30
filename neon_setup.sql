-- ╔══════════════════════════════════════════════════════╗
-- ║   ZEN GARAGE PHUKET — Neon PostgreSQL Setup          ║
-- ║   Скопируйте и выполните в Neon SQL Editor           ║
-- ╚══════════════════════════════════════════════════════╝

-- Таблица записей в календарь
CREATE TABLE IF NOT EXISTS bookings (
  id            SERIAL PRIMARY KEY,
  staff_id      VARCHAR(50)   NOT NULL,
  slot_id       VARCHAR(100)  NOT NULL,
  date          DATE          NOT NULL,
  client        VARCHAR(200)  NOT NULL,
  car           VARCHAR(200),
  work          VARCHAR(300),
  status        VARCHAR(20)   DEFAULT 'confirmed',
  notes         TEXT,
  start_h       NUMERIC(4,2),
  end_h         NUMERIC(4,2),
  dur           NUMERIC(4,2),
  color         VARCHAR(20),
  multi_group   VARCHAR(50),
  is_continuation BOOLEAN     DEFAULT FALSE,
  slot_index    INTEGER       DEFAULT 0,
  total_slots   INTEGER       DEFAULT 1,
  booking_days  INTEGER       DEFAULT 1,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(staff_id, slot_id, date)
);

-- Таблица настроек сотрудников (слоты)
CREATE TABLE IF NOT EXISTS staff_config (
  id          SERIAL PRIMARY KEY,
  config_json JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_bookings_date     ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_staff    ON bookings(staff_id);
CREATE INDEX IF NOT EXISTS idx_bookings_group    ON bookings(multi_group);
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings(status);

-- Функция автообновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Проверка
SELECT 'Tables created successfully!' AS status;
