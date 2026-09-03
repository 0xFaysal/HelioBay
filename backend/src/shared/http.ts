import type { Response } from 'express';
export function ok(res: Response, data: unknown, status = 200, meta?: unknown) { return res.status(status).json({ data, ...(meta ? { meta } : {}), requestId: res.locals.requestId }); }
