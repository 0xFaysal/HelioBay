import { z } from "zod";
import { stationEnergySchema } from "../energy/model.ts";

const id = z.string().min(1).max(120);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const minor = integer.max(1_000_000_000_000);
const percent = z.number().min(0).max(100);
const iso = z.string().datetime({ offset: true });
export const userSchema = z.object({ id, name: z.string().min(2), email: z.string(), role: z.enum(["owner", "admin"]), status: z.enum(["active", "blocked"]), phone: z.string(), city: z.string(), savedStations: z.array(id), preferences: z.object({ charging: z.boolean(), wallet: z.boolean(), offers: z.boolean() }) });
export const vehicleSchema = z.object({ id, ownerId: id, name: z.string().min(2), plate: z.string().min(3), capacityWh: integer.min(1).max(1000000), battery: percent, connector: z.enum(["CCS2", "Type 2", "CHADEMO", "AC_SOCKET"]), isDefault: z.boolean() });
export const stationSchema = z.object({ id, name: z.string().min(3).max(100), address: z.string().min(3), landmark: z.string(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), deviceId: id, code: z.string().optional(), tariffId: z.string().optional(), online: z.boolean(), priceMinor: minor.min(1), powerKw: z.number().min(1).max(350), solarPercent: percent, image: z.string().regex(/^\/images\/[\w.-]+$/), amenities: z.array(z.string()), openingHours: z.string(), distanceKm: z.number().nonnegative().optional() });
export const baySchema = z.object({ id, stationId: id, deviceId: id, number: integer.min(1), relayChannel: integer.min(1).max(32), connector: z.enum(["CCS2", "Type 2", "CHADEMO", "AC_SOCKET"]), reportedState: z.string().optional(), enabled: z.boolean(), plugged: z.boolean(), fault: z.boolean() });
export const deviceSchema = z.object({ id, stationId: id, online: z.boolean(), lastSeen: iso, firmware: z.string(), dataSource: z.string().optional(), publicId: z.string().optional(), stationBattery: percent, solarW: z.number().min(0).max(1_000_000), gridBackup: z.boolean(), gridExport: z.boolean(), outcome: z.enum(["success", "failure", "timeout"]) });
export const stopReasons = ["BATTERY_FULL", "CREDIT_EXHAUSTED", "PLUG_DISCONNECTED", "USER_STOPPED", "ADMIN_STOPPED", "EMERGENCY_STOP", "DEVICE_OFFLINE", "FAULT"] as const;
export const telemetrySchema = z.object({ at: iso, voltage: z.number().nonnegative().nullable(), current: z.number().nonnegative().nullable(), powerW: z.number().nonnegative().nullable(), energyMWh: integer, battery: percent.nullable(), source: z.enum(["SOLAR", "STORAGE", "GRID"]), simulated: z.boolean() });
export const sessionSchema = z.object({ id, ownerId: id, stationId: id, bayId: id, deviceId: id, vehicleId: id, state: z.enum(["pending", "charging", "completed"]), backendStatus: z.string().optional(), reconciliationRequired: z.boolean().optional(), dataSource: z.string().optional(), receiptConfirmed: z.boolean().optional(), createdAt: iso, startedAt: iso.optional(), updatedAt: iso, completedAt: iso.optional(), stopReason: z.enum(stopReasons).optional(), initialBattery: percent, battery: percent, targetBattery: percent, energyMWh: integer, elapsedMs: integer, tariffMinor: minor.min(1), startingBalanceMinor: minor, reservedMinor: minor, costMinor: minor, endingBalanceMinor: minor.optional(), commandId: id, points: z.array(telemetrySchema).max(120), events: z.array(z.object({ at: iso, message: z.string() })).max(100) });
export const commandSchema = z.object({ id, sessionId: id.optional(), deviceId: id, bayId: id.optional(), command: z.enum(["START", "STOP", "EMERGENCY_STOP", "TEST", "RESTART"]), status: z.enum(["pending", "acknowledged", "failed", "timed-out"]), outcome: z.enum(["success", "failure", "timeout"]), issuedAt: iso, expiresAt: iso, actorId: id, message: z.string(), stopReason: z.enum(stopReasons).optional() });
export const walletSchema = z.object({ userId: id, balanceMinor: minor, heldMinor: minor.optional(), availableMinor: minor.optional() });
export const ledgerSchema = z.object({ id, userId: id, kind: z.enum(["top-up", "charging-debit", "adjustment", "reversal", "reservation", "reservation-release", "refund"]), amountMinor: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000), balanceAfterMinor: minor, reference: id, reason: z.string(), status: z.literal("posted"), sandbox: z.boolean(), at: iso });
export const paymentSchema = z.object({ id, userId: id, amountMinor: minor.min(1000), status: z.enum(["pending", "validating", "verified", "failed", "cancelled", "expired", "risk-review", "reversed"]), sandbox: z.boolean(), providerReference: z.string().max(200).optional(), createdAt: iso, verifiedAt: iso.optional(), requestId: id, demoOutcome: z.enum(["success", "failure", "cancel", "pending"]).optional(), submittedAt: iso.optional() });
export const policySchema = z.object({ maxTopupMinor: minor.min(1000), defaultTariffMinor: minor.min(1), demoSpeed: z.union([z.literal(1), z.literal(10), z.literal(60)]), modelScale: integer.min(1).max(50000), targetBattery: percent.min(50), communicationTimeoutMs: integer.min(5000).max(120000) });
export const faultSchema = z.object({ id, stationId: id, bayId: id.optional(), deviceId: id, severity: z.enum(["warning", "critical"]), message: z.string(), status: z.enum(["open", "acknowledged", "resolved"]), at: iso, note: z.string() });
export const notificationSchema=z.object({id,userId:id,type:z.string(),title:z.string(),message:z.string(),reference:z.string().optional(),readAt:iso.optional(),createdAt:iso});
export const auditSchema = z.object({ id, actorId: id, action: z.string(), reference: id, reason: z.string(), at: iso });
export const snapshotSchema = z.object({ revision: integer, lastTick: iso, energy: z.array(stationEnergySchema).default([]), users: z.array(userSchema), vehicles: z.array(vehicleSchema), stations: z.array(stationSchema), bays: z.array(baySchema), devices: z.array(deviceSchema), wallets: z.array(walletSchema), ledger: z.array(ledgerSchema), payments: z.array(paymentSchema), sessions: z.array(sessionSchema), commands: z.array(commandSchema), faults: z.array(faultSchema), notifications:z.array(notificationSchema).default([]), audit: z.array(auditSchema), policy: policySchema, previousPolicy: policySchema.nullable() });
export type User = z.infer<typeof userSchema>;
// Reject simulated telemetry or impossible monetary state at the API boundary.
export const apiSnapshotSchema = snapshotSchema.refine(data =>
  data.energy.every(e => e.current.telemetrySource !== "digital_twin" && e.samples.every(t => t.telemetrySource !== "digital_twin") && e.history.every(h => h.source !== "digital_twin")) &&
  data.sessions.every(s => !s.points.some(p => p.simulated) && s.costMinor <= s.reservedMinor) &&
  data.wallets.every(w => data.sessions.filter(s => s.ownerId === w.userId && s.state !== "completed").reduce((sum,s) => sum + s.reservedMinor,0) <= w.balanceMinor),
  "Backend snapshot contains simulated telemetry or an invalid credit hold.");
export type Vehicle = z.infer<typeof vehicleSchema>;
export type Station = z.infer<typeof stationSchema>;
export type Bay = z.infer<typeof baySchema>;
export type Device = z.infer<typeof deviceSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Command = z.infer<typeof commandSchema>;
export type Ledger = z.infer<typeof ledgerSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type Notification=z.infer<typeof notificationSchema>;
export type Policy = z.infer<typeof policySchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type StopReason = typeof stopReasons[number];
export type Actor = { id: string; role: "owner" | "admin" };
export interface Coordinates { lat: number; lng: number }
export interface StartInput { stationId: string; bayId: string; vehicleId: string; ownerId?: string; requestId: string }
