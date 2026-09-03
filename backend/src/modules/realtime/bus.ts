import { EventEmitter } from 'node:events';
export type RealtimeEvent = {
    type: string;
    data: unknown;
    userId?: string;
    sessionId?: string;
    stationId?: string;
    public?: boolean;
};
export class RealtimeBus extends EventEmitter {
    publish(event: RealtimeEvent) { this.emit('update', { ...event, eventId: crypto.randomUUID(), at: new Date().toISOString() }); }
}
