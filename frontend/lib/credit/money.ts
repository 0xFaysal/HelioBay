// Money is always integer poisha. Decimal input never passes through parseFloat.
export function parseCredits(value: string): number {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter a positive amount with at most two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > 1_000_000_000n) throw new Error("Amount exceeds the supported limit.");
  return Number(amount);
}
export function decimal(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error("Money must use integer minor units.");
  const amount = BigInt(minor); const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "−" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
export const credits = (minor: number) => `${decimal(minor)} Credits`;
export const bdt = (minor: number) => `৳${decimal(minor)}`;
export function energyCost(energyMWh: number, tariffMinor: number): number {
  if (![energyMWh, tariffMinor].every(Number.isSafeInteger) || energyMWh < 0 || tariffMinor < 1) throw new Error("Invalid meter or tariff.");
  return Number((BigInt(energyMWh) * BigInt(tariffMinor) + 999999n) / 1000000n);
}
export function affordableEnergy(balanceMinor: number, tariffMinor: number): number {
  if (!Number.isSafeInteger(balanceMinor) || balanceMinor < 0 || !Number.isSafeInteger(tariffMinor) || tariffMinor < 1) throw new Error("Invalid wallet or tariff.");
  return Number(BigInt(balanceMinor) * 1000000n / BigInt(tariffMinor));
}
export function validateTopup(amountMinor: number, maximum: number) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1000) throw new Error("Minimum top-up is 10.00 Credits (10 BDT).");
  if (amountMinor > maximum) throw new Error(`Maximum top-up is ${credits(maximum)}.`);
}
export function gatewayUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "sandbox.sslcommerz.com" || url.username || url.password || url.port) throw new Error("The backend returned an untrusted payment gateway URL.");
  return url.href;
}
