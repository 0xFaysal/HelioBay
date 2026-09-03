import { z } from 'zod';
import type { DeviceMessage, Telemetry } from '../iot/protocol.js';
const base = { commandId: z.string().min(1).max(100), type: z.enum(['START', 'STOP', 'EMERGENCY_STOP', 'TEST', 'RESTART']), sessionId: z.string().nullable(), stationId: z.string(), deviceId: z.string(), issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime() };
export const commandSchema = z.object({ ...base, bayId: z.string().optional(), relayChannel: z.number().int().min(1).optional(), maxCostMinor: z.string().regex(/^\d+$/).optional(), maxEnergyMWh: z.string().regex(/^\d+$/).optional(), maxDurationSeconds: z.number().int().positive().optional(), telemetryIntervalMs: z.number().int().positive().optional(), dataSource: z.literal('SIMULATOR').optional(), reason: z.string().optional(), relayOn: z.literal(false).optional() }).strict();
export const scenarios = ['normal', 'unplug', 'battery-full', 'credit-exhausted', 'timeout', 'sensor-fault', 'emergency-stop', 'command-failure'] as const;
export type Scenario = typeof scenarios[number];
export class SimulatedDevice {
    private seq = BigInt(Date.now()) * 1000n;
    private boot = crypto.randomUUID();
    private seen = new Set<string>();
    private sessions = new Set<string>();
    private sessionId: string | null = null;
    private energy = 0n;
    private maximum = 0n;
    private relay = false;
    private plugged = false;
    private percent = 50;
    private ticks = 0;
    private activeTicks = 0;
    private elapsedMs = 0;
    private durationMs = 0;
    private faults: string[] = [];
    private finished = false;
    private remainder = 0n;
    constructor(readonly options: {
        stationId: string;
        deviceId: string;
        bayId: string;
        relayChannel: number;
        speed: number;
        scenario: Scenario;
    }, private emit: (message: DeviceMessage) => Promise<void>) { if (options.speed < 1 || options.speed > 60 || !Number.isInteger(options.speed))
        throw new Error('Speed must be 1..60'); }
    private common() { return { bootId: this.boot, sequence: (++this.seq).toString(), at: new Date().toISOString(), dataSource: 'SIMULATOR' as const }; }
    status(online: boolean): DeviceMessage { return { ...this.common(), kind: 'status', online }; }
    async connect() { await this.emit(this.status(true)); await this.sample(); }
    private async sample() { const solar = [900, 1000, 1100, 1000][this.ticks % 4]!; const message: Telemetry = { ...this.common(), kind: 'telemetry', bayId: this.options.bayId, sessionId: this.sessionId, online: true, plugConnected: this.plugged, relayOn: this.relay, batterySenseAvailable: true, vehicleBatteryMv: this.plugged ? 48000 + this.percent * 20 : 0, vehicleBatteryPercent: this.plugged ? this.percent : null, batteryPercentageEstimated: true, solarVoltageMv: 50000, solarCurrentMa: solar * 20, solarPowerW: solar, chargingVoltageMv: this.plugged ? 50000 : 0, chargingCurrentMa: this.relay ? 20000 : 0, chargingPowerW: this.relay ? 1000 : 0, energyMWh: this.energy.toString(), stationBatteryPercent: 80, source: 'SOLAR', faultCodes: this.faults, final: this.finished }; await this.emit(message); }
    async command(input: unknown) {
        const parsed = commandSchema.safeParse(input);
        if (!parsed.success)
            return;
        const c = parsed.data;
        if (c.stationId !== this.options.stationId || c.deviceId !== this.options.deviceId || Date.parse(c.expiresAt) < Date.now() || Date.parse(c.issuedAt) > Date.now() + 5000)
            return;
        if (c.bayId && c.bayId !== this.options.bayId)
            return;
        if (c.relayChannel && c.relayChannel !== this.options.relayChannel)
            return;
        const duplicate = this.seen.has(c.commandId);
        let accepted = true;
        if (!duplicate) {
            if (c.type === 'START') {
                accepted = this.options.scenario !== 'command-failure' && this.plugged && !this.relay && (!this.sessionId || this.finished) && !!c.sessionId && !this.sessions.has(c.sessionId) && !!c.maxEnergyMWh && BigInt(c.maxEnergyMWh) > 0n && !!c.maxCostMinor && BigInt(c.maxCostMinor) > 0n && !!c.maxDurationSeconds && c.dataSource === 'SIMULATOR';
                if (accepted) {
                    this.sessionId = c.sessionId;
                    this.sessions.add(c.sessionId!);
                    this.maximum = BigInt(c.maxEnergyMWh!);
                    this.durationMs = c.maxDurationSeconds! * 1000;
                    this.energy = 0n;
                    this.remainder = 0n;
                    this.elapsedMs = 0;
                    this.activeTicks = 0;
                    this.finished = false;
                    this.relay = true;
                }
            }
            else if (c.type === 'STOP' || c.type === 'EMERGENCY_STOP') {
                accepted = c.sessionId === this.sessionId;
                if (accepted) {
                    this.relay = false;
                    this.finished = true;
                }
            }
            else {
                accepted = !this.relay; /* TEST is diagnostics only. RESTART never energizes a relay. */
            }
            if (accepted)
                this.seen.add(c.commandId);
        }
        await this.emit({ ...this.common(), kind: 'ack', commandId: c.commandId, sessionId: c.sessionId, accepted, relayOn: this.relay, energyMWh: this.energy.toString(), ...(!accepted ? { failureCode: 'COMMAND_REJECTED' } : {}) });
        if (this.finished)
            await this.sample();
    }
    async step(ms: number) {
        this.ticks++;
        if (!this.sessionId)
            this.plugged = true;
        if (this.relay) {
            this.activeTicks++;
            this.elapsedMs += ms;
            const numerator = 1000n * BigInt(ms) * BigInt(this.options.speed) + this.remainder;
            const delta = numerator / 3600n;
            this.remainder = numerator % 3600n;
            this.energy = this.energy + delta > this.maximum ? this.maximum : this.energy + delta;
            if (this.activeTicks === 4) {
                if (this.options.scenario === 'unplug')
                    this.plugged = false;
                if (this.options.scenario === 'battery-full')
                    this.percent = 100;
                if (this.options.scenario === 'sensor-fault')
                    this.faults = ['SENSOR_FAULT'];
                if (this.options.scenario === 'emergency-stop') {
                    this.faults = ['EMERGENCY_STOP'];
                    await this.emit({ ...this.common(), kind: 'event', bayId: this.options.bayId, event: 'EMERGENCY_STOP', code: 'EMERGENCY_STOP' });
                }
            }
            if (this.options.scenario === 'normal' && this.activeTicks >= 12)
                this.percent = 100;
            if (this.energy >= this.maximum || this.elapsedMs >= this.durationMs || !this.plugged || this.percent === 100 || this.faults.length) {
                this.relay = false;
                this.finished = true;
            }
        }
        await this.sample();
        return this.options.scenario === 'timeout' && this.activeTicks >= 3;
    }
}
