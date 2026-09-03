import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
export const makeDatabase = (connectionString: string, schema = 'public') => new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000, options: `-c search_path=${schema}` }, { schema }) });
export type Database = ReturnType<typeof makeDatabase>;
