import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ChargingEngine } from '../sessions/engine.js';
import { startInput } from '../sessions/engine.js';
import { thresholdsSchema } from '../iot/protocol.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { ok } from '../../shared/http.js';
import { id, pagination, pageArgs } from '../../shared/validation/common.js';
import { fingerprint, idempotencyKey } from '../wallets/ledger.js';
const confirmation = z.object({ reason: z.string().trim().min(8).max(500), confirmed: z.literal(true) });
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v, (_k, x) => typeof x === 'bigint' ? x.toString() : x));
export function iotAdminRoutes(engine: ChargingEngine) {
    const r = Router(), db = engine.db;
    // Serialize each administrator's idempotent mutations and retain their result in the immutable audit log.
    const mutation = async (actorId: string, key: string, action: string, targetId: string, input: unknown, requestId: string, work: (tx: Prisma.TransactionClient) => Promise<unknown>) => db.$transaction(async (tx) => {
        const body = confirmation.passthrough().parse(input), hash = fingerprint({ action, targetId, input });
        await tx.$queryRaw `SELECT id FROM "User" WHERE id=${actorId} FOR UPDATE`;
        const previous = await tx.auditLog.findFirst({ where: { actorId, requestId: `iot:${key}` } });
        if (previous) {
            const record = previous.after as {
                hash: string;
                result: Prisma.JsonValue;
            };
            if (record.hash !== hash)
                throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Key already used');
            return record.result;
        }
        const result = await work(tx);
        await tx.auditLog.create({ data: { actorId, action, targetType: 'IoTOperation', targetId, reason: body.reason, requestId: `iot:${key}`, after: json({ hash, result, requestId }) } });
        return result;
    });
    r.get('/charging-sessions', async (req, res) => { const p = pagination.parse(req.query); ok(res, await db.chargingSession.findMany({ where: { completedAt: null }, ...pageArgs(p), orderBy: { createdAt: 'desc' }, include: { reservation: true } }), 200, p); });
    r.get('/charging-sessions/:sessionId/reconciliation', async (req, res) => ok(res, await db.chargingSession.findUniqueOrThrow({ where: { id: id.parse(req.params.sessionId) }, include: { reservation: true, commands: { orderBy: { issuedAt: 'desc' }, take: 50 }, events: { orderBy: { createdAt: 'desc' }, take: 100 } } })));
    r.post('/charging-sessions/start', async (req, res) => { const b = confirmation.extend({ userId: id, data: startInput }).strict().parse(req.body); ok(res, await engine.start(b.userId, b.data, idempotencyKey.parse(req.headers['idempotency-key']), res.locals.requestId, { actorId: req.user!.id, reason: b.reason }), 202); });
    for (const action of ['stop', 'reconcile'] as const)
        r.post(`/charging-sessions/:sessionId/${action}`, async (req, res) => { const b = confirmation.strict().parse(req.body); ok(res, await engine.stop(id.parse(req.params.sessionId), req.user!.id, 'ADMIN_STOPPED', idempotencyKey.parse(req.headers['idempotency-key']), res.locals.requestId, true, action === 'reconcile', b.reason), 202); });
    r.get('/devices/:deviceId/telemetry', async (req, res) => { const d = await db.device.findUniqueOrThrow({ where: { id: id.parse(req.params.deviceId) }, select: { id: true, status: true, lastSeenAt: true, dataSource: true, lastTelemetry: true, bays: { select: { id: true, code: true, lastTelemetry: true, lastTelemetryAt: true } } } }); ok(res, d); });
    r.get('/devices/:deviceId/commands', async (req, res) => { const p = pagination.parse(req.query); ok(res, await db.deviceCommand.findMany({ where: { deviceId: id.parse(req.params.deviceId) }, ...pageArgs(p), orderBy: { issuedAt: 'desc' } }), 200, p); });
    r.post('/devices/:deviceId/commands', async (req, res) => {
        const b = confirmation.extend({ type: z.enum(['RESTART', 'TEST']) }).strict().parse(req.body), deviceId = id.parse(req.params.deviceId), actorId = req.user!.id, key = idempotencyKey.parse(req.headers['idempotency-key']);
        ok(res, await mutation(actorId, key, 'DEVICE_COMMAND', deviceId, b, res.locals.requestId, async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Device" WHERE id=${deviceId} FOR UPDATE`;
            const d = await tx.device.findUniqueOrThrow({ where: { id: deviceId }, include: { station: true } });
            if (d.status !== 'ONLINE' || !d.lastSeenAt || Date.now() - d.lastSeenAt.getTime() > engine.config.DEVICE_OFFLINE_TIMEOUT_SECONDS * 1000)
                throw new ApiError(409, 'DEVICE_OFFLINE', 'Device must be online');
            if (await tx.chargingSession.count({ where: { deviceId, completedAt: null, status: { notIn: ['COMPLETED', 'FAILED'] } } }) || await tx.bay.count({ where: { deviceId, relayOn: true } }))
                throw new ApiError(409, 'ACTIVE_SESSION', 'Stop and reconcile before maintenance');
            const expiresAt = new Date(Date.now() + engine.config.COMMAND_ACK_TIMEOUT_SECONDS * 1000);
            const c = await tx.deviceCommand.create({ data: { deviceId, actorId, type: b.type, idempotencyKey: key, expiresAt, requestHash: fingerprint(b) } });
            return tx.deviceCommand.update({ where: { id: c.id }, data: { payload: { commandId: c.id, type: b.type, stationId: d.station.code, deviceId: d.publicId, sessionId: null, issuedAt: c.issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), reason: b.reason, relayOn: false } } });
        }), 202);
    });
    r.patch('/devices/:deviceId/thresholds', async (req, res) => {
        const b = confirmation.extend({ thresholds: thresholdsSchema }).strict().parse(req.body), deviceId = id.parse(req.params.deviceId);
        ok(res, await mutation(req.user!.id, idempotencyKey.parse(req.headers['idempotency-key']), 'DEVICE_THRESHOLDS', deviceId, b, res.locals.requestId, async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Device" WHERE id=${deviceId} FOR UPDATE`;
            if (await tx.chargingSession.count({ where: { deviceId, completedAt: null, status: { notIn: ['COMPLETED', 'FAILED'] } } }))
                throw new ApiError(409, 'ACTIVE_SESSION', 'Cannot change thresholds during charging');
            return tx.device.update({ where: { id: deviceId }, data: { thresholds: b.thresholds }, select: { id: true, thresholds: true } });
        }));
    });
    r.patch('/bays/:bayId/relay', async (req, res) => {
        const b = confirmation.extend({ relayChannel: z.number().int().min(1).max(64), thresholds: thresholdsSchema.optional() }).strict().parse(req.body), bayId = id.parse(req.params.bayId);
        ok(res, await mutation(req.user!.id, idempotencyKey.parse(req.headers['idempotency-key']), 'BAY_RELAY_CONFIG', bayId, b, res.locals.requestId, async (tx) => {
            const bay = await tx.bay.findUniqueOrThrow({ where: { id: bayId } });
            await tx.$queryRaw `SELECT id FROM "Device" WHERE id=${bay.deviceId} FOR UPDATE`;
            if (bay.relayOn || await tx.chargingSession.count({ where: { bayId, completedAt: null, status: { notIn: ['COMPLETED', 'FAILED'] } } }))
                throw new ApiError(409, 'ACTIVE_SESSION', 'Cannot remap an active relay');
            return tx.bay.update({ where: { id: bayId }, data: { relayChannel: b.relayChannel, thresholds: b.thresholds } });
        }));
    });
    r.get('/faults', async (req, res) => { const p = pagination.parse(req.query); ok(res, await db.fault.findMany({ ...pageArgs(p), orderBy: { createdAt: 'desc' } }), 200, p); });
    r.patch('/devices/:deviceId/assignment', async (req, res) => {
        const b = confirmation.extend({ stationId: id }).strict().parse(req.body), deviceId = id.parse(req.params.deviceId);
        ok(res, await mutation(req.user!.id, idempotencyKey.parse(req.headers['idempotency-key']), 'DEVICE_ASSIGNMENT', deviceId, b, res.locals.requestId, async (tx) => {
            await tx.$queryRaw `SELECT id FROM "Device" WHERE id=${deviceId} FOR UPDATE`;
            await tx.station.findUniqueOrThrow({ where: { id: b.stationId } });
            if (await tx.bay.count({ where: { deviceId } }) || await tx.station.count({ where: { primaryDeviceId: deviceId } }) || await tx.chargingSession.count({ where: { deviceId, completedAt: null, status: { notIn: ['COMPLETED', 'FAILED'] } } }))
                throw new ApiError(409, 'DEVICE_ASSIGNED', 'Unassign bays and primary controller before moving this device');
            return tx.device.update({ where: { id: deviceId }, data: { stationId: b.stationId, status: 'OFFLINE', lastSeenAt: null }, select: { id: true, stationId: true, status: true } });
        }));
    });
    r.post('/faults/:faultId/resolve', async (req, res) => {
        const b = confirmation.strict().parse(req.body), faultId = id.parse(req.params.faultId);
        const result = await mutation(req.user!.id, idempotencyKey.parse(req.headers['idempotency-key']), 'FAULT_RESOLVED', faultId, b, res.locals.requestId, async (tx) => {
            const f = await tx.fault.findUniqueOrThrow({ where: { id: faultId } });
            await tx.$queryRaw `SELECT id FROM "Device" WHERE id=${f.deviceId} FOR UPDATE`;
            if (await tx.chargingSession.count({ where: { deviceId: f.deviceId, completedAt: null, status: { notIn: ['COMPLETED', 'FAILED'] } } }))
                throw new ApiError(409, 'ACTIVE_SESSION', 'Reconcile active charging before clearing faults');
            return tx.fault.update({ where: { id: faultId }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
        });
        engine.bus.publish({ type: 'fault.resolved', data: result });
        ok(res, result);
    });
    return r;
}
