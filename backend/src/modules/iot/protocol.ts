import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'node:crypto';
export const integerText = z.string().regex(/^\d{1,18}$/);
const identifier = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const base = { bootId: identifier, sequence: integerText, at: z.iso.datetime(), dataSource: z.enum(['LIVE_HARDWARE', 'ESTIMATED', 'DIGITAL_TWIN', 'SIMULATOR']) };
export const telemetrySchema = z.object({ ...base, kind: z.literal('telemetry'), bayId: identifier, sessionId: identifier.nullable(), online: z.boolean(), plugConnected: z.boolean(), relayOn: z.boolean(), batterySenseAvailable: z.boolean(), vehicleBatteryMv: z.number().int().min(0).max(1000000).nullable(), vehicleBatteryPercent: z.number().int().min(0).max(100).nullable(), batteryPercentageEstimated: z.literal(true), solarVoltageMv: z.number().int().min(0).max(1000000), solarCurrentMa: z.number().int().min(0).max(2000000), solarPowerW: z.number().int().min(0).max(1000000), chargingVoltageMv: z.number().int().min(0).max(1000000), chargingCurrentMa: z.number().int().min(0).max(2000000), chargingPowerW: z.number().int().min(0).max(1000000), energyMWh: integerText, stationBatteryPercent: z.number().int().min(0).max(100).nullable(), source: z.enum(['SOLAR', 'STORAGE', 'GRID']), faultCodes: z.array(identifier).max(8), final: z.boolean().default(false) }).strict();
export const ackSchema = z.object({ ...base, kind: z.literal('ack'), commandId: identifier, sessionId: identifier.nullable(), accepted: z.boolean(), relayOn: z.boolean(), energyMWh: integerText, failureCode: identifier.optional() }).strict();
export const statusSchema = z.object({ ...base, kind: z.literal('status'), online: z.boolean() }).strict();
export const eventSchema = z.object({ ...base, kind: z.literal('event'), bayId: identifier, event: z.enum(['EMERGENCY_STOP', 'SENSOR_FAULT']), code: identifier }).strict();
export const deviceMessage = z.discriminatedUnion('kind', [telemetrySchema, ackSchema, statusSchema, eventSchema]);
export type DeviceMessage = z.infer<typeof deviceMessage>;
export type Telemetry = z.infer<typeof telemetrySchema>;
export type Ack = z.infer<typeof ackSchema>;
export const thresholdsSchema = z.object({ senseMinMv: z.number().int().min(1).max(1000000).default(1000), senseMaxMv: z.number().int().min(1).max(1000000).default(1000000), fullBatteryMv: z.number().int().min(0).max(1000000).default(0), fullCurrentMa: z.number().int().min(0).max(10000).default(100), chargingCurrentMa: z.number().int().min(0).max(10000).default(100), maxVoltageMv: z.number().int().min(1).max(1000000).default(900000), maxCurrentMa: z.number().int().min(1).max(2000000).default(500000), stopLatencyMs: z.number().int().min(100).max(30000).default(2000) }).strict().refine(v => v.senseMinMv <= v.senseMaxMv, 'Sense limits are inverted');
export function thresholds(device: unknown, bay: unknown) { return thresholdsSchema.parse({ ...((device ?? {}) as object), ...((bay ?? {}) as object) }); }
export function plugState(t: Telemetry, limits: z.infer<typeof thresholdsSchema>) {
    const sensed = t.vehicleBatteryMv !== null && t.vehicleBatteryMv >= limits.senseMinMv && t.vehicleBatteryMv <= limits.senseMaxMv;
    const connected = t.batterySenseAvailable ? sensed : t.plugConnected;
    const full = connected && (t.vehicleBatteryPercent === 100 || (limits.fullBatteryMv > 0 && (t.vehicleBatteryMv ?? 0) >= limits.fullBatteryMv && t.chargingCurrentMa <= limits.fullCurrentMa));
    return { connected, full, charging: connected && t.relayOn && t.chargingCurrentMa >= limits.chargingCurrentMa };
}
export function topic(station: string, device: string, channel: string) { return `heliobay/v1/stations/${station}/devices/${device}/${channel}`; }
export function parseTopic(value: string) { const m = /^heliobay\/v1\/stations\/([A-Za-z0-9_-]+)\/devices\/([A-Za-z0-9_-]+)\/(telemetry|events|acks|status)$/.exec(value); return m ? { station: m[1]!, device: m[2]!, channel: m[3]! } : null; }
export function canonical(value: unknown): string { if (value === null || typeof value !== 'object')
    return JSON.stringify(value); if (Array.isArray(value))
    return `[${value.map(canonical).join(',')}]`; return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`; }
export function sign(topicName: string, payload: unknown, key: string) { return createHmac('sha256', key).update(`${topicName}\n${canonical(payload)}`).digest('hex'); }
export function verifySignature(topicName: string, payload: unknown, signature: string, key: string) { if (!/^[a-f0-9]{64}$/.test(signature))
    return false; return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(topicName, payload, key), 'hex')); }
