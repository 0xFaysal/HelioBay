import { z } from 'zod';
import { pagination } from '../../shared/validation/common.js';
import { metadataSchema } from '../wallets/ledger.js';
const minor = z.union([z.string().regex(/^[1-9]\d{0,11}$/),z.number().int().positive().safe().max(999999999999)]).transform(v=>BigInt(v));
const shared={reason:z.string().trim().min(5).max(500),metadata:metadataSchema.optional()};
export const adjustmentInput=z.discriminatedUnion('kind',[
  z.object({...shared,kind:z.enum(['ADMIN_CREDIT','ADMIN_DEBIT']),amountMinor:minor}).strict(),
  z.object({...shared,kind:z.literal('REVERSAL'),ledgerId:z.string().min(1).max(128)}).strict(),
]);
export const financialFilters=pagination.extend({userId:z.string().min(1).max(128).optional(),environment:z.enum(['sandbox','live']).optional()});
