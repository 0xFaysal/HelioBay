import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../shared/errors/api-error.js';
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500, code = 'INTERNAL_ERROR', message = 'An unexpected error occurred';
  let details: unknown;
  if (err instanceof ZodError) { status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid request'; details = err.issues.map(i => ({ path: i.path.join('.'), message: i.message })); }
  else if (err instanceof ApiError) { ({ status, code, message } = err); }
  else if (err?.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = 'Malformed JSON body'; }
  else if (err?.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body too large'; }
  else if (err?.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Resource not found'; }
  else if (['P2002','P2003','P2004','P2034'].includes(err?.code)) { status = 409; code = 'CONFLICT'; message = 'Resource conflicts with existing state'; }
  if (status >= 500) res.locals.logger?.error({ requestId: res.locals.requestId, errorType: err?.constructor?.name }, 'Request failed');
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) }, requestId: res.locals.requestId });
};
