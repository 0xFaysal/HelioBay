import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ApiError } from '../../shared/errors/api-error.js';
import { ok } from '../../shared/http.js';
import { id } from '../../shared/validation/common.js';
import { idempotencyKey } from '../wallets/ledger.js';
import type { PaymentService } from './service.js';
export function topupRoutes(service: PaymentService) {
  const r=Router();
  r.post('/top-ups',rateLimit({windowMs:60000,limit:5,keyGenerator:req=>req.user!.id,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,_res,next)=>next(new ApiError(429,'TOPUP_RATE_LIMITED','Too many top-up attempts'))}),async(req,res)=>{
    ok(res,await service.initiate(req.user!,req.body,idempotencyKey.parse(req.headers['idempotency-key'])),202);
  });
  r.get('/top-ups/:transactionId',async(req,res)=>ok(res,await service.get(req.user!.id,id.parse(req.params.transactionId))));
  return r;
}
