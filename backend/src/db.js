import 'dotenv/config';
import pg from 'pg';

const SCHEMA = /^[a-z_][a-z0-9_]*$/i.test(process.env.DB_SCHEMA || '') ? process.env.DB_SCHEMA : 'peacock';
export const schema = SCHEMA;

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGDATABASE) {
    const auth = PGUSER ? `${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD || '')}@` : '';
    return `postgres://${auth}${PGHOST}:${PGPORT || '5432'}/${PGDATABASE}`;
  }
  return 'postgres://postgres:postgres@localhost:5432/peacock';
}

const DB_URL = connectionString();

async function pickSsl() {
  if (process.env.DB_SSL === '1' || process.env.DB_SSL === 'true') return { rejectUnauthorized: false };
  if (process.env.DB_SSL === '0' || process.env.DB_SSL === 'false') return false;

  for (const ssl of [{ rejectUnauthorized: false }, false]) {
    try {
      const probe = new pg.Client({ connectionString: DB_URL, ssl, connectionTimeoutMillis: 6000 });
      await probe.connect();
      await probe.query('SELECT 1');
      await probe.end();
      console.log(`[db] SSL probe OK -> ssl=${JSON.stringify(ssl)}`);
      return ssl;
    } catch (e) {
      console.log(`[db] SSL probe failed ssl=${JSON.stringify(ssl)}: ${e.message}`);
    }
  }
  console.log('[db] SSL probe failed both; defaulting to TLS rejectUnauthorized:false');
  return { rejectUnauthorized: false };
}

const pool = new pg.Pool({
  connectionString: DB_URL,
  ssl: false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  options: `-c search_path=${SCHEMA},public`,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function initDbConnection() {
  const ssl = await pickSsl();
  pool.options.ssl = ssl;
  pool.options.connectionString = DB_URL;
  const client = await pool.connect();
  client.release();
  console.log('[db] initDbConnection OK');
}

export default pool;
