-- ╔══════════════════════════════════════════════════════╗
-- ║   ZEN GARAGE — База клиентов и машин                  ║
-- ║   Идемпотентно: создаёт таблицы и добивает колонки    ║
-- ║   Выполните в Neon SQL Editor (можно повторно)        ║
-- ╚══════════════════════════════════════════════════════╝

-- Клиенты
CREATE TABLE IF NOT EXISTS clients (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL
);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone      VARCHAR(50);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS messenger  VARCHAR(120);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS note       TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Машины (много на одного клиента)
CREATE TABLE IF NOT EXISTS cars (
  id        SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE
);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS make       VARCHAR(120);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS model      VARCHAR(120);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS vin        VARCHAR(60);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS plate      VARCHAR(40);
ALTER TABLE cars ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_cars_client ON cars(client_id);

SELECT 'clients & cars ready' AS status;
