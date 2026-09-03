import { WebSocket } from 'ws';
export function socketClient(url:string) {
 const ws=new WebSocket(url),messages:Array<Record<string,unknown>>=[];
 ws.on('message',raw=>messages.push(JSON.parse(raw.toString())));
 const waitFor=async(predicate:(v:Record<string,unknown>)=>boolean)=>{
  const end=Date.now()+5000;
  while(Date.now()<end){const index=messages.findIndex(predicate);if(index>=0)return messages.splice(index,1)[0]!;await new Promise(r=>setTimeout(r,10));}throw new Error('WebSocket message timeout');
 };
 return {ws,messages,waitFor,async authenticate(token:string){await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});ws.send(JSON.stringify({type:'authenticate',token}));return waitFor(m=>m.type==='authenticated');},async subscribe(room:string){ws.send(JSON.stringify({type:'subscribe',room}));return waitFor(m=>m.type==='subscribed'||m.type==='error');}};
}
