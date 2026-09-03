import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { makeDatabase } from '../../src/shared/database/client.js';
export async function isolatedDatabase(url: string) {
  if (!new URL(url).pathname.endsWith('_test')) throw new Error('Test database name must end in _test');
  const schema = `hbtest_${randomUUID().replaceAll('-','')}`;
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  await pool.query(`CREATE SCHEMA "${schema}"`);
  for (const dir of (await readdir('prisma/migrations')).filter(x => /^\d/.test(x)).sort()) await applyMigration(pool,await readFile(`prisma/migrations/${dir}/migration.sql`, 'utf8'));
  const db = makeDatabase(url,schema);
  return { db, pool, async close() { await db.$disconnect(); await pool.query(`DROP SCHEMA "${schema}" CASCADE`); await pool.end(); } };
}

export async function applyMigration(pool:Pool,sql:string) {
  // PostgreSQL enum additions must commit before new enum values are used.
  const additions=sql.match(/ALTER TYPE [^;]+ ADD VALUE [^;]+;/g)??[];
  for(const statement of additions){await pool.query(statement);sql=sql.replace(statement,'');}
  await pool.query(sql);
}
