/** Persist commands before publishing; ACK identity and expiry must be verified by the future worker. */
export interface DeviceTransport {
  publish(command: { id: string; deviceId: string; bayId: string; type: 'START' | 'STOP' | 'EMERGENCY_STOP'; expiresAt: Date; maxEnergyMWh?: bigint }): Promise<void>;
}
export interface MeterSample {
  deviceId: string; sequence: bigint; recordedAt: Date; energyMWh: bigint;
  powerW: number | null; voltageMv: number | null; currentMa: number | null;
  source: 'SOLAR' | 'STORAGE' | 'GRID'; simulated: boolean;
}
