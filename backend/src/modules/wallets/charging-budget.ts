import { costMinor } from './units.js';
export function chargingBudget(reservedMinor: bigint, tariffMinorPerKwh: bigint, configuredMaxEnergy: bigint) {
    if (reservedMinor <= 0n || tariffMinorPerKwh <= 0n || configuredMaxEnergy <= 0n)
        throw new Error('Positive authorization inputs required');
    const creditEnergy = reservedMinor * 1000000n / tariffMinorPerKwh;
    return { creditEnergy, maxEnergyMWh: creditEnergy < configuredMaxEnergy ? creditEnergy : configuredMaxEnergy };
}
export function cappedChargingCost(energyMWh: bigint, tariffMinorPerKwh: bigint, reservedMinor: bigint) {
    const cost = costMinor(energyMWh, tariffMinorPerKwh);
    return cost < reservedMinor ? cost : reservedMinor;
}
export function stoppingMargin(maxPowerW: number, latencyMs: number, intervalMs: number, speed: number) {
    // Round up the energy consumed during a worst-case sample/relay delay.
    return (BigInt(maxPowerW) * BigInt(latencyMs + intervalMs) * BigInt(speed) + 3599n) / 3600n;
}
