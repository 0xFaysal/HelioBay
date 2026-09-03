import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createApiClient,ApiError } from "../lib/api/client.ts";
import { minorText,resourceUser,mapUser,resourcePayment,mapPayment,resourceSession,mapSession,createResources } from "../lib/api/resources.ts";
import { walletView } from "../lib/credit/selectors.ts";
import { seed } from "../lib/credit/seed.ts";
const options={baseUrl:"https://api.example/api/v1",token:async()=>"firebase-token",unauthorized(){}};
test("versioned envelope is required and backend validation errors survive",async()=>{
  const client=createApiClient({...options,envelope:true,fetcher:async()=>Response.json({data:{id:"db-id"},requestId:"request"})});
  assert.equal((await client("/me",z.object({id:z.string()}))).id,"db-id");
  await assert.rejects(createApiClient({...options,envelope:true,fetcher:async()=>Response.json({id:"unwrapped"})})("/me",z.object({id:z.string()})),(e:unknown)=>e instanceof ApiError&&e.code==="INVALID_RESPONSE");
  await assert.rejects(createApiClient({...options,fetcher:async()=>Response.json({error:{code:"PLUG_REQUIRED",message:"Connect the vehicle before starting"}},{status:422})})("/charging-sessions/start",z.unknown(),{method:"POST"}),(e:unknown)=>e instanceof ApiError&&e.code==="PLUG_REQUIRED"&&e.message.includes("Connect"));
});
test("monetary display conversion refuses floating values and unsafe integers",()=>{for(const n of ["1.5","NaN","9007199254740992"])assert.equal(minorText.safeParse(n).success,false);assert.equal(minorText.parse("999999999999"),999999999999);});
test("local database role/id and preferences determine the account",()=>{
  const user=mapUser(resourceUser.parse({id:"database-owner",firebaseUid:"firebase-uid",role:"EV_OWNER",status:"ACTIVE",name:"Owner",email:null,phone:null,city:null,preferences:{charging:true,wallet:true,offers:false},savedStations:[]}));
  assert.equal(user.id,"database-owner");assert.equal(user.role,"owner");assert.equal(user.email,"");
});
test("all provider states are preserved, not converted to paid by callback location",()=>{
  for(const [status,expected]of Object.entries({PENDING:"pending",VALIDATING:"validating",PAID:"verified",FAILED:"failed",CANCELLED:"cancelled",EXPIRED:"expired",RISK_REVIEW:"risk-review",REVERSED:"reversed"})){
    const p=mapPayment(resourcePayment.parse({transactionId:"p",userId:"owner",amountMinor:"1000",status,isSandbox:true,createdAt:new Date().toISOString(),verifiedAt:null}));assert.equal(p.status,expected);
  }
});
test("API wallets use posted/held/available server values without subtracting cost twice",()=>{
  const data=seed();data.wallets=[{userId:"owner",balanceMinor:10000,heldMinor:9000,availableMinor:1000}];assert.deepEqual(walletView(data,"owner"),{balanceMinor:10000,reservedMinor:9000,availableMinor:1000});
});
test("session requires controller confirmation and retains interrupted reconciliation state",()=>{
  const now=new Date().toISOString();
  const raw={id:"s",ownerId:"u",stationId:"st",bayId:"b",deviceId:"d",vehicleId:"v",status:"INTERRUPTED",createdAt:now,updatedAt:now,startedAt:now,completedAt:null,stopReason:"DEVICE_OFFLINE",energyMWh:"10000",costMinor:"10",reservedMinor:"1000",endingBalanceMinor:null,tariffMinorPerKwh:1000,reconciliationRequired:true,dataSource:"SIMULATOR",receipt:null,vehicle:{id:"v",ownerId:"u",name:"EV",plate:"TEST",capacityWh:10000,estimatedSocPct:50,connectorType:"TYPE_2",isDefault:true},telemetry:[],events:[],commands:[]};
  const session=mapSession(resourceSession.parse(raw));assert.equal(session.state,"pending");assert.equal(session.reconciliationRequired,true);assert.equal(session.receiptConfirmed,false);assert.equal(session.dataSource,"SIMULATOR");
  assert.equal(mapSession(resourceSession.parse({...raw,status:"COMPLETED",completedAt:now})).state,"pending");
  assert.equal(mapSession(resourceSession.parse({...raw,status:"COMPLETED",completedAt:now,receipt:{confirmed:true}})).state,"completed");
});
test("resource pagination loads subsequent pages and sends authorization",async()=>{
  let count=0;const api=createResources({...options,fetcher:async(url,init)=>{count++;assert.equal((init?.headers as Record<string,string>).Authorization,"Bearer firebase-token");const page=new URL(String(url)).searchParams.get("page");return Response.json({data:page==="1"?Array.from({length:100},(_,id)=>({id})): [{id:100}]});}});
  assert.equal((await api.all("/me/test",z.object({id:z.number()}))).length,101);assert.equal(count,2);
});
