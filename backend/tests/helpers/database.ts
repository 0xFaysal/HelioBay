import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { makeDatabase } from '../../src/shared/database/client.js';
export async function isolatedDatabase(url: string) {
  if (!new URL(url).pathname.endsWith('_test')) throw new Error('Test database name must end in _test');
  const schema = `hbtest_${randomUUID().replaceAll('-','')}`;
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  await pool.query(`CREATE SCHEMA "${schema}"`);
  for (const dir of (await readdir('prisma/migrations')).filter(x => /^\d/.test(x)).sort()) await pool.query(await readFile(`prisma/migrations/${dir}/migration.sql`, 'utf8'));
  const db = makeDatabase(url,schema);
  return { db, pool, async close() { await db.$disconnect(); await pool.query(`DROP SCHEMA "${schema}" CASCADE`); await pool.end(); } };
}
