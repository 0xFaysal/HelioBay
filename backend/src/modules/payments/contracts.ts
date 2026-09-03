/** Contract only: provider verification and ledger posting are intentionally not implemented. */
export interface PaymentGateway {
  createCheckout(input: { paymentId: string; amountMinor: bigint; currency: 'BDT'; idempotencyKey: string }): Promise<{ checkoutUrl: string }>;
  verify(providerReference: string): Promise<{ verified: boolean; amountMinor: bigint; currency: 'BDT'; paymentId: string }>;
}
