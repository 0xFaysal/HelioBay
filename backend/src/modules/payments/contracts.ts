import type { User } from '../../generated/prisma/client.js';
export interface GatewayOrder { transactionId: string; amountMinor: bigint; user: User }
export interface GatewayValidation { status: string; tran_id: string; val_id?: string; amount?: string; currency?: string; currency_type?: string; currency_amount?: string; risk_level?: string | number }
export interface PaymentGateway {
  initiate(order: GatewayOrder): Promise<{ sessionKey: string; gatewayPageUrl: string }>;
  validate(valId: string): Promise<GatewayValidation>;
  lookup(transactionId: string): Promise<GatewayValidation[]>;
}
