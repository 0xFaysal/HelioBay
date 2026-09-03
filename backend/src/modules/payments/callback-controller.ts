import express, { Router } from 'express';
import { ok } from '../../shared/http.js';
import type { PaymentService } from './service.js';
import { PaymentSettlement } from './settlement.js';
import { callbackInput } from './validation.js';
export function callbackRoutes(service:PaymentService) {
  const r=Router(), settlement=new PaymentSettlement(service);
  r.use(express.urlencoded({extended:false,limit:'8kb',parameterLimit:50}));
  r.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  for(const route of ['success','fail','cancel','ipn'] as const) r.post(`/${route}`,async(req,res)=>{
    const body=callbackInput.parse(req.body);
    const result=(route==='success' || route==='ipn') && body.val_id ? await settlement.validate(body.tran_id,body.val_id) : await settlement.reconcile(body.tran_id);
    if(route==='ipn') { ok(res,{transactionId:result.transactionId,status:result.status}); return; }
    const page=result.status==='PAID'?'success':result.status==='CANCELLED'?'cancel':'fail';
    const redirect=new URL(`/payment/${page}`,service.config!.PUBLIC_APP_URL);
    redirect.searchParams.set('paymentId',result.transactionId);
    res.redirect(303,redirect.href);
  });
  return r;
}
