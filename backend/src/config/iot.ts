import 'dotenv/config';
import { z } from 'zod';
export const iotConfigSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    MQTT_URL: z.string().default(''), MQTT_USERNAME: z.string().default(''), MQTT_PASSWORD: z.string().default(''),
    MQTT_CLIENT_ID: z.string().min(1).max(100).default('heliobay-backend'),
    MQTT_TLS_ENABLED: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
    MQTT_CA_FILE: z.string().optional(),
    DEVICE_OFFLINE_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(300).default(30),
    COMMAND_ACK_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(60).default(10),
    TELEMETRY_INTERVAL_MS: z.coerce.number().int().min(100).max(30000).default(1000),
    TELEMETRY_SAMPLE_INTERVAL_MS: z.coerce.number().int().min(100).max(60000).default(5000),
    TELEMETRY_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    MAX_SESSION_DURATION_SECONDS: z.coerce.number().int().min(10).max(86400).default(14400),
    MAX_SESSION_ENERGY_MWH: z.string().regex(/^[1-9]\d{0,14}$/).default('100000000000'),
    ALLOW_DEVICE_SIMULATOR: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
}).superRefine((v, ctx) => {
    if (v.NODE_ENV === 'production' && v.ALLOW_DEVICE_SIMULATOR)
        ctx.addIssue({ code: 'custom', message: 'Simulator is forbidden in production' });
    if (v.MQTT_URL) {
        let u: URL;
        try {
            u = new URL(v.MQTT_URL);
        }
        catch {
            ctx.addIssue({ code: 'custom', message: 'Invalid MQTT URL' });
            return;
        }
        if (u.username || u.password || !['mqtt:', 'mqtts:'].includes(u.protocol))
            ctx.addIssue({ code: 'custom', message: 'Use mqtt/mqtts URL without embedded credentials' });
        if (v.MQTT_TLS_ENABLED !== (u.protocol === 'mqtts:'))
            ctx.addIssue({ code: 'custom', message: 'MQTT TLS setting and URL disagree' });
        if (v.NODE_ENV === 'production' && (!v.MQTT_TLS_ENABLED || !v.MQTT_USERNAME || !v.MQTT_PASSWORD))
            ctx.addIssue({ code: 'custom', message: 'Production MQTT requires TLS and credentials' });
    }
});
export type IotConfig = z.infer<typeof iotConfigSchema>;
export const readIotConfig = (source: NodeJS.ProcessEnv = process.env) => iotConfigSchema.parse(source);
