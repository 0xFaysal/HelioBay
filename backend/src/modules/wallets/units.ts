export function costMinor(energyMWh: bigint, tariffMinorPerKwh: bigint): bigint {
  if (energyMWh < 0n || tariffMinorPerKwh <= 0n) throw new RangeError('Invalid energy or tariff');
  return (energyMWh * tariffMinorPerKwh + 999999n) / 1000000n;
}
