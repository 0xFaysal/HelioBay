import { connect,type MqttClient } from 'mqtt';
import { readFileSync } from 'node:fs';
import type { IotConfig } from '../../config/iot.js';
import type { DeviceIngress } from './ingress.js';
import { canonical,sign,topic } from './protocol.js';
export interface CommandPublisher { ready():boolean; publish(station:string,device:string,payload:unknown,key:string):Promise<void>; }
export class MqttGateway implements CommandPublisher {
  private client?:MqttClient;private retry?:ReturnType<typeof setTimeout>;private attempt=0;private stopping=false;
  constructor(private config:IotConfig,private ingress:DeviceIngress) {}
  start() {
    if(!this.config.MQTT_URL)return;
    this.client=connect(this.config.MQTT_URL,{clientId:this.config.MQTT_CLIENT_ID,username:this.config.MQTT_USERNAME||undefined,password:this.config.MQTT_PASSWORD||undefined,protocolVersion:5,clean:true,reconnectPeriod:0,connectTimeout:10000,queueQoSZero:false,rejectUnauthorized:true,...(this.config.MQTT_CA_FILE?{ca:readFileSync(this.config.MQTT_CA_FILE)}:{}),will:{topic:`heliobay/v1/backend/${this.config.MQTT_CLIENT_ID}/status`,payload:Buffer.from('{"online":false}'),qos:1,retain:true}});
    this.client.on('connect',()=>{this.attempt=0;this.client!.subscribe(['telemetry','events','acks','status'].map(channel=>`heliobay/v1/stations/+/devices/+/${channel}`),{qos:1},()=>{});});
    // MQTT messages are serialized so a final sample cannot race its preceding sample locally.
    let queue=Promise.resolve(),pending=0;
    this.client.on('message',(name,body,packet)=>{if(pending>=200)return;pending++;queue=queue.then(()=>this.ingress.receive(name,body,packet.retain)).then(()=>{}).catch(()=>{}).finally(()=>{pending--;});});
    this.client.on('error',()=>{});
    this.client.on('close',()=>{if(this.stopping||this.retry)return;const ms=Math.min(30000,1000*2**Math.min(this.attempt++,5));this.retry=setTimeout(()=>{this.retry=undefined;this.client?.reconnect();},ms);this.retry.unref();});
  }
  ready(){return this.client?.connected??false;}
  async publish(station:string,device:string,payload:unknown,key:string) {
    if(!this.client?.connected)throw new Error('MQTT unavailable');
    const name=topic(station,device,'commands');
    await this.client.publishAsync(name,canonical({payload,signature:sign(name,payload,key)}),{qos:1,retain:false,properties:{messageExpiryInterval:this.config.COMMAND_ACK_TIMEOUT_SECONDS}});
  }
  async close(){this.stopping=true;if(this.retry)clearTimeout(this.retry);await this.client?.endAsync(true);}
}
