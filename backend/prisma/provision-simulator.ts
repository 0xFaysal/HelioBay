import 'dotenv/config';
import { z } from 'zod';
import { makeDatabase } from '../src/shared/database/client.js';
const env = z.object({ NODE_ENV: z.enum(['development', 'test']).default('development'), ALLOW_DEVICE_SIMULATOR: z.literal('true'), DATABASE_URL: z.url(), SIMULATOR_HMAC_KEY: z.string().min(32), SIMULATOR_SPEED: z.coerce.number().int().min(1).max(60).default(1) }).parse(process.env);
const db = makeDatabase(env.DATABASE_URL);
try {
    await db.$transaction(async (tx) => {
        const station = await tx.station.findUniqueOrThrow({ where: { code: 'ST001' } });
        if (!station.isDemo)
            throw new Error('Simulator may provision only a demo station');
        const device = await tx.device.findUniqueOrThrow({ where: { publicId: 'ESP32-ST001' } });
        await tx.$queryRaw `SELECT id FROM "Device" WHERE id=${device.id} FOR UPDATE`;
        if (device.stationId !== station.id)
            throw new Error('Device assignment mismatch');
        if (await tx.chargingSession.count({ where: { stationId: station.id, completedAt: null, status: { notIn: ['COMPLETED', 'FAILED'] } } }))
            throw new Error('Resolve active sessions before provisioning');
        await tx.device.update({ where: { id: device.id }, data: { dataSource: 'SIMULATOR', simulationSpeed: env.SIMULATOR_SPEED, credentialRef: 'secret://env/SIMULATOR_HMAC_KEY', status: 'OFFLINE' } });
        await tx.station.update({ where: { id: station.id }, data: { isOpen: true, status: 'OFFLINE' } });
        const admin = await tx.user.findFirstOrThrow({ where: { role: 'ADMIN', isDemo: true } });
        await tx.auditLog.create({ data: { actorId: admin.id, action: 'SIMULATOR_PROVISIONED', targetType: 'Device', targetId: device.id, reason: 'Explicit development simulator provisioning', requestId: crypto.randomUUID(), after: { dataSource: 'SIMULATOR', simulationSpeed: env.SIMULATOR_SPEED } } });
    });
    console.info('ST001 / ESP32-ST001 provisioned as SIMULATOR. No secret was stored in the database.');
}
finally {
    await db.$disconnect();
}
