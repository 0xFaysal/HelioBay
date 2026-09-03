import type { Database } from '../../shared/database/client.js';
import type { IotConfig } from '../../config/iot.js';
import { z } from 'zod';
import { deviceMessage, parseTopic, verifySignature, thresholds, plugState, type DeviceMessage, type Telemetry } from './protocol.js';
import { RealtimeBus } from '../realtime/bus.js';
import {recordStationEnergy}from'../energy/service.js';
const envelope = z.object({ payload: z.unknown(), signature: z.string().length(64) }).strict();
export type SecretResolver = (reference: string) => string | undefined;
export const resolveDeviceSecret: SecretResolver = ref => { const m = /^secret:\/\/env\/([A-Z][A-Z0-9_]+)$/.exec(ref); return m ? process.env[m[1]!] : undefined; };
export class DeviceIngress {
    constructor(private db: Database, private config: IotConfig, private bus: RealtimeBus, private handler: (deviceId: string, message: DeviceMessage) => Promise<void>, private secrets: SecretResolver = resolveDeviceSecret) { }
    private draining = false;
    async receive(topicName: string, bytes: Buffer, retained = false) {
        if (bytes.length > 8192)
            return false;
        const scope = parseTopic(topicName);
        if (!scope)
            return false;
        let decoded: z.infer<typeof envelope>;
        try {
            decoded = envelope.parse(JSON.parse(bytes.toString('utf8')));
        }
        catch {
            return false;
        }
        const device = await this.db.device.findUnique({ where: { publicId: scope.device }, include: { station: true } });
        if (!device || device.station.code !== scope.station || device.status === 'DISABLED' || !device.credentialRef)
            return false;
        const secret = this.secrets(device.credentialRef);
        if (!secret || secret.length < 32 || !verifySignature(topicName, decoded.payload, decoded.signature, secret))
            return false;
        const parsed = deviceMessage.safeParse(decoded.payload);
        if (!parsed.success)
            return false;
        const message = parsed.data;
        const expected = { telemetry: 'telemetry', ack: 'acks', event: 'events', status: 'status' }[message.kind];
        if (scope.channel !== expected)
            return false;
        if (message.dataSource !== device.dataSource || (message.dataSource === 'SIMULATOR' && !this.config.ALLOW_DEVICE_SIMULATOR))
            return false;
        if (retained && !(message.kind === 'status' && !message.online))
            return false;
        const age = Date.now() - Date.parse(message.at);
        // Last-will is an offline hint only; never billing/finalization proof.
        const will = message.kind === 'status' && !message.online;
        if (!will && (age > Math.min(60000, this.config.DEVICE_OFFLINE_TIMEOUT_SECONDS * 1000) || age < -5000))
            return false;
        let connected = false, plugChanged = false;
        const accepted = await this.db.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Device" WHERE id=${device.id} FOR UPDATE`;
            const current = await tx.device.findUniqueOrThrow({ where: { id: device.id } });
            const enqueue = () => tx.deviceInbox.create({ data: { deviceId: device.id, payload: message } });
            if (will) {
                if (current.bootId !== message.bootId)
                    return false;
                await tx.device.update({ where: { id: device.id }, data: { status: 'OFFLINE' } });
                await enqueue();
                return true;
            }
            if (BigInt(message.sequence) <= current.lastSequence)
                return false;
            if (message.kind !== 'status' && current.bootId !== message.bootId)
                return false;
            let bay;
            if ('bayId' in message) {
                bay = await tx.bay.findFirst({ where: { code: message.bayId, deviceId: device.id, stationId: device.stationId } });
                if (!bay)
                    return false;
                if (message.kind === 'telemetry' && bay.lastTelemetry) {
                    const previous = bay.lastTelemetry as {
                        at?: string;
                    };
                    if (previous.at && Date.parse(message.at) < Date.parse(previous.at))
                        return false;
                }
            }
            await tx.device.update({ where: { id: device.id }, data: { lastSequence: BigInt(message.sequence), lastSeenAt: new Date(), bootId: message.bootId, status: message.kind === 'telemetry' && !message.online ? 'OFFLINE' : 'ONLINE', ...(message.kind === 'telemetry' ? { lastTelemetry: message } : {}) } });
            if ((message.kind === 'status' || message.kind === 'telemetry') && message.online)
                await tx.station.updateMany({ where: { id: device.stationId, primaryDeviceId: device.id, status: { not: 'MAINTENANCE' } }, data: { status: 'ONLINE' } });
            if (message.kind === 'status') {
                await enqueue();
                return true;
            }
            if (message.kind === 'telemetry' && bay) {
                const limits = thresholds(current.thresholds, bay.thresholds), plug = plugState(message, limits);
                connected = plug.connected;
                plugChanged = connected !== bay.plugConnected;
                const active = await tx.chargingSession.findFirst({ where: { bayId: bay.id, completedAt: null, status: { notIn: ['COMPLETED', 'FAILED'] } } });
                const faults = await tx.fault.count({ where: { deviceId: device.id, status: { not: 'RESOLVED' }, OR: [{ bayId: null }, { bayId: bay.id }] } });
                await tx.bay.update({ where: { id: bay.id }, data: { lastTelemetry: message, lastTelemetryAt: new Date(message.at), plugConnected: plug.connected, relayOn: message.relayOn, ...(!active ? { status: !bay.enabled ? 'DISABLED' : !message.online ? 'OFFLINE' : message.faultCodes.length || faults || message.relayOn ? 'FAULT' : plug.connected ? 'PLUGGED' : 'AVAILABLE' } : {}) } });
                if (!current.lastSampleAt || Date.now() - current.lastSampleAt.getTime() >= this.config.TELEMETRY_SAMPLE_INTERVAL_MS || message.final) {
                    const session = message.sessionId ? await tx.chargingSession.findFirst({ where: { id: message.sessionId, deviceId: device.id, bayId: bay.id } }) : null;
                    const sample=await tx.telemetrySample.create({ data: { deviceId: device.id, bayId: bay.id, sessionId: session?.id, sequence: BigInt(message.sequence), recordedAt: new Date(message.at), energyMWh: BigInt(message.energyMWh), powerW: message.chargingPowerW, voltageMv: message.chargingVoltageMv, currentMa: message.chargingCurrentMa, source: message.source, simulated: message.dataSource === 'SIMULATOR', dataSource: message.dataSource, measurements: message } });
                    await recordStationEnergy(tx,device.stationId,sample,message);
                    await tx.device.update({ where: { id: device.id }, data: { lastSampleAt: new Date() } });
                }
            }
            await enqueue();
            return true;
        });
        if (!accepted)
            return false;
        if (message.kind === 'status')
            this.bus.publish({ type: 'station.status', stationId: device.stationId, public: true, data: { stationId: device.stationId, deviceId: device.id, online: message.online, dataSource: message.dataSource } });
        if (message.kind === 'telemetry')
            this.bus.publish({ type: 'bay.status', stationId: device.stationId, public: true, data: { stationId: device.stationId, bayId: message.bayId, plugConnected: connected, relayOn: message.relayOn, dataSource: message.dataSource } });
        if (message.kind === 'telemetry' && plugChanged)
            this.bus.publish({ type: connected ? 'plug.connected' : 'plug.disconnected', stationId: device.stationId, public: true, data: { stationId: device.stationId, bayId: message.bayId, dataSource: message.dataSource } });
        await this.drain();
        return true;
    }
    async drain() {
        if (this.draining)
            return;
        this.draining = true;
        try {
            for (const item of await this.db.deviceInbox.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 200 })) {
                await this.handler(item.deviceId, deviceMessage.parse(item.payload));
                await this.db.deviceInbox.delete({ where: { id: item.id } });
            }
        }
        finally {
            this.draining = false;
        }
    }
    async prune() { return this.db.telemetrySample.deleteMany({ where: { receivedAt: { lt: new Date(Date.now() - this.config.TELEMETRY_RETENTION_DAYS * 86400000) } } }); }
}
export const telemetryFrom = (value: unknown) => value as Telemetry;
