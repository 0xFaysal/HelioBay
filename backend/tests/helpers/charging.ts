import type { Database } from '../../src/shared/database/client.js';
import { AdminWalletService } from '../../src/modules/admin/wallet-service.js';
import { readIotConfig } from '../../src/config/iot.js';
import { ChargingEngine } from '../../src/modules/sessions/engine.js';
import { RealtimeBus } from '../../src/modules/realtime/bus.js';
import type { CommandPublisher } from '../../src/modules/iot/gateway.js';
import { telemetrySchema } from '../../src/modules/iot/protocol.js';
export const deviceKey='test-only-device-signing-key-32-characters';
export const telemetry=()=>telemetrySchema.parse({kind:'telemetry',bootId:'boot',sequence:'2',at:new Date().toISOString(),dataSource:'SIMULATOR',bayId:'BAY01',sessionId:null,online:true,plugConnected:true,relayOn:false,batterySenseAvailable:true,vehicleBatteryMv:48000,vehicleBatteryPercent:50,batteryPercentageEstimated:true,solarVoltageMv:50000,solarCurrentMa:2000,solarPowerW:100,chargingVoltageMv:48000,chargingCurrentMa:0,chargingPowerW:0,energyMWh:'0',stationBatteryPercent:80,source:'SOLAR',faultCodes:[],final:false});
export async function chargingFixture(db:Database,credit=1000,publisher:CommandPublisher={ready:()=>true,publish:async()=>{}}) {
 const suffix=crypto.randomUUID();
 const owner=await db.user.create({data:{firebaseUid:`owner-${suffix}`,name:'Owner',wallet:{create:{}}}}),admin=await db.user.create({data:{firebaseUid:`admin-${suffix}`,name:'Admin',role:'ADMIN',wallet:{create:{}}}});
 const vehicle=await db.vehicle.create({data:{ownerId:owner.id,name:'EV',plate:suffix,capacityWh:10000,connectorType:'TYPE_2'}});
 const tariff=await db.tariff.create({data:{name:'Test',priceMinorPerKwh:1000}});
 const station=await db.station.create({data:{code:`ST-${suffix}`,name:'Test',address:'Dhaka',latitude:23,longitude:90,tariffId:tariff.id,status:'ONLINE',isOpen:true}});
 const device=await db.device.create({data:{publicId:`ESP-${suffix}`,stationId:station.id,mqttClientId:suffix,credentialRef:'secret://env/TEST_DEVICE_KEY',status:'ONLINE',lastSeenAt:new Date(),dataSource:'SIMULATOR',bootId:'boot'}});
 await db.station.update({where:{id:station.id},data:{primaryDeviceId:device.id}});
 const bay=await db.bay.create({data:{code:`BAY-${suffix}`,stationId:station.id,deviceId:device.id,number:1,relayChannel:1,connectorType:'TYPE_2',maxPowerW:3600,status:'PLUGGED',plugConnected:true,lastTelemetryAt:new Date()}});
 if(credit>0)await new AdminWalletService(db).adjust(owner.id,{kind:'ADMIN_CREDIT',amountMinor:credit,reason:'Simulator test funding'},`fund-${suffix}`,admin.id,'test');
 const config=readIotConfig({NODE_ENV:'test',ALLOW_DEVICE_SIMULATOR:'true'}),bus=new RealtimeBus(),engine=new ChargingEngine(db,config,bus,publisher,()=>deviceKey);
 const input={stationId:station.code,bayId:bay.code,vehicleId:vehicle.id};
 const start=()=>engine.start(owner.id,input,`start-${suffix}`,'test');
 const ack=async(sessionId:string,accepted=true)=>{const c=await db.deviceCommand.findFirstOrThrow({where:{sessionId,type:'START'}});await engine.acknowledge(device.id,{kind:'ack',bootId:'boot',sequence:'3',at:new Date().toISOString(),dataSource:'SIMULATOR',commandId:c.id,sessionId,accepted,relayOn:accepted,energyMWh:'0'});};
 return {owner,admin,vehicle,station,device,bay,engine,config,bus,input,start,ack};
}

