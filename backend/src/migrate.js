import 'dotenv/config';
import pool, { schema } from './db.js';

const q = (name) => `"${schema}"."${name}"`;

export async function migrate() {
  console.log(`[migrate] using schema "${schema}"`);

  await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${q('catalog')} (
      id integer PRIMARY KEY,
      products jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${q('orders')} (
      id serial PRIMARY KEY,
      order_number text UNIQUE NOT NULL,
      customer_name text NOT NULL,
      phone text,
      address text,
      items jsonb NOT NULL DEFAULT '[]'::jsonb,
      total numeric(12,2) NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'new',
      payment_status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${q('admin_settings')} (
      id serial PRIMARY KEY,
      username text UNIQUE NOT NULL,
      password text NOT NULL,
      auth_secret text,
      created_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${q('meta')} (
      key text PRIMARY KEY,
      value text
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS peacock_orders_created_idx ON ${q('orders')} (created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS peacock_orders_number_idx ON ${q('orders')} (order_number)`);

  // One-time import of data from the old shared (public) Peacock tables so the
  // standalone store keeps its published catalog, orders and admin login. A
  // marker row makes this strictly once-only, even if the store is empty later.
  await pool.query(`
    DO $mig$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM ${q('meta')} WHERE key = 'shared_import_v1') THEN
        IF to_regclass('public.peacock_catalog') IS NOT NULL THEN
          INSERT INTO ${q('catalog')} (id, products, updated_at)
          SELECT id, products, updated_at FROM public.peacock_catalog
          ON CONFLICT (id) DO NOTHING;
        END IF;
        IF to_regclass('public.peacock_orders') IS NOT NULL THEN
          INSERT INTO ${q('orders')} (order_number, customer_name, phone, address, items, total, status, payment_status, created_at)
          SELECT order_number, customer_name, phone, address, items, total, status, payment_status, created_at
            FROM public.peacock_orders
          ON CONFLICT (order_number) DO NOTHING;
        END IF;
        IF to_regclass('public.peacock_admin_settings') IS NOT NULL THEN
          INSERT INTO ${q('admin_settings')} (username, password)
          SELECT username, password FROM public.peacock_admin_settings
          ON CONFLICT (username) DO NOTHING;
        END IF;
        INSERT INTO ${q('meta')} (key, value) VALUES ('shared_import_v1', NOW()::text);
      END IF;
    END
    $mig$;
  `);

  console.log('[migrate] tables ready');
}
