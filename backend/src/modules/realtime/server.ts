import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import type { Database } from '../../shared/database/client.js';
import type { TokenVerifier } from '../auth/firebase.js';
import { AuthRepository } from '../auth/repository.js';
import type { RealtimeBus, RealtimeEvent } from './bus.js';
const incoming = z.discriminatedUnion('type', [
    z.object({ type: z.literal('authenticate'), token: z.string().min(1).max(8192) }).strict(),
    z.object({ type: z.enum(['subscribe', 'unsubscribe']), room: z.string().min(1).max(150) }).strict(),
]);
export function attachRealtime(server: Server, db: Database, verify: TokenVerifier, bus: RealtimeBus, origins: string[]) {
    const wss = new WebSocketServer({ noServer: true, maxPayload: 10000, perMessageDeflate: false }), users = new AuthRepository(db);
    const counts = new Map<string, number>();
    server.on('upgrade', (req, socket, head) => {
        const address = req.socket.remoteAddress ?? 'unknown';
        if (req.url !== '/api/v1/realtime' || (req.headers.origin && !origins.includes(req.headers.origin)) || wss.clients.size >= 500 || (counts.get(address) ?? 0) >= 20) {
            socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
            socket.destroy();
            return;
        }
        counts.set(address, (counts.get(address) ?? 0) + 1);
        wss.handleUpgrade(req, socket, head, ws => { ws.once('close', () => { const n = (counts.get(address) ?? 1) - 1; if (n)
            counts.set(address, n);
        else
            counts.delete(address); }); wss.emit('connection', ws); });
    });
    bus.setMaxListeners(0);
    wss.on('connection', ws => {
        let token = '', uid = '', expires = 0, verifiedAt = 0, alive = true, queue = Promise.resolve(), pending = 0, windowAt = Date.now(), messages = 0;
        const rooms = new Set<string>();
        const send = (value: unknown) => { if (ws.readyState !== WebSocket.OPEN)
            return; if (ws.bufferedAmount > 262144) {
            ws.close(1013, 'Slow consumer');
            return;
        } ws.send(JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v)); };
        const authTimer = setTimeout(() => { if (!uid)
            ws.close(4401, 'Authentication required'); }, 5000);
        authTimer.unref();
        const current = async () => {
            if (!uid || Date.now() >= expires) {
                ws.close(4401, 'Token expired');
                return null;
            }
            if (Date.now() - verifiedAt >= 30000) {
                try {
                    await verify(token);
                    verifiedAt = Date.now();
                }
                catch {
                    ws.close(4401, 'Token invalid');
                    return null;
                }
            }
            const user = await db.user.findUnique({ where: { id: uid } });
            if (!user || user.status !== 'ACTIVE') {
                ws.close(4403, 'Account inactive');
                return null;
            }
            return user;
        };
        const enqueue = (work: () => Promise<void>) => { if (pending >= 100) {
            ws.close(1013, 'Queue full');
            return;
        } pending++; queue = queue.then(work).catch(() => { send({ type: 'error', code: 'REQUEST_REJECTED' }); }).finally(() => { pending--; }); };
        ws.on('message', raw => {
            if (Date.now() - windowAt >= 60000) {
                windowAt = Date.now();
                messages = 0;
            }
            if (++messages > 60) {
                ws.close(4429, 'Rate limited');
                return;
            }
            enqueue(async () => {
                const m = incoming.parse(JSON.parse(raw.toString()));
                if (m.type === 'authenticate') {
                    if (uid)
                        throw new Error('Already authenticated');
                    try {
                        const decoded = await verify(m.token);
                        if (decoded.exp * 1000 <= Date.now())
                            throw new Error('Expired');
                        const user = await users.synchronize(decoded);
                        if (user.status !== 'ACTIVE')
                            throw new Error('Inactive');
                        token = m.token;
                        uid = user.id;
                        expires = decoded.exp * 1000;
                        verifiedAt = Date.now();
                        clearTimeout(authTimer);
                        rooms.add(`user:${uid}`);
                        send({ type: 'authenticated', userId: uid, expiresAt: new Date(expires).toISOString() });
                    }
                    catch {
                        ws.close(4401, 'Authentication failed');
                    }
                    return;
                }
                const user = await current();
                if (!user)
                    return;
                if (m.type === 'unsubscribe') {
                    if (m.room !== `user:${uid}`)
                        rooms.delete(m.room);
                    send({ type: 'unsubscribed', room: m.room });
                    return;
                }
                if (rooms.size >= 32)
                    throw new Error('Room limit');
                if (m.room === 'admin') {
                    if (user.role !== 'ADMIN')
                        throw new Error('Forbidden');
                }
                else if (m.room.startsWith('session:')) {
                    const session = await db.chargingSession.findUnique({ where: { id: m.room.slice(8) }, select: { ownerId: true } });
                    if (!session || (session.ownerId !== uid && user.role !== 'ADMIN'))
                        throw new Error('Forbidden');
                }
                else if (m.room.startsWith('station:')) {
                    if (!await db.station.findUnique({ where: { id: m.room.slice(8) }, select: { id: true } }))
                        throw new Error('Not found');
                }
                else if (m.room !== `user:${uid}`)
                    throw new Error('Forbidden');
                rooms.add(m.room);
                send({ type: 'subscribed', room: m.room });
            });
        });
        const update = (event: RealtimeEvent & {
            eventId: string;
            at: string;
        }) => {
            if (!uid)
                return;
            const interested = rooms.has('admin') || event.userId === uid || (event.sessionId && rooms.has(`session:${event.sessionId}`)) || (event.public && event.stationId && rooms.has(`station:${event.stationId}`));
            if (!interested)
                return;
            enqueue(async () => { const user = await current(); if (!user)
                return; const allowed = (user.role === 'ADMIN' && rooms.has('admin')) || event.userId === uid || (user.role === 'ADMIN' && !!event.sessionId && rooms.has(`session:${event.sessionId}`)) || (event.public && !!event.stationId && rooms.has(`station:${event.stationId}`)); if (allowed)
                send({ type: event.type, data: event.data, eventId: event.eventId, at: event.at }); });
        };
        bus.on('update', update);
        ws.on('pong', () => { alive = true; });
        ws.on('error', () => { });
        const heartbeat = setInterval(() => { if (!alive) {
            ws.terminate();
            return;
        } alive = false; ws.ping(); if (uid)
            enqueue(async () => { await current(); }); }, 15000);
        heartbeat.unref();
        ws.on('close', () => { clearTimeout(authTimer); clearInterval(heartbeat); bus.off('update', update); rooms.clear(); });
    });
    return { async close() { for (const ws of wss.clients)
            ws.terminate(); await new Promise<void>(resolve => wss.close(() => resolve())); } };
}
