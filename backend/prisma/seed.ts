import 'dotenv/config';
import { makeDatabase } from '../src/shared/database/client.js';
if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Demo seed requires ALLOW_DEMO_SEED=true outside production');
const db = makeDatabase(process.env.DATABASE_URL ?? 'postgresql://heliobay:local_dev_only@localhost:5433/heliobay');
try {
  await db.$transaction(async tx => {
    const admin = await tx.user.upsert({ where: { firebaseUid: process.env.DEMO_ADMIN_FIREBASE_UID ?? 'demo-admin-not-a-real-login' }, create: { firebaseUid: process.env.DEMO_ADMIN_FIREBASE_UID ?? 'demo-admin-not-a-real-login', name: 'Demo Admin', role: 'ADMIN', isDemo: true, wallet: { create: {} } }, update: {} });
    const owner = await tx.user.upsert({ where: { firebaseUid: process.env.DEMO_OWNER_FIREBASE_UID ?? 'demo-owner-not-a-real-login' }, create: { firebaseUid: process.env.DEMO_OWNER_FIREBASE_UID ?? 'demo-owner-not-a-real-login', name: 'Demo EV Owner', isDemo: true, wallet: { create: {} } }, update: {} });
    if (!admin.isDemo || !owner.isDemo) throw new Error('Seed UIDs must not reference real accounts');
    await tx.vehicle.upsert({ where: { id: 'demo-vehicle' }, create: { id: 'demo-vehicle', ownerId: owner.id, name: 'Demo EV', plate: 'DEMO-01', connectorType: 'TYPE_2', capacityWh: 40000, isDefault: true }, update: {} });
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: owner.id } });
    if (!await tx.walletLedger.findUnique({ where: { reference: 'demo-opening-credit' } })) {
      await tx.walletLedger.create({ data: { walletId: wallet.id, kind: 'DEMO_CREDIT', amountMinor: 50000n, balanceAfterMinor: wallet.balanceMinor + 50000n, actorId: admin.id, description: "Demo credits, no cash value", reference: 'demo-opening-credit', reason: 'Demo credits, no cash value', isDemo: true } });
    }
    const tariff = await tx.tariff.upsert({ where: { id: 'demo-tariff' }, create: { id: 'demo-tariff', name: 'Demo standard tariff', priceMinorPerKwh: 2500 }, update: {} });
    const stations = [
      { code: 'ST001', name: 'HelioBay Green Point Station', address: 'Gulshan, Dhaka', latitude: 23.7806, longitude: 90.4193 },
      { code: 'ST002', name: 'HelioBay Dhanmondi Demo', address: 'Dhanmondi, Dhaka', latitude: 23.7465, longitude: 90.3760 },
      { code: 'ST003', name: 'HelioBay Uttara Demo', address: 'Uttara, Dhaka', latitude: 23.8759, longitude: 90.3795 },
      { code: 'ST004', name: 'HelioBay Mirpur Demo', address: 'Mirpur, Dhaka', latitude: 23.8223, longitude: 90.3654 },
    ];
    for (const data of stations) {
      const station = await tx.station.upsert({ where: { code: data.code }, create: { ...data, tariffId: tariff.id, isDemo: true, solarCapable: true, batteryCapable: true }, update: {} });
      if (!station.isDemo) throw new Error('Demo station code collides with real data');
      const device = await tx.device.upsert({ where: { publicId: `ESP32-${data.code}` }, create: { publicId: `ESP32-${data.code}`, stationId: station.id, mqttClientId: `demo-ESP32-${data.code}`, hardwareMetadata: { model: 'Demo ESP32', channels: 4 } }, update: {} });
      await tx.station.update({ where: { id: station.id }, data: { primaryDeviceId: device.id } });
      await tx.bay.upsert({ where: { code: data.code === 'ST001' ? 'BAY01' : `${data.code}-BAY01` }, create: { code: data.code === 'ST001' ? 'BAY01' : `${data.code}-BAY01`, stationId: station.id, deviceId: device.id, number: 1, relayChannel: 1, connectorType: 'TYPE_2', maxPowerW: 7000 }, update: {} });
    }
    await tx.auditLog.create({ data: { actorId: admin.id, action: 'DEMO_SEED', targetType: 'Demo', targetId: 'seed', requestId: 'demo-seed', reason: 'Explicit local demo bootstrap' } });
  });
} finally { await db.$disconnect(); }

