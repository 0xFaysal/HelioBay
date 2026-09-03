import 'dotenv/config';
import { z } from 'zod';
import { startSimulator } from './mqtt.js';
import { scenarios } from './device.js';
const config = z.object({ NODE_ENV: z.enum(['development', 'test']).default('development'), ALLOW_DEVICE_SIMULATOR: z.literal('true'), MQTT_URL: z.url(), SIMULATOR_HMAC_KEY: z.string().min(32), SIMULATOR_USERNAME: z.string().optional(), SIMULATOR_PASSWORD: z.string().optional(), SIMULATOR_STATION: z.string().default('ST001'), SIMULATOR_DEVICE: z.string().default('ESP32-ST001'), SIMULATOR_BAY: z.string().default('BAY01'), SIMULATOR_SPEED: z.coerce.number().int().min(1).max(60).default(1), SIMULATOR_SCENARIO: z.enum(scenarios).default('normal') }).parse(process.env);
const simulator = startSimulator({ url: config.MQTT_URL, username: config.SIMULATOR_USERNAME, password: config.SIMULATOR_PASSWORD, secret: config.SIMULATOR_HMAC_KEY, stationId: config.SIMULATOR_STATION, deviceId: config.SIMULATOR_DEVICE, bayId: config.SIMULATOR_BAY, relayChannel: 1, speed: config.SIMULATOR_SPEED, scenario: config.SIMULATOR_SCENARIO, allowed: true, nodeEnv: config.NODE_ENV });
console.info(`SIMULATOR: ${config.SIMULATOR_DEVICE}; scenario=${config.SIMULATOR_SCENARIO}; energy speed=${config.SIMULATOR_SPEED}x`);
for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => { void simulator.close().then(() => process.exit(0)); });
