import { describe,it,expect } from 'vitest';
import { sign,verifySignature,parseTopic,thresholds,plugState,telemetrySchema } from '../src/modules/iot/protocol.js';
import { readIotConfig } from '../src/config/iot.js';
export const sample=()=>telemetrySchema.parse({kind:'telemetry',bootId:'boot',sequence:'2',at:new Date().toISOString(),dataSource:'SIMULATOR',bayId:'BAY01',sessionId:null,online:true,plugConnected:true,relayOn:false,batterySenseAvailable:true,vehicleBatteryMv:48000,vehicleBatteryPercent:50,batteryPercentageEstimated:true,solarVoltageMv:50000,solarCurrentMa:2000,solarPowerW:100,chargingVoltageMv:48000,chargingCurrentMa:0,chargingPowerW:0,energyMWh:'0',stationBatteryPercent:80,source:'SOLAR',faultCodes:[],final:false});
describe('device protocol',()=>{
 it('binds signed data to its scoped topic',()=>{const p={sequence:'1',value:20},key='a'.repeat(32),t='heliobay/v1/stations/ST001/devices/D1/telemetry',s=sign(t,p,key);expect(verifySignature(t,{value:20,sequence:'1'},s,key)).toBe(true);expect(verifySignature(t+'x',p,s,key)).toBe(false);expect(verifySignature(t,{...p,value:21},s,key)).toBe(false);expect(parseTopic(t)?.device).toBe('D1');expect(parseTopic(t+'/extra')).toBeNull();});
 it('distinguishes full and disconnected with zero current',()=>{const t=sample(),limits=thresholds(null,null);expect(plugState({...t,vehicleBatteryPercent:100},limits)).toEqual({connected:true,full:true,charging:false});expect(plugState({...t,vehicleBatteryMv:0},limits).connected).toBe(false);});
 it('rejects negative readings and unlabeled sources',()=>{expect(telemetrySchema.safeParse({...sample(),chargingCurrentMa:-1}).success).toBe(false);expect(telemetrySchema.safeParse({...sample(),dataSource:undefined}).success).toBe(false);});
 it('forbids production simulation and plaintext MQTT',()=>{expect(()=>readIotConfig({NODE_ENV:'production',ALLOW_DEVICE_SIMULATOR:'true'})).toThrow();expect(()=>readIotConfig({NODE_ENV:'production',MQTT_URL:'mqtt://localhost:1883',MQTT_TLS_ENABLED:'false'})).toThrow();});
});

