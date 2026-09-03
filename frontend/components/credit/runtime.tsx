"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { isDemo, wsUrl } from "@/lib/config";
import { useCreditStore, transaction } from "@/store/credit-store";
import { creditService } from "@/lib/credit/services";
import { advance } from "@/lib/credit/engine";
import { firebaseAuth, firebaseConfigured } from "@/lib/firebase/client";

const eventSchema=z.object({type:z.string(),eventId:z.string(),at:z.string().datetime(),data:z.unknown()});
const sessionEvent=z.object({id:z.string(),ownerId:z.string()});
export function PlatformRuntime() {
  const ready=useCreditStore(s=>s.ready),identity=useCreditStore(s=>s.account?.id);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{const handler=()=>setRetry(x=>x+1);window.addEventListener("heliobay:reconnect",handler);return()=>window.removeEventListener("heliobay:reconnect",handler);},[]);
  useEffect(()=>{
    if(!ready)return;
    let disposed=false,busy=false,socket:WebSocket|undefined,reconnect:ReturnType<typeof setTimeout>|undefined,renew:ReturnType<typeof setTimeout>|undefined,retries=0;
    const abort=new AbortController(),seen=new Set<string>(),pending=new Set<string>();
    if(isDemo){
      const sync=(e:StorageEvent)=>{if(e.key==="heliobay-credit-v3")void useCreditStore.persist.rehydrate();};
      window.addEventListener("storage",sync);
      const timer=setInterval(async()=>{if(busy)return;busy=true;try{await transaction(data=>{if(!disposed&&Date.now()-Date.parse(data.lastTick)>=900)Object.assign(data,advance(data,Date.now()));});}catch{useCreditStore.setState({error:"Demo storage unavailable. Refresh to recover."});}finally{busy=false;}},1000);
      return()=>{disposed=true;clearInterval(timer);window.removeEventListener("storage",sync);};
    }
    const refresh=async()=>{if(busy||disposed)return;busy=true;try{await creditService.refresh(abort.signal);}catch{/* Store exposes API errors and recovery. */}finally{busy=false;}};
    void refresh();
    const poll=setInterval(()=>void refresh(),30000);
    const flush=setInterval(async()=>{if(busy||disposed||!pending.size)return;busy=true;const ids=[...pending];pending.clear();try{await Promise.all(ids.map(id=>creditService.charging.sync(id,abort.signal)));}catch{useCreditStore.setState({connection:"Session update unavailable · retrying"});}finally{busy=false;}},2000);
    async function connect(forceToken=false){
      if(disposed||!identity)return;
      if(!wsUrl){useCreditStore.setState({connection:"Realtime not configured · periodic status checks"});return;}
      try{
        const url=new URL(wsUrl);if(!["ws:","wss:"].includes(url.protocol)||url.username||url.password||url.search)throw new Error("Invalid realtime URL");
        const token=firebaseConfigured?await firebaseAuth().currentUser?.getIdToken(forceToken):null;
        if(disposed||!token)return;
        socket=new WebSocket(url);
        socket.onopen=()=>socket?.send(JSON.stringify({type:"authenticate",token}));
        socket.onmessage=e=>{
          if(disposed||useCreditStore.getState().account?.id!==identity)return;
          try{
            const value=JSON.parse(String(e.data));
            if(value.type==="authenticated"){
              const auth=z.object({userId:z.literal(identity!),expiresAt:z.string().datetime()}).parse(value);
              retries=0;useCreditStore.setState({connection:"Realtime connected"});
              if(useCreditStore.getState().account?.role==="admin")socket?.send(JSON.stringify({type:"subscribe",room:"admin"}));
              else for(const station of useCreditStore.getState().data.stations.slice(0,20))socket?.send(JSON.stringify({type:"subscribe",room:"station:"+station.id}));
              void refresh();
              clearTimeout(renew);renew=setTimeout(()=>socket?.close(1000,"Refresh authentication"),Math.max(1000,Date.parse(auth.expiresAt)-Date.now()-60000));
              return;
            }
            if(["subscribed","unsubscribed"].includes(value.type))return;
            const event=eventSchema.parse(value);if(seen.has(event.eventId))return;seen.add(event.eventId);if(seen.size>500)seen.delete(seen.values().next().value!);
            const data=event.data;
            const candidate=sessionEvent.safeParse(data&&typeof data==="object"&&"session" in data?data.session:data);
            if(candidate.success)pending.add(candidate.data.id);
            if(event.type==="session.stopped")toast.info("Charging stopped. Checking the final meter and receipt.");
            if(event.type==="credit.warning")toast.warning("Your session credit limit is nearly reached.");
            if(event.type==="payment.updated"||event.type==="wallet.updated")void refresh();
          }catch{useCreditStore.setState({connection:"Unrecognized realtime message · checking current status"});}
        };
        socket.onerror=()=>useCreditStore.setState({connection:"Realtime interrupted · last known data"});
        socket.onclose=event=>{
          clearTimeout(renew);if(disposed)return;
          useCreditStore.setState({connection:"Reconnecting · last known data"});
          if(event.code===4403){void refresh();return;}
          if(retries<6)reconnect=setTimeout(()=>void connect(event.code===4401),Math.min(30000,1000*2**retries++));
          else useCreditStore.setState({connection:"Realtime unavailable · use retry connection"});
        };
      }catch{useCreditStore.setState({connection:"Realtime unavailable · periodic status checks"});}
    }
    void connect();
    return()=>{disposed=true;abort.abort();clearInterval(poll);clearInterval(flush);clearTimeout(reconnect);clearTimeout(renew);if(socket){socket.onmessage=null;socket.onclose=null;socket.close();}};
  },[ready,identity,retry]);
  return null;
}
