import { connect, type MqttClient } from 'mqtt';
import { canonical, sign, topic, verifySignature, type DeviceMessage } from '../iot/protocol.js';
import { SimulatedDevice, type Scenario } from './device.js';
export function startSimulator(options: {
    url: string;
    username?: string;
    password?: string;
    secret: string;
    stationId: string;
    deviceId: string;
    bayId: string;
    relayChannel: number;
    speed: number;
    scenario: Scenario;
    intervalMs?: number;
    allowed: boolean;
    nodeEnv: string;
}) {
    if (options.nodeEnv === 'production' || !options.allowed)
        throw new Error('Simulator requires explicit non-production enablement');
    if (options.secret.length < 32)
        throw new Error('Simulator HMAC key must be at least 32 characters');
    let closed = false, paused = false, queue = Promise.resolve(), retry: ReturnType<typeof setTimeout> | undefined, attempt = 0;
    const channel = (m: DeviceMessage) => ({ ack: 'acks', event: 'events', telemetry: 'telemetry', status: 'status' }[m.kind]);
    const emit = async (m: DeviceMessage) => { if (!client?.connected)
        return; const t = topic(options.stationId, options.deviceId, channel(m)); await client.publishAsync(t, canonical({ payload: m, signature: sign(t, m, options.secret) }), { qos: 1, retain: m.kind === 'status' }); };
    const device = new SimulatedDevice(options, emit), will = device.status(false), willTopic = topic(options.stationId, options.deviceId, 'status');
    const client: MqttClient = connect(options.url, { clientId: `sim-${options.deviceId}`, username: options.username, password: options.password, protocolVersion: 5, reconnectPeriod: 0, queueQoSZero: false, connectTimeout: 5000, rejectUnauthorized: true, will: { topic: willTopic, payload: Buffer.from(canonical({ payload: will, signature: sign(willTopic, will, options.secret) })), qos: 1, retain: true } });
    const serialize = (work: () => Promise<void>) => { queue = queue.then(work).catch(() => { }); };
    client.on('connect', () => { attempt = 0; serialize(async () => { await client.subscribeAsync(topic(options.stationId, options.deviceId, 'commands'), { qos: 1 }); await device.connect(); }); });
    client.on('message', (name, raw, packet) => { if (packet.retain || raw.length > 8192 || name !== topic(options.stationId, options.deviceId, 'commands'))
        return; serialize(async () => { const e = JSON.parse(raw.toString()) as {
        payload: unknown;
        signature: string;
    }; if (verifySignature(name, e.payload, e.signature, options.secret))
        await device.command(e.payload); }); });
    let stepping = false;
    const timer = setInterval(() => { if (stepping || closed)
        return; stepping = true; serialize(async () => { try {
        const timeout = await device.step(options.intervalMs ?? 1000);
        if (timeout && !paused) {
            paused = true;
            client.stream.destroy();
        }
    }
    finally {
        stepping = false;
    } }); }, options.intervalMs ?? 1000);
    timer.unref();
    client.on('error', () => { });
    client.on('close', () => { if (closed || paused || retry)
        return; retry = setTimeout(() => { retry = undefined; client.reconnect(); }, Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5))); retry.unref(); });
    return { device, client, reconnect() { paused = false; client.reconnect(); }, async close() { closed = true; if (timer)
            clearInterval(timer); if (retry)
            clearTimeout(retry); await queue; await emit(device.status(false)); await client.endAsync(true); } };
}
