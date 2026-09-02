import { z } from "zod";

const id = z.string().min(1).max(128);
const finite = z.number().finite();
const positive = finite.nonnegative();
const percent = finite.min(0).max(100);
const iso = z.string().datetime({ offset: true });
export const pricingSchema = z.object({
  pricePerKwh: finite.min(1).max(200), bookingFee: positive.max(1000), cancellationFee: positive.max(1000),
  peakMultiplier: finite.min(1).max(5), demoScalingFactor: finite.min(1).max(50000),
  promoPercent: finite.min(0).max(80), taperFactor: finite.min(.1).max(1), targetBattery: finite.min(50).max(100),
});
export const stationSchema = z.object({
  id, name: z.string().min(3).max(100), address: z.string().min(3).max(200), landmark: z.string().max(100),
  lat: finite.min(-90).max(90), lng: finite.min(-180).max(180), distance: positive,
  price: finite.min(1).max(200), solar: percent, power: finite.min(1).max(350), available: positive.int(),
  bays: positive.int().min(1).max(50), online: z.boolean(), connector: z.enum(["CCS2", "Type 2"]),
  battery: percent, amenities: z.array(z.string()), image: z.string().regex(/^\/images\/[a-zA-Z0-9._-]+$/), deviceId: id,
  enabledBayIds: z.array(id).optional(), openingHours: z.string().regex(/^\d{2}:\d{2}–\d{2}:\d{2}$/).optional(),
  maintenance: z.boolean().optional(), pricing: pricingSchema.optional(),
});
export const baySchema = z.object({ id, stationId: id, deviceId: id, enabled: z.boolean(), blocked: z.boolean(), maintenance: z.boolean() });
export const telemetrySchema = z.object({
  deviceId: id, bayId: id, online: z.boolean(), occupied: z.boolean(), charging: z.boolean(),
  solarVoltage: positive.max(1000).nullable(), solarCurrent: positive.max(1000).nullable(), solarPower: positive.max(1000000).nullable(),
  carBatteryVoltage: positive.max(1000).nullable(), carBatteryPercent: percent.nullable(),
  chargingCurrent: positive.max(1000).nullable(), chargingPower: positive.max(1000000).nullable(), energyWh: positive,
  stationBatteryPercent: percent, source: z.enum(["SOLAR", "STORAGE", "GRID", "EXPORT"]), timestamp: iso, simulated: z.boolean().default(false),
});
export const commandSchema = z.object({
  commandId: id, command: z.enum(["START", "STOP", "PAUSE", "EMERGENCY_STOP", "RESTART", "TEST"]),
  sessionId: id.optional(), stationId: id, bayId: id, deviceId: id, maximumMinutes: positive.max(1440),
  issuedAt: iso, expiresAt: iso, status: z.enum(["pending", "acknowledged", "failed", "timed-out"]),
  actorId: id, override: z.boolean(), outcome: z.enum(["success", "failure", "timeout"]),
});
export const acknowledgementSchema = z.object({ commandId: id, deviceId: id, success: z.boolean(), state: z.string(), message: z.string().max(500), receivedAt: iso });
export const deviceSchema = z.object({
  id, stationId: id, bayId: id, online: z.boolean(), vehicleDetected: z.boolean(), mosfetOn: z.boolean(),
  firmware: z.string(), lastSeen: iso, stationBattery: percent, solarPower: positive.max(10), gridBackup: z.boolean(),
  gridExport: z.boolean(), sensorFault: z.boolean(), testMode: z.boolean(), commandOutcome: z.enum(["success", "failure", "timeout"]),
  telemetry: telemetrySchema.optional(), timeline: z.array(telemetrySchema).max(240),
});
export const vehicleSchema = z.object({ id, name: z.string(), plate: z.string(), connector: z.enum(["CCS2", "Type 2"]), capacity: finite.min(10).max(200), battery: percent, isDefault: z.boolean() });
export const bookingSchema = z.object({
  id, stationId: id, vehicleId: id, start: iso, duration: positive.max(1440), bayId: id,
  status: z.enum(["upcoming", "charging", "completed", "cancelled"]), estimate: positive, advance: positive,
  fee: positive, discount: positive, paymentId: id, createdAt: iso, ownerId: id.optional(), approved: z.boolean().optional(),
  unitPrice: positive.optional(), cancellationFee: positive.optional(), discountRate: percent.optional(),
});
export const sessionSchema = z.object({
  id, bookingId: id, stationId: id, vehicleId: id, status: z.enum(["waiting", "car-detected", "starting", "charging", "paused", "completed", "offline", "fault"]),
  battery: percent, initialBattery: percent, energy: positive, elapsed: positive, power: positive, solar: percent,
  updatedAt: iso, createdAt: iso, points: z.array(z.object({ minute: positive, power: positive })).max(240),
  bayId: id.optional(), deviceId: id.optional(), commandId: id.optional(), energyWh: positive.optional(),
  completedAt: iso.optional(), stopReason: z.string().optional(), targetBattery: percent.optional(), finalCost: positive.optional(),
});
export const paymentSchema = z.object({ id, bookingId: id, amount: positive, method: z.string(), kind: z.enum(["payment", "refund"]), status: z.enum(["succeeded", "refunded"]), createdAt: iso, description: z.string() });
export const refundSchema = z.object({ id, paymentId: id, bookingId: id, ownerId: id, amount: positive, status: z.enum(["pending", "approved", "succeeded"]), reason: z.string(), createdAt: iso });
export const faultSchema = z.object({ id, stationId: id, deviceId: id, severity: z.enum(["warning", "critical"]), code: z.enum(["SENSOR", "OFFLINE", "EMERGENCY", "LOW_BATTERY", "MAINTENANCE"]), message: z.string(), status: z.enum(["open", "acknowledged", "resolved"]), createdAt: iso, updatedAt: iso });
export const maintenanceSchema = z.object({ id, stationId: id, deviceId: id, faultId: id.optional(), note: z.string(), actorId: id, createdAt: iso });
export const auditSchema = z.object({ id, actorId: id, action: z.string(), targetId: id, detail: z.string(), createdAt: iso });
export const ownerSchema = z.object({
  profile: z.object({ name: z.string(), phone: z.string(), city: z.string() }), vehicles: z.array(vehicleSchema),
  selectedVehicleId: z.string(), bookings: z.array(bookingSchema), sessions: z.array(sessionSchema), payments: z.array(paymentSchema),
  savedStations: z.array(id), notificationsRead: z.boolean(), preferences: z.object({ booking: z.boolean(), charging: z.boolean(), offers: z.boolean() }),
});
export const networkSchema = z.object({
  stations: z.array(stationSchema), bays: z.array(baySchema), devices: z.array(deviceSchema), commands: z.array(commandSchema),
  acknowledgements: z.array(acknowledgementSchema), faults: z.array(faultSchema), maintenance: z.array(maintenanceSchema),
  audit: z.array(auditSchema), refunds: z.array(refundSchema), pricing: pricingSchema, previousPricing: pricingSchema.nullable(),
  demoSpeed: z.union([z.literal(1), z.literal(10), z.literal(60)]), lastTick: iso, solarWh: positive, gridWh: positive, exportWh: positive,
  energyHistory: z.array(z.object({ timestamp: iso, solarWh: positive, gridWh: positive, exportWh: positive })).max(1440),
});
export const snapshotSchema = z.object({ network: networkSchema, owners: z.record(z.string(), ownerSchema) });
export const realtimeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("telemetry"), data: telemetrySchema }),
  z.object({ type: z.literal("acknowledgement"), data: acknowledgementSchema }),
  z.object({ type: z.literal("session"), data: sessionSchema }),
  z.object({ type: z.literal("invalidate"), data: z.object({ resource: z.enum(["stations", "bookings", "payments", "faults"]) }) }),
]);
