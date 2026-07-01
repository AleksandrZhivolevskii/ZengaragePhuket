-- ╔══════════════════════════════════════════════════════╗
-- ║   ZEN GARAGE — База клиентов и машин                  ║
-- ║   Выполните ОДИН раз в Neon SQL Editor                ║
-- ╚══════════════════════════════════════════════════════╝

-- Клиенты
CREATE TABLE IF NOT EXISTS clients (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  phone      VARCHAR(50),
  messenger  VARCHAR(120),
  note       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Машины (много на одного клиента)
CREATE TABLE IF NOT EXISTS cars (
  id         SERIAL PRIMARY KEY,
  client_id  INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  make       VARCHAR(120),   -- марка
  model      VARCHAR(120),   -- модель
  vin        VARCHAR(60),
  plate      VARCHAR(40),    -- гос. номер
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cars_client ON cars(client_id);

SELECT 'clients & cars ready' AS status;
