import { Router } from 'express';
import { ok } from '../../shared/http.js';
import { id } from '../../shared/validation/common.js';
import { idempotencyKey } from '../wallets/ledger.js';
import { financialFilters } from './wallet-validation.js';
import type { AdminWalletService } from './wallet-service.js';
export function adminWalletRoutes(service:AdminWalletService) {
  const r=Router();
  r.get('/users/:userId/wallet',async(req,res)=>ok(res,await service.wallet(id.parse(req.params.userId))));
  r.get('/wallet-ledger',async(req,res)=>{const query=financialFilters.parse(req.query);ok(res,await service.ledger(query),200,query);});
  r.get('/payments',async(req,res)=>{const query=financialFilters.parse(req.query);ok(res,await service.payments(query),200,query);});
  r.post('/users/:userId/wallet/adjustments',async(req,res)=>ok(res,await service.adjust(id.parse(req.params.userId),req.body,idempotencyKey.parse(req.headers['idempotency-key']),req.user!.id,res.locals.requestId),201));
  return r;
}
