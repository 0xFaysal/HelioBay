import 'dotenv/config';
import { readEnv } from './config/env.js';
import { readPaymentConfig } from './config/payments.js';
import { makeDatabase } from './shared/database/client.js';
import { SslcommerzGateway } from './modules/payments/gateway.js';
import { PaymentService } from './modules/payments/service.js';
import { PaymentSettlement } from './modules/payments/settlement.js';
const env=readEnv(),config=readPaymentConfig();
if(!config) throw new Error('SSLCOMMERZ Sandbox is not configured');
const db=makeDatabase(env.DATABASE_URL);
try { const results=await new PaymentSettlement(new PaymentService(db,new SslcommerzGateway(config),config)).reconcileBatch(); console.log(JSON.stringify(results)); if(results.some(r=>r.status==='RETRY_REQUIRED')) process.exitCode=1; }
finally { await db.$disconnect(); }
