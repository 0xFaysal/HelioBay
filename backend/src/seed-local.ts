import { makeDatabase } from './shared/database/client.js';

if (process.env.NODE_ENV === 'production' || process.env.APP_MODE !== 'local' || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('Local seed requires a non-production Firebase emulator');

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const databaseUrl=required('DATABASE_URL'), emulator=required('FIREBASE_AUTH_EMULATOR_HOST');
const projectId=required('FIREBASE_PROJECT_ID'), hmacKey=required('SIMULATOR_HMAC_KEY');
if(hmacKey.length<32)throw new Error('SIMULATOR_HMAC_KEY must contain at least 32 characters');
const deviceMode=process.env.DEVICE_MODE==='simulator'?'simulator':'hardware';

async function firebaseUser(email:string,password:string) {
  const endpoint=`http://${emulator}/identitytoolkit.googleapis.com/v1/accounts`;
  let response=await fetch(`${endpoint}:signUp?key=local`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
  if(response.ok)return (await response.json() as {localId:string}).localId;
  const error=await response.json() as {error?:{message?:string}};
  if(error.error?.message!=='EMAIL_EXISTS')throw new Error(`Firebase seed failed: ${error.error?.message??response.status}`);
  response=await fetch(`${endpoint}:signInWithPassword?key=local`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
  if(!response.ok)throw new Error(`Existing local Firebase account password differs for ${email}`);
  return (await response.json() as {localId:string}).localId;
}

const adminEmail=required('LOCAL_ADMIN_EMAIL'),ownerEmail=required('LOCAL_USER_EMAIL');
const [adminUid,ownerUid]=await Promise.all([firebaseUser(adminEmail,required('LOCAL_ADMIN_PASSWORD')),firebaseUser(ownerEmail,required('LOCAL_USER_PASSWORD'))]);
const db=makeDatabase(databaseUrl);
try {
  await db.$transaction(async tx=>{
    const admin=await tx.user.upsert({where:{firebaseUid:adminUid},create:{firebaseUid:adminUid,email:adminEmail,name:'Local Admin',role:'ADMIN',isDemo:true,wallet:{create:{}}},update:{email:adminEmail,name:'Local Admin',role:'ADMIN',status:'ACTIVE',isDemo:true}});
    const owner=await tx.user.upsert({where:{firebaseUid:ownerUid},create:{firebaseUid:ownerUid,email:ownerEmail,name:'Local EV Owner',role:'EV_OWNER',isDemo:true,wallet:{create:{}}},update:{email:ownerEmail,name:'Local EV Owner',role:'EV_OWNER',status:'ACTIVE',isDemo:true}});
    await tx.wallet.upsert({where:{userId:admin.id},create:{userId:admin.id},update:{}});
    const wallet=await tx.wallet.upsert({where:{userId:owner.id},create:{userId:owner.id},update:{}});
    if(!await tx.walletLedger.findUnique({where:{reference:'local-opening-credit'}})){
      await tx.walletLedger.create({data:{walletId:wallet.id,kind:'DEMO_CREDIT',amountMinor:50000n,balanceAfterMinor:wallet.balanceMinor+50000n,actorId:admin.id,description:'Local prototype opening credit',reference:'local-opening-credit',reason:'Idempotent local setup credit',isDemo:true}});
    }
    await tx.vehicle.upsert({where:{id:'local-vehicle'},create:{id:'local-vehicle',ownerId:owner.id,name:'Local Test EV',plate:'LOCAL-01',connectorType:'TYPE_2',capacityWh:40000,isDefault:true},update:{ownerId:owner.id}});
    const tariff=await tx.tariff.upsert({where:{id:'local-tariff'},create:{id:'local-tariff',name:'Local prototype tariff',priceMinorPerKwh:2500},update:{}});
    const station=await tx.station.upsert({where:{code:'ST001'},create:{code:'ST001',name:'HelioBay Local Station',address:'Private LAN prototype',latitude:23.7806,longitude:90.4193,tariffId:tariff.id,isDemo:true,solarCapable:true,batteryCapable:true},update:{tariffId:tariff.id,isDemo:true}});
    const source=deviceMode==='simulator'?'SIMULATOR' as const:'LIVE_HARDWARE' as const;
    const device=await tx.device.upsert({where:{publicId:'ESP32-ST001'},create:{publicId:'ESP32-ST001',stationId:station.id,mqttClientId:deviceMode==='simulator'?'sim-ESP32-ST001':'heliobay-esp32-st001',credentialRef:'secret://env/SIMULATOR_HMAC_KEY',dataSource:source,hardwareMetadata:{model:deviceMode==='simulator'?'SIMULATED DEVICE':'ESP32 prototype',channels:1}},update:{stationId:station.id,mqttClientId:deviceMode==='simulator'?'sim-ESP32-ST001':'heliobay-esp32-st001',credentialRef:'secret://env/SIMULATOR_HMAC_KEY',dataSource:source,hardwareMetadata:{model:deviceMode==='simulator'?'SIMULATED DEVICE':'ESP32 prototype',channels:1}}});
    await tx.station.update({where:{id:station.id},data:{primaryDeviceId:device.id}});
    await tx.bay.upsert({where:{code:'BAY01'},create:{code:'BAY01',stationId:station.id,deviceId:device.id,number:1,relayChannel:1,connectorType:'TYPE_2',maxPowerW:7000},update:{stationId:station.id,deviceId:device.id}});
    await tx.auditLog.upsert({where:{id:'local-seed-audit'},create:{id:'local-seed-audit',actorId:admin.id,action:'LOCAL_SEED',targetType:'LocalEnvironment',targetId:projectId,requestId:'local-seed',reason:'Idempotent local environment bootstrap'},update:{}});
  });
  console.info(`Local accounts and station seeded for ${projectId}`);
} finally { await db.$disconnect(); }
