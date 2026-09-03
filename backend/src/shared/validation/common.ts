import { z } from 'zod';
export const pagination = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
export const id = z.string().min(1).max(128);
export const pageArgs = (p: { page: number; limit: number }) => ({ skip: (p.page - 1) * p.limit, take: p.limit });
