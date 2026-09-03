import type { RequestHandler } from 'express';
import type { User, Role } from '../../generated/prisma/client.js';
import { ApiError } from '../../shared/errors/api-error.js';
import type { TokenVerifier } from './firebase.js';
import type { AuthRepository } from './repository.js';

declare global { namespace Express { interface Request { user?: User } } }
export function authenticate(verify: TokenVerifier, users: Pick<AuthRepository, 'synchronize'>): RequestHandler {
  return async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
    if (!match?.[1]) throw new ApiError(401, 'UNAUTHENTICATED', 'A Firebase Bearer token is required');
    let token;
    try { token = await verify(match[1]); } catch { throw new ApiError(401, 'INVALID_TOKEN', 'Invalid or expired Firebase token'); }
    const user = await users.synchronize(token);
    if (user.status !== 'ACTIVE') throw new ApiError(403, 'ACCOUNT_INACTIVE', 'Account is blocked or disabled');
    req.user = user; next();
  };
}
export const authorize = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
  if (!roles.includes(req.user.role)) throw new ApiError(403, 'FORBIDDEN', 'Insufficient permissions');
  next();
};
