import { describe,it,expect } from 'vitest';
import { chargingBudget,cappedChargingCost,stoppingMargin } from '../src/modules/wallets/charging-budget.js';
describe('charging credit envelope',()=>{
 it('uses fixed precision and caps every debit at authorization',()=>{for(const credit of [1n,37n,1000n,900000000n])for(const tariff of [1n,3n,2500n]){const b=chargingBudget(credit,tariff,999999999999999n);expect(cappedChargingCost(b.maxEnergyMWh,tariff,credit)).toBeLessThanOrEqual(credit);expect(cappedChargingCost(b.maxEnergyMWh+999999999999999n,tariff,credit)).toBe(credit);}});
 it('accounts for sampling, relay latency and accelerated simulation with ceiling',()=>{expect(stoppingMargin(1,100,100,1)).toBe(1n);expect(stoppingMargin(3600,2000,1000,10)).toBe(30000n);});
 it('limits energy independently of credit and refuses invalid authorization',()=>{expect(chargingBudget(1000n,1000n,100n).maxEnergyMWh).toBe(100n);expect(()=>chargingBudget(0n,1000n,100n)).toThrow();});
});
