import { z } from 'zod';
import type { Database } from '../../shared/database/client.js';
import type { Prisma, ChargingSession, DeviceCommand } from '../../generated/prisma/client.js';
import type { IotConfig } from '../../config/iot.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { lockWallet, postLedger, fingerprint } from '../wallets/ledger.js';
import { chargingBudget, cappedChargingCost, stoppingMargin } from '../wallets/charging-budget.js';
import { RealtimeBus } from '../realtime/bus.js';
import { thresholds, plugState, type Telemetry, type Ack, type DeviceMessage } from '../iot/protocol.js';
import { resolveDeviceSecret, type SecretResolver } from '../iot/ingress.js';
import type { CommandPublisher } from '../iot/gateway.js';
import { transition, type StopReason } from './state.js';
export const startInput = z.object({ stationId: z.string().min(1).max(100), bayId: z.string().min(1).max(100), vehicleId: z.string().min(1).max(128) }).strict();
export class ChargingEngine {
    constructor(readonly db: Database, readonly config: IotConfig, readonly bus: RealtimeBus, private publisher: CommandPublisher, private secrets: SecretResolver = resolveDeviceSecret) { }
    private notify(type: string, session: ChargingSession, data: unknown = session) { this.bus.publish({ type, userId: session.ownerId, sessionId: session.id, data }); }
    private async lockSession(tx: Prisma.TransactionClient, id: string) { await tx.$queryRaw `SELECT id FROM "ChargingSession" WHERE id=${id} FOR UPDATE`; return tx.chargingSession.findUniqueOrThrow({ where: { id } }); }
    async start(userId: string, input: unknown, key: string, requestId: string, adminContext?: {
        actorId: string;
        reason: string;
    }) {
        const data = startInput.parse(input), hash = fingerprint(data);
        const existing = await this.db.chargingSession.findUnique({ where: { ownerId_requestId: { ownerId: userId, requestId: key } } });
        if (existing) {
            if (existing.startRequestHash !== hash)
                throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Start key was used for another request');
            return existing;
        }
        if (!this.publisher.ready())
            throw new ApiError(503, 'DEVICE_GATEWAY_OFFLINE', 'Device gateway is unavailable');
        const session = await this.db.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
            let station = await tx.station.findFirstOrThrow({ where: { OR: [{ code: data.stationId }, { id: data.stationId }] }, include: { tariff: true } });
            const selectedBay = await tx.bay.findFirstOrThrow({ where: { OR: [{ code: data.bayId }, { id: data.bayId }], stationId: station.id } });
            await tx.$queryRaw `SELECT id FROM "Device" WHERE id=${selectedBay.deviceId} FOR UPDATE`;
            const device = await tx.device.findUniqueOrThrow({ where: { id: selectedBay.deviceId } });
            await tx.$queryRaw `SELECT id FROM "Station" WHERE id=${station.id} FOR UPDATE`;
            station = await tx.station.findUniqueOrThrow({ where: { id: station.id }, include: { tariff: true } });
            await tx.$queryRaw `SELECT id FROM "Tariff" WHERE id=${station.tariffId} FOR SHARE`;
            station = await tx.station.findUniqueOrThrow({ where: { id: station.id }, include: { tariff: true } });
            let bay = await tx.bay.findFirstOrThrow({ where: { OR: [{ code: data.bayId }, { id: data.bayId }], stationId: station.id, deviceId: device.id } });
            await tx.$queryRaw `SELECT id FROM "Bay" WHERE id=${bay.id} FOR UPDATE`;
            bay = await tx.bay.findFirstOrThrow({ where: { id: bay.id, stationId: station.id, deviceId: device.id } });
            const wallet = await lockWallet(tx, userId);
            const duplicate = await tx.chargingSession.findUnique({ where: { ownerId_requestId: { ownerId: userId, requestId: key } } });
            if (duplicate) {
                if (duplicate.startRequestHash !== hash)
                    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Start key was used for another request');
                return duplicate;
            }
            const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
            if (user.status !== 'ACTIVE')
                throw new ApiError(403, 'ACCOUNT_INACTIVE', 'Account must be active');
            if (device.dataSource === 'SIMULATOR' && !user.isDemo)
                throw new ApiError(422, 'DEMO_ACCOUNT_REQUIRED', 'Simulator charging requires a demo account');
            const vehicle = await tx.vehicle.findFirstOrThrow({ where: { id: data.vehicleId, ownerId: userId } });
            if (station.status !== 'ONLINE' || !station.isOpen || !station.tariff.active)
                throw new ApiError(422, 'STATION_UNAVAILABLE', 'Station is closed or unavailable');
            if (device.status !== 'ONLINE' || !device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > this.config.DEVICE_OFFLINE_TIMEOUT_SECONDS * 1000)
                throw new ApiError(422, 'DEVICE_OFFLINE', 'Device heartbeat is stale');
            if (!device.credentialRef || (this.secrets(device.credentialRef)?.length ?? 0) < 32)
                throw new ApiError(422, 'DEVICE_NOT_PROVISIONED', 'Device credentials are not configured');
            if (device.dataSource !== 'LIVE_HARDWARE' && !(device.dataSource === 'SIMULATOR' && this.config.ALLOW_DEVICE_SIMULATOR))
                throw new ApiError(422, 'NON_AUTHORITATIVE_METER', 'This source is not authorized for charging');
            if (!bay.enabled || !['AVAILABLE', 'PLUGGED'].includes(bay.status) || bay.relayOn)
                throw new ApiError(409, 'BAY_UNAVAILABLE', 'Bay is unavailable');
            if (vehicle.connectorType !== bay.connectorType)
                throw new ApiError(422, 'CONNECTOR_MISMATCH', 'Vehicle connector does not match this bay');
            if (!bay.plugConnected || !bay.lastTelemetryAt || Date.now() - bay.lastTelemetryAt.getTime() > this.config.DEVICE_OFFLINE_TIMEOUT_SECONDS * 1000)
                throw new ApiError(422, 'PLUG_REQUIRED', 'Connect the vehicle before starting');
            if (await tx.fault.count({ where: { deviceId: device.id, status: { not: 'RESOLVED' }, OR: [{ bayId: null }, { bayId: bay.id }] } }))
                throw new ApiError(422, 'BLOCKING_FAULT', 'Resolve the device or bay fault first');
            if (await tx.chargingSession.count({ where: { completedAt: null, status: { notIn: ['COMPLETED', 'FAILED'] }, OR: [{ ownerId: userId }, { bayId: bay.id }, { vehicleId: vehicle.id }] } }))
                throw new ApiError(409, 'ACTIVE_SESSION', 'An active or unreconciled session already exists');
            const held = await tx.creditReservation.aggregate({ where: { walletId: wallet.id, status: 'HELD' }, _sum: { amountMinor: true } });
            const reserved = wallet.balanceMinor - (held._sum.amountMinor ?? 0n);
            if (reserved <= 0n)
                throw new ApiError(422, 'INSUFFICIENT_BALANCE', 'Positive available Credits are required');
            const maxEnergy = chargingBudget(reserved, BigInt(station.tariff.priceMinorPerKwh), BigInt(this.config.MAX_SESSION_ENERGY_MWH)).maxEnergyMWh;
            if (maxEnergy <= 0n)
                throw new ApiError(422, 'INSUFFICIENT_BALANCE', 'Credits are too low for the energy authorization');
            let created = await tx.chargingSession.create({ data: { ownerId: userId, stationId: station.id, bayId: bay.id, deviceId: device.id, vehicleId: vehicle.id, tariffId: station.tariff.id, tariffMinorPerKwh: station.tariff.priceMinorPerKwh, requestId: key, startRequestHash: hash, reservedMinor: reserved, maxEnergyMWh: maxEnergy, maxDurationSeconds: this.config.MAX_SESSION_DURATION_SECONDS, dataSource: device.dataSource } });
            created = await transition(tx, created, 'READY');
            created = await transition(tx, created, 'START_PENDING');
            const reservation = await tx.creditReservation.create({ data: { walletId: wallet.id, sessionId: created.id, amountMinor: reserved } });
            await postLedger(tx, { userId, actorId: userId, kind: 'RESERVATION', amountMinor: -reserved, key: `session:${created.id}:reserve`, hash: fingerprint({ sessionId: created.id, reserved }), description: 'Credits reserved for charging', reservationId: reservation.id, sessionId: created.id, isSandbox: device.dataSource !== 'LIVE_HARDWARE' });
            const now = new Date(), expires = new Date(now.getTime() + this.config.COMMAND_ACK_TIMEOUT_SECONDS * 1000);
            const command = await tx.deviceCommand.create({ data: { deviceId: device.id, bayId: bay.id, sessionId: created.id, actorId: userId, type: 'START', idempotencyKey: `start:${created.id}`, requestHash: hash, expiresAt: expires } });
            await tx.deviceCommand.update({ where: { id: command.id }, data: { payload: { commandId: command.id, type: 'START', sessionId: created.id, stationId: station.code, deviceId: device.publicId, bayId: bay.code, relayChannel: bay.relayChannel, maxCostMinor: reserved.toString(), maxEnergyMWh: maxEnergy.toString(), maxDurationSeconds: created.maxDurationSeconds, telemetryIntervalMs: this.config.TELEMETRY_INTERVAL_MS, issuedAt: now.toISOString(), expiresAt: expires.toISOString(), dataSource: device.dataSource } } });
            await tx.bay.update({ where: { id: bay.id }, data: { status: 'STARTING' } });
            await tx.auditLog.create({ data: { actorId: adminContext?.actorId ?? userId, reason: adminContext?.reason, action: 'SESSION_START_REQUESTED', targetType: 'ChargingSession', targetId: created.id, requestId, after: { reservedMinor: reserved.toString(), commandId: command.id } } });
            return created;
        });
        this.notify('command.pending', session);
        return session;
    }
    private async queueStop(tx: Prisma.TransactionClient, session: ChargingSession, reason: StopReason, actorId: string, key: string, requestId: string, retry = false, auditReason?: string) {
        if (session.completedAt)
            return session;
        const previous = await tx.deviceCommand.findFirst({ where: { sessionId: session.id, type: { in: ['STOP', 'EMERGENCY_STOP'] } }, orderBy: { issuedAt: 'desc' } });
        if (previous && !retry)
            return session;
        const device = await tx.device.findUniqueOrThrow({ where: { id: session.deviceId }, include: { station: true } }), bay = await tx.bay.findUniqueOrThrow({ where: { id: session.bayId } });
        const existing = await tx.deviceCommand.findUnique({ where: { actorId_idempotencyKey: { actorId, idempotencyKey: key } } });
        if (existing) {
            if (existing.sessionId !== session.id)
                throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Command key belongs to another session');
            return session;
        }
        const stopped = await transition(tx, session, 'STOP_PENDING');
        const expires = new Date(Date.now() + this.config.COMMAND_ACK_TIMEOUT_SECONDS * 1000);
        const command = await tx.deviceCommand.create({ data: { deviceId: device.id, bayId: bay.id, sessionId: session.id, actorId, type: reason === 'EMERGENCY_STOP' ? 'EMERGENCY_STOP' : 'STOP', idempotencyKey: key, expiresAt: expires } });
        await tx.deviceCommand.update({ where: { id: command.id }, data: { payload: { commandId: command.id, type: command.type, sessionId: session.id, stationId: device.station.code, deviceId: device.publicId, bayId: bay.code, relayChannel: bay.relayChannel, issuedAt: command.issuedAt.toISOString(), expiresAt: expires.toISOString(), reason: session.stopReason ?? reason } } });
        await tx.bay.update({ where: { id: bay.id }, data: { status: 'STOPPING' } });
        await tx.auditLog.create({ data: { actorId, action: retry ? 'SESSION_RECONCILIATION_REQUESTED' : 'SESSION_STOP_REQUESTED', targetType: 'ChargingSession', targetId: session.id, reason: auditReason ?? reason, requestId, after: { commandId: command.id } } });
        return tx.chargingSession.update({ where: { id: stopped.id }, data: { stopReason: session.stopReason ?? reason } });
    }
    async stop(id: string, actorId: string, reason: StopReason, key: string, requestId: string, admin = false, retry = false, auditReason?: string) {
        const result = await this.db.$transaction(async (tx) => { const s = await this.lockSession(tx, id); if (!admin && s.ownerId !== actorId)
            throw new ApiError(404, 'NOT_FOUND', 'Session not found'); return this.queueStop(tx, s, reason, actorId, key, requestId, retry, auditReason); });
        this.notify('command.pending', result);
        return result;
    }
    async dispatch() {
        if (!this.publisher.ready())
            return;
        const commands = await this.db.deviceCommand.findMany({ where: { status: 'PENDING', expiresAt: { gt: new Date() }, OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(Date.now() - 2000) } }] }, orderBy: { issuedAt: 'asc' }, take: 50, include: { device: { include: { station: true } } } });
        for (const command of commands) {
            if (!command.payload || !command.device.credentialRef)
                continue;
            const key = this.secrets(command.device.credentialRef);
            if (!key)
                continue;
            const claim = await this.db.deviceCommand.updateMany({ where: { id: command.id, status: 'PENDING', OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: new Date(Date.now() - 2000) } }] }, data: { lastAttemptAt: new Date(), attempts: { increment: 1 } } });
            if (!claim.count)
                continue;
            try {
                await this.publisher.publish(command.device.station.code, command.device.publicId, command.payload, key);
                await this.db.deviceCommand.update({ where: { id: command.id }, data: { publishedAt: new Date() } });
            }
            catch { /* Durable command remains pending until retry/timeout. */ }
        }
    }
    private async finish(tx: Prisma.TransactionClient, session: ChargingSession, energy: bigint, failed = false) {
        if (session.completedAt)
            return session;
        const wallet = await lockWallet(tx, session.ownerId), reservation = await tx.creditReservation.findUniqueOrThrow({ where: { sessionId: session.id } });
        const cost = failed ? 0n : cappedChargingCost(energy, BigInt(session.tariffMinorPerKwh), reservation.amountMinor);
        await tx.creditReservation.update({ where: { id: reservation.id }, data: { status: failed ? 'RELEASED' : 'SETTLED' } });
        if (cost > 0n)
            await postLedger(tx, { userId: session.ownerId, actorId: session.ownerId, kind: 'CHARGING_DEBIT', amountMinor: -cost, key: `session:${session.id}:debit`, hash: fingerprint({ sessionId: session.id, cost }), description: 'Final charging debit', sessionId: session.id, reservationId: reservation.id, isSandbox: session.dataSource !== 'LIVE_HARDWARE' });
        await postLedger(tx, { userId: session.ownerId, actorId: session.ownerId, kind: 'RESERVATION_RELEASE', amountMinor: reservation.amountMinor, key: `session:${session.id}:release`, hash: fingerprint({ sessionId: session.id }), description: 'Charging reservation closed; unused Credits released', sessionId: session.id, reservationId: reservation.id, isSandbox: session.dataSource !== 'LIVE_HARDWARE' });
        const ending = wallet.balanceMinor - cost;
        if (!failed && session.status !== 'STOP_PENDING' && session.status !== 'INTERRUPTED')
            session = await transition(tx, session, 'STOP_PENDING');
        session = await transition(tx, session, failed ? 'FAILED' : session.reconciliationRequired ? 'INTERRUPTED' : 'COMPLETED');
        const reason = session.stopReason ?? 'SAFETY_FAULT';
        const receipt = { sessionId: session.id, energyMWh: energy.toString(), costMinor: cost.toString(), reservedMinor: reservation.amountMinor.toString(), unusedMinor: (reservation.amountMinor - cost).toString(), endingBalanceMinor: ending.toString(), tariffMinorPerKwh: session.tariffMinorPerKwh, stopReason: reason, dataSource: session.dataSource, confirmed: true, completedAt: new Date().toISOString() };
        const finished = await tx.chargingSession.update({ where: { id: session.id }, data: { energyMWh: energy, costMinor: cost, completedAt: new Date(), endingBalanceMinor: ending, reconciliationRequired: false, stopReason: reason, receipt } });
        await tx.notification.upsert({where:{userId_type_reference:{userId:session.ownerId,type:'CHARGING_COMPLETED',reference:session.id}},create:{userId:session.ownerId,type:'CHARGING_COMPLETED',title:'Charging complete',message:`Final cost ${cost.toString()} poisha. Unused authorization released.`,reference:session.id},update:{message:`Final cost ${cost.toString()} poisha. Unused authorization released.`}});
        const bay = await tx.bay.findUniqueOrThrow({ where: { id: session.bayId } });
        const faults = await tx.fault.count({ where: { deviceId: session.deviceId, status: { not: 'RESOLVED' }, OR: [{ bayId: null }, { bayId: session.bayId }] } });
        await tx.bay.update({ where: { id: session.bayId }, data: { relayOn: false, status: !bay.enabled ? 'DISABLED' : faults ? 'FAULT' : bay.plugConnected ? 'PLUGGED' : 'AVAILABLE' } });
        await tx.auditLog.create({ data: { actorId: session.ownerId, action: 'SESSION_FINALIZED', targetType: 'ChargingSession', targetId: session.id, requestId: `final:${session.id}`, after: receipt } });
        return finished;
    }
    async acknowledge(deviceId: string, message: Ack) {
        const cmd = await this.db.deviceCommand.findFirst({ where: { id: message.commandId, deviceId } });
        if (!cmd || cmd.sessionId !== message.sessionId)
            return;
        if (!cmd.sessionId) {
            const accepted = message.accepted && !message.relayOn;
            const changed = await this.db.deviceCommand.updateMany({ where: { id: cmd.id, status: 'PENDING', expiresAt: { gt: new Date() } }, data: { status: accepted ? 'ACKNOWLEDGED' : 'FAILED', acknowledgedAt: new Date(), failureCode: message.relayOn ? 'UNSAFE_RELAY_STATE' : message.failureCode } });
            if (changed.count)
                this.bus.publish({ type: accepted ? 'command.acknowledged' : 'command.failed', data: { commandId: cmd.id, deviceId } });
            return;
        }
        const session = await this.db.$transaction(async (tx) => {
            let s = await this.lockSession(tx, cmd.sessionId!);
            if (s.completedAt)
                return s;
            const current = await tx.deviceCommand.findUniqueOrThrow({ where: { id: cmd.id } });
            if (current.status === 'ACKNOWLEDGED' || current.status === 'FAILED')
                return s;
            const late = current.expiresAt < new Date() || current.status === 'TIMED_OUT';
            await tx.deviceCommand.update({ where: { id: cmd.id }, data: { status: message.accepted ? 'ACKNOWLEDGED' : 'FAILED', acknowledgedAt: new Date(), failureCode: message.failureCode } });
            if (cmd.type === 'START') {
                if (!message.accepted && !message.relayOn && BigInt(message.energyMWh) === 0n && s.energyMWh === 0n && s.status === 'START_PENDING') {
                    s = await tx.chargingSession.update({ where: { id: s.id }, data: { stopReason: 'SAFETY_FAULT' } });
                    return this.finish(tx, s, 0n, true);
                }
                if (message.accepted && message.relayOn && !late && s.status === 'START_PENDING') {
                    s = await transition(tx, s, 'CHARGING');
                    await tx.bay.update({ where: { id: s.bayId }, data: { status: 'CHARGING', relayOn: true } });
                    return tx.chargingSession.update({ where: { id: s.id }, data: { startedAt: new Date() } });
                }
                return this.queueStop(tx, s, 'SAFETY_FAULT', s.ownerId, `stop:${s.id}`, `ack:${cmd.id}`);
            }
            // STOP ACK is not final metering proof. The hold remains until signed final telemetry.
            if (!message.accepted) {
                s = await transition(tx, s, 'INTERRUPTED');
                return tx.chargingSession.update({ where: { id: s.id }, data: { reconciliationRequired: true } });
            }
            return s;
        });
        this.notify(message.accepted ? 'command.acknowledged' : 'command.failed', session, { commandId: cmd.id, session });
        if (session.completedAt)
            this.notify('session.stopped', session);
    }
    async telemetry(deviceId: string, t: Telemetry) {
        const active = await this.db.chargingSession.findFirst({ where: { deviceId, bay: { code: t.bayId }, completedAt: null, status: { notIn: ['COMPLETED', 'FAILED'] } } });
        if (active && active.id !== t.sessionId && new Date(t.at) > active.createdAt && (t.relayOn || (active.status === 'CHARGING' && new Date(t.at) > (active.startedAt ?? active.createdAt)))) {
            await this.stop(active.id, active.ownerId, 'SAFETY_FAULT', `stop:${active.id}`, `identity:${active.id}`, true);
            return;
        }
        if (!t.sessionId)
            return;
        const found = await this.db.chargingSession.findFirst({ where: { id: t.sessionId, deviceId, bay: { code: t.bayId } } });
        if (!found)
            return;
        const result = await this.db.$transaction(async (tx) => {
            let s = await this.lockSession(tx, found.id);
            if (s.completedAt)
                return s;
            const device = await tx.device.findUniqueOrThrow({ where: { id: deviceId } }), bay = await tx.bay.findUniqueOrThrow({ where: { id: s.bayId } });
            const limits = thresholds(device.thresholds, bay.thresholds), plug = plugState(t, limits), energy = BigInt(t.energyMWh), at = new Date(t.at);
            if (s.lastTelemetryAt && (at < s.lastTelemetryAt || (at.getTime() === s.lastTelemetryAt.getTime() && !t.final)))
                return s;
            const elapsed = BigInt(Math.max(1, at.getTime() - (s.lastTelemetryAt ?? s.startedAt ?? s.createdAt).getTime()));
            const plausible = BigInt(bay.maxPowerW) * elapsed * BigInt(device.simulationSpeed) / 3600n + BigInt(bay.maxPowerW) * 2n;
            if (energy < s.energyMWh || energy - s.energyMWh > plausible) {
                await this.raiseFault(tx, deviceId, bay.id, 'INVALID_ENERGY');
                return this.queueStop(tx, s, 'SAFETY_FAULT', s.ownerId, `stop:${s.id}`, `meter:${s.id}`);
            }
            const accrued = cappedChargingCost(energy, BigInt(s.tariffMinorPerKwh), s.reservedMinor);
            s = await tx.chargingSession.update({ where: { id: s.id }, data: { energyMWh: energy, costMinor: accrued, lastTelemetryAt: at } });
            const margin = stoppingMargin(bay.maxPowerW, limits.stopLatencyMs, this.config.TELEMETRY_INTERVAL_MS, device.simulationSpeed);
            const creditEnergy = s.reservedMinor * 1000000n / BigInt(s.tariffMinorPerKwh);
            let reason: StopReason | undefined;
            if (t.faultCodes.length || t.chargingVoltageMv > limits.maxVoltageMv || t.chargingCurrentMa > limits.maxCurrentMa || t.chargingPowerW > bay.maxPowerW) {
                reason = 'SAFETY_FAULT';
                await this.raiseFault(tx, deviceId, bay.id, t.faultCodes[0] ?? 'UNSAFE_ELECTRICAL_VALUE');
            }
            else if (!t.online)
                reason = 'DEVICE_OFFLINE';
            else if (!plug.connected)
                reason = 'PLUG_DISCONNECTED';
            else if (plug.full)
                reason = 'BATTERY_FULL';
            else if (energy + margin >= s.maxEnergyMWh)
                reason = s.maxEnergyMWh < creditEnergy ? 'MAX_ENERGY_REACHED' : 'CREDIT_EXHAUSTED';
            else if (Date.now() - (s.startedAt ?? s.createdAt).getTime() >= s.maxDurationSeconds * 1000)
                reason = 'MAX_DURATION_REACHED';
            if ((s.reservedMinor - accrued <= s.reservedMinor / 10n || reason === 'CREDIT_EXHAUSTED') && !s.lowCreditWarned) {
                s = await tx.chargingSession.update({ where: { id: s.id }, data: { lowCreditWarned: true } });
            }
            if (reason && !s.stopReason)
                s = await this.queueStop(tx, s, reason, s.ownerId, `stop:${s.id}`, `telemetry:${s.id}`);
            if (t.final && !t.relayOn) {
                if (!s.stopReason)
                    s = await tx.chargingSession.update({ where: { id: s.id }, data: { stopReason: reason ?? 'SAFETY_FAULT' } });
                return this.finish(tx, s, energy);
            }
            if (!t.relayOn && s.status === 'CHARGING' && !s.stopReason)
                return this.queueStop(tx, s, 'SAFETY_FAULT', s.ownerId, `stop:${s.id}`, `relay:${s.id}`);
            return s;
        });
        this.notify(result.completedAt ? 'session.stopped' : 'session.telemetry', result, { session: result, telemetry: t });
        if (t.faultCodes.length)
            this.bus.publish({ type: 'fault.raised', data: { deviceId, bayId: t.bayId, codes: t.faultCodes } });
        if (result.lowCreditWarned && !result.completedAt)
            this.notify('credit.warning', result, { sessionId: result.id, remainingMinor: (result.reservedMinor - result.costMinor).toString() });
    }
    private async raiseFault(tx: Prisma.TransactionClient, deviceId: string, bayId: string, code: string) {
        if (!await tx.fault.findFirst({ where: { deviceId, bayId, code, status: { not: 'RESOLVED' } } }))
            await tx.fault.create({ data: { deviceId, bayId, code, message: 'Device safety condition' } });
        await tx.bay.update({ where: { id: bayId }, data: { status: 'FAULT' } });
    }
    async handle(deviceId: string, message: DeviceMessage) {
        if (message.kind === 'ack')
            await this.acknowledge(deviceId, message);
        if (message.kind === 'telemetry') {
            const bay = await this.db.bay.findFirst({ where: { deviceId, code: message.bayId }, include: { device: true } });
            if (bay) {
                const limits = thresholds(bay.device.thresholds, bay.thresholds);
                const code = message.faultCodes[0] ?? (message.chargingVoltageMv > limits.maxVoltageMv || message.chargingCurrentMa > limits.maxCurrentMa || message.chargingPowerW > bay.maxPowerW ? 'UNSAFE_ELECTRICAL_VALUE' : !message.sessionId && message.relayOn ? 'UNEXPECTED_RELAY' : undefined);
                if (code) {
                    await this.db.$transaction(tx => this.raiseFault(tx, deviceId, bay.id, code));
                    this.bus.publish({ type: 'fault.raised', data: { deviceId, bayId: bay.id, code } });
                }
            }
            await this.telemetry(deviceId, message);
        }
        if (message.kind === 'event') {
            const bay = await this.db.bay.findFirst({ where: { deviceId, code: message.bayId } });
            if (!bay)
                return;
            await this.db.$transaction(tx => this.raiseFault(tx, deviceId, bay.id, message.code));
            this.bus.publish({ type: 'fault.raised', data: { deviceId, bayId: bay.id, code: message.code } });
            const session = await this.db.chargingSession.findFirst({ where: { bayId: bay.id, completedAt: null, status: { notIn: ['COMPLETED', 'FAILED'] } } });
            if (session)
                await this.stop(session.id, session.ownerId, message.event === 'EMERGENCY_STOP' ? 'EMERGENCY_STOP' : 'SAFETY_FAULT', `stop:${session.id}`, `event:${message.sequence}`, true);
        }
    }
    async sweep() {
        const stale = await this.db.device.findMany({ where: { status: { not: 'DISABLED' }, OR: [{ status: 'OFFLINE' }, { lastSeenAt: { lt: new Date(Date.now() - this.config.DEVICE_OFFLINE_TIMEOUT_SECONDS * 1000) } }] } });
        for (const device of stale) {
            if (device.status !== 'OFFLINE')
                this.bus.publish({ type: 'station.status', stationId: device.stationId, public: true, data: { stationId: device.stationId, deviceId: device.id, online: false, dataSource: device.dataSource } });
            await this.db.device.update({ where: { id: device.id }, data: { status: 'OFFLINE' } });
            await this.db.station.updateMany({ where: { id: device.stationId, primaryDeviceId: device.id, status: { not: 'MAINTENANCE' } }, data: { status: 'OFFLINE' } });
            await this.db.bay.updateMany({ where: { deviceId: device.id, enabled: true, status: { not: 'OFFLINE' } }, data: { status: 'OFFLINE' } });
            const sessions = await this.db.chargingSession.findMany({ where: { deviceId: device.id, completedAt: null, status: { notIn: ['COMPLETED', 'FAILED', 'INTERRUPTED'] } } });
            for (const session of sessions)
                await this.db.$transaction(async (tx) => { let s = await this.lockSession(tx, session.id); if (s.completedAt)
                    return; s = await this.queueStop(tx, s, 'DEVICE_OFFLINE', s.ownerId, `stop:${s.id}`, `offline:${s.id}`); s = await transition(tx, s, 'INTERRUPTED'); await tx.chargingSession.update({ where: { id: s.id }, data: { reconciliationRequired: true } }); await tx.bay.update({ where: { id: s.bayId }, data: { status: 'OFFLINE' } }); });
        }
        const expired = await this.db.deviceCommand.findMany({ where: { status: 'PENDING', expiresAt: { lte: new Date() } } });
        for (const command of expired)
            await this.timeout(command);
        const waiting = await this.db.chargingSession.findMany({ where: { completedAt: null, status: 'STOP_PENDING' } });
        for (const s of waiting) {
            const stop = await this.db.deviceCommand.findFirst({ where: { sessionId: s.id, type: { in: ['STOP', 'EMERGENCY_STOP'] } }, orderBy: { issuedAt: 'desc' } });
            if (stop && Date.now() > stop.expiresAt.getTime() + this.config.DEVICE_OFFLINE_TIMEOUT_SECONDS * 1000) {
                await this.db.$transaction(async (tx) => { let current = await this.lockSession(tx, s.id); if (current.completedAt || current.status !== 'STOP_PENDING')
                    return; current = await transition(tx, current, 'INTERRUPTED'); await tx.chargingSession.update({ where: { id: current.id }, data: { reconciliationRequired: true } }); });
            }
        }
        const active = await this.db.chargingSession.findMany({ where: { completedAt: null, status: 'CHARGING' } });
        for (const s of active)
            if (Date.now() - (s.lastTelemetryAt ?? s.startedAt ?? s.createdAt).getTime() > this.config.DEVICE_OFFLINE_TIMEOUT_SECONDS * 1000)
                await this.stop(s.id, s.ownerId, 'DEVICE_OFFLINE', `stop:${s.id}`, `stale:${s.id}`, true);
        for (const s of active)
            if (Date.now() - (s.startedAt ?? s.createdAt).getTime() >= s.maxDurationSeconds * 1000)
                await this.stop(s.id, s.ownerId, 'MAX_DURATION_REACHED', `stop:${s.id}`, `duration:${s.id}`, true);
    }
    private async timeout(command: DeviceCommand) {
        const session = await this.db.$transaction(async (tx) => {
            const s = command.sessionId ? await this.lockSession(tx, command.sessionId) : null;
            const changed = await tx.deviceCommand.updateMany({ where: { id: command.id, status: 'PENDING' }, data: { status: 'TIMED_OUT', failureCode: 'ACK_TIMEOUT' } });
            if (!changed.count || !s || s.completedAt)
                return s;
            const next = await this.queueStop(tx, s, 'DEVICE_OFFLINE', s.ownerId, `stop:${s.id}`, `timeout:${command.id}`);
            await transition(tx, next, 'INTERRUPTED');
            await tx.bay.update({ where: { id: s.bayId }, data: { status: 'OFFLINE' } });
            return tx.chargingSession.update({ where: { id: s.id }, data: { reconciliationRequired: true } });
        });
        if (session)
            this.notify('command.timed_out', session, { commandId: command.id, session });
    }
}
