import type { Database } from '../../shared/database/client.js';
import type { IotConfig } from '../../config/iot.js';
import { RealtimeBus } from '../realtime/bus.js';
import { ChargingEngine } from '../sessions/engine.js';
import { DeviceIngress } from './ingress.js';
import { MqttGateway } from './gateway.js';
export function createIotRuntime(db: Database, config: IotConfig, warn: (message: string) => void) {
    const bus = new RealtimeBus();
    const ingress: DeviceIngress = new DeviceIngress(db, config, bus, (id, message) => engine.handle(id, message));
    const gateway: MqttGateway = new MqttGateway(config, ingress);
    const engine: ChargingEngine = new ChargingEngine(db, config, bus, gateway);
    let timer: ReturnType<typeof setInterval> | undefined, running: Promise<void> | undefined, lastPrune = 0;
    const tick = async () => {
        try {
            await ingress.drain();
        }
        catch {
            warn('Device inbox processing failed; retained for retry');
        }
        try {
            await engine.sweep();
            await engine.dispatch();
            if (Date.now() - lastPrune > 3600000) {
                await ingress.prune();
                lastPrune = Date.now();
            }
        }
        catch {
            warn('IoT worker failed; pending work will retry');
        }
    };
    return { engine, bus, gateway, ingress, start() { gateway.start(); timer = setInterval(() => { if (!running)
            running = tick().finally(() => { running = undefined; }); }, 500); timer.unref(); }, async close() { if (timer)
            clearInterval(timer); await running; await gateway.close(); } };
}
