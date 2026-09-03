import { z } from 'zod';
import { pagination } from '../../shared/validation/common.js';
const coordinate = (min: number, max: number) => z.string().trim().min(1).pipe(z.coerce.number<string>().finite().min(min).max(max));
export const nearestQuery = z.object({ lat: coordinate(-90, 90), lng: coordinate(-180, 180), radiusKm: z.coerce.number().positive().max(200).default(25), limit: pagination.shape.limit });

