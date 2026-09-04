#include <Arduino.h>
#include <ArduinoJson.h>
#include <ArduinoMqttClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_INA219.h>
#include <Adafruit_SSD1306.h>
#include <mbedtls/md.h>
#include <time.h>
#include "secrets.h"

// Hardware assumptions: the relay input is active-low, accepts a 3.3 V push-pull
// signal, is isolated from its coil, and the contactor is normally open. INA219
// measures the charging output; GPIO34 uses the divider configured in secrets.h.
// relayOn is commanded state because this prototype has no contactor feedback.
// Add calibrated protection, fusing, thermal/RCD protection and emergency isolation
// before connecting a real EV battery. INA219 is not a certified billing meter.
namespace {
constexpr uint8_t RELAY_PIN=18,SOLAR_ADC_PIN=34,I2C_SDA_PIN=21,I2C_SCL_PIN=22,RELAY_CHANNEL=1;
constexpr uint8_t SCREEN_WIDTH=128,SCREEN_HEIGHT=64,OLED_ADDRESS=0x3C;
constexpr uint32_t DISPLAY_MS=500,HEARTBEAT_MS=10000,NTP_TIMEOUT_MS=15000,MAX_PACKET=8192,SEQ_BLOCK=10000;
enum class View { READY,CONNECTING,CHARGING,STOPPING,OFFLINE,FAULT };
Adafruit_SSD1306 display(SCREEN_WIDTH,SCREEN_HEIGHT,&Wire,-1);
Adafruit_INA219 ina219;
WiFiClient net;
MqttClient mqtt(net);
Preferences prefs;
bool oledOk=false,inaOk=false,sensorReadingOk=false,relayOn=false,clockOk=false,pendingFinal=false;
View view=View::CONNECTING;
String fault,bootId,sessionId,completedSession,lastCommand,lastCommandSession,lastCommandFailure;
bool lastCommandAccepted=false,lastCommandRelay=false;
uint64_t sequence=0,sequenceLimit=0,energyMWh=0,stationEnergyMWh=0,solarEnergyMWh=0,energyRemainder=0;
uint64_t authorizedEnergyMWh=0;
uint32_t authorizedDurationSec=0,telemetryMs=1000,sessionStartMs=0,lowCurrentSince=0,fullSince=0;
uint32_t lastMeasureMs=0,lastTelemetryMs=0,lastHeartbeatMs=0,lastDisplayMs=0,nextWifiMs=0,nextMqttMs=0,lastPersistMs=0;
uint8_t wifiAttempt=0,mqttAttempt=0;
float chargeV=0,chargeMa=0,solarV=0;

String channelTopic(const char* channel){return String("heliobay/v1/stations/")+STATION_ID+"/devices/"+DEVICE_ID+"/"+channel;}
String u64(uint64_t value){char b[24];snprintf(b,sizeof(b),"%llu",static_cast<unsigned long long>(value));return String(b);}
uint32_t backoff(uint8_t n){return min<uint32_t>(30000,1000UL<<min<uint8_t>(n,5));}
void setRelay(bool on){relayOn=on;digitalWrite(RELAY_PIN,on?LOW:HIGH);}
void persistSession(){prefs.putString("session",sessionId);prefs.putULong64("energy",energyMWh);prefs.putULong64("maxEnergy",authorizedEnergyMWh);prefs.putUInt("maxDuration",authorizedDurationSec);prefs.putBool("active",relayOn||!sessionId.isEmpty());}
void persistCommand(){prefs.putString("lastCmd",lastCommand);prefs.putString("lastCmdSess",lastCommandSession);prefs.putString("lastFailure",lastCommandFailure);prefs.putBool("lastAccepted",lastCommandAccepted);prefs.putBool("lastRelay",lastCommandRelay);}
uint64_t nextSequence(){if(sequence>=sequenceLimit){sequenceLimit+=SEQ_BLOCK;prefs.putULong64("seqHigh",sequenceLimit);}return ++sequence;}
String timestamp(){time_t now=time(nullptr);struct tm utc{};gmtime_r(&now,&utc);char b[25];strftime(b,sizeof(b),"%Y-%m-%dT%H:%M:%S.000Z",&utc);return String(b);}
bool parseTimestamp(const char* value,time_t& result){if(!value||strlen(value)<20||value[4]!='-'||value[7]!='-'||value[10]!='T'||value[strlen(value)-1]!='Z')return false;struct tm parsed{};char* end=strptime(value,"%Y-%m-%dT%H:%M:%S",&parsed);if(!end||(*end!='.'&&*end!='Z'))return false;result=mktime(&parsed);return result>0;}
bool identifier(const char* value){if(!value)return false;size_t n=strlen(value);if(n<1||n>100)return false;for(size_t i=0;i<n;i++)if(!isalnum(static_cast<unsigned char>(value[i]))&&value[i]!='_'&&value[i]!='-')return false;return true;}
uint64_t decimal(JsonVariantConst value,bool& ok){const char* s=value.as<const char*>();if(!s||!*s){ok=false;return 0;}uint64_t r=0;for(;*s;s++){if(*s<'0'||*s>'9'||r>(UINT64_MAX-(*s-'0'))/10){ok=false;return 0;}r=r*10+(*s-'0');}ok=true;return r;}

// Backend signatures use recursively key-sorted, whitespace-free canonical JSON.
void canonical(JsonVariantConst value,String& out){
  if(value.is<JsonObjectConst>()){JsonObjectConst object=value.as<JsonObjectConst>();const char* keys[32];size_t count=0;for(JsonPairConst pair:object){if(count==32){out="";return;}keys[count++]=pair.key().c_str();}for(size_t i=0;i<count;i++)for(size_t j=i+1;j<count;j++)if(strcmp(keys[i],keys[j])>0){const char* t=keys[i];keys[i]=keys[j];keys[j]=t;}out+='{';for(size_t i=0;i<count;i++){if(i)out+=',';out+='\"';out+=keys[i];out+='\"';out+=':';canonical(object[keys[i]],out);if(out.isEmpty())return;}out+='}';
  }else if(value.is<JsonArrayConst>()){out+='[';bool first=true;for(JsonVariantConst item:value.as<JsonArrayConst>()){if(!first)out+=',';first=false;canonical(item,out);if(out.isEmpty())return;}out+=']';
  }else serializeJson(value,out);
}
String hmac(const String& message){unsigned char digest[32];mbedtls_md_context_t c;mbedtls_md_init(&c);const mbedtls_md_info_t* info=mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);if(!info||mbedtls_md_setup(&c,info,1)||mbedtls_md_hmac_starts(&c,reinterpret_cast<const unsigned char*>(DEVICE_HMAC_KEY),strlen(DEVICE_HMAC_KEY))||mbedtls_md_hmac_update(&c,reinterpret_cast<const unsigned char*>(message.c_str()),message.length())||mbedtls_md_hmac_finish(&c,digest)){mbedtls_md_free(&c);return "";}mbedtls_md_free(&c);char hex[65];for(size_t i=0;i<32;i++)snprintf(hex+i*2,3,"%02x",digest[i]);hex[64]=0;return String(hex);}
bool secureEqual(const String& a,const char* b){if(!b||a.length()!=strlen(b))return false;uint8_t d=0;for(size_t i=0;i<a.length();i++)d|=a[i]^b[i];return d==0;}
void common(JsonDocument& p,const char* kind){p["kind"]=kind;p["bootId"]=bootId;p["sequence"]=u64(nextSequence());p["at"]=timestamp();p["dataSource"]="LIVE_HARDWARE";}
String envelope(JsonDocument& payload,const String& destination){String body;body.reserve(2048);canonical(payload.as<JsonVariantConst>(),body);if(body.isEmpty())return "";String signature=hmac(destination+"\n"+body);JsonDocument out;out["payload"].set(payload);out["signature"]=signature;body="";serializeJson(out,body);return body;}
bool publish(JsonDocument& payload,const char* channel,bool retained=false){if(!mqtt.connected())return false;String destination=channelTopic(channel),body=envelope(payload,destination);if(body.isEmpty()||body.length()>MAX_PACKET||!mqtt.beginMessage(destination,body.length(),retained,1,false))return false;mqtt.print(body);return mqtt.endMessage()==1;}
JsonDocument makeStatus(bool online){JsonDocument p;common(p,"status");p["online"]=online;return p;}
void publishStatus(bool online){JsonDocument p=makeStatus(online);publish(p,"status");}
void publishAck(const String& command,const String& commandSession,bool accepted,const String& failure=""){JsonDocument p;common(p,"ack");p["commandId"]=command;if(commandSession.isEmpty())p["sessionId"]=nullptr;else p["sessionId"]=commandSession;p["accepted"]=accepted;p["relayOn"]=relayOn;p["energyMWh"]=u64(energyMWh);if(!failure.isEmpty())p["failureCode"]=failure;publish(p,"acks");}
void publishEvent(const char* event,const char* code){JsonDocument p;common(p,"event");p["bayId"]=BAY_ID;p["event"]=event;p["code"]=code;publish(p,"events");}

float readSolar(){return (analogRead(SOLAR_ADC_PIN)/4095.0f)*ADC_REFERENCE_V*SOLAR_DIVIDER_RATIO;}
void measure(){solarV=readSolar();sensorReadingOk=false;if(!inaOk){chargeV=chargeMa=0;return;}chargeV=ina219.getBusVoltage_V();chargeMa=ina219.getCurrent_mA();if(!isfinite(chargeV)||!isfinite(chargeMa)){chargeV=chargeMa=0;return;}chargeMa=max(0.0f,chargeMa);sensorReadingOk=true;}
uint32_t chargePower(){return static_cast<uint32_t>(max(0.0f,chargeV*chargeMa/1000.0f)+0.5f);}
bool plugged(){uint32_t mv=static_cast<uint32_t>(max(0.0f,chargeV)*1000);return inaOk&&mv>=PLUG_SENSE_MIN_MV&&mv<=PLUG_SENSE_MAX_MV;}
void integrate(uint32_t now){uint32_t elapsed=now-lastMeasureMs;lastMeasureMs=now;if(relayOn){energyRemainder+=static_cast<uint64_t>(chargePower())*elapsed;uint64_t add=energyRemainder/3600ULL;energyRemainder%=3600ULL;energyMWh+=add;stationEnergyMWh+=add;}}

void publishTelemetry(bool finalReading){
  JsonDocument p;common(p,"telemetry");p["bayId"]=BAY_ID;if(sessionId.isEmpty())p["sessionId"]=nullptr;else p["sessionId"]=sessionId;p["online"]=WiFi.status()==WL_CONNECTED&&mqtt.connected();p["plugConnected"]=plugged();p["relayOn"]=relayOn;p["batterySenseAvailable"]=inaOk;if(inaOk)p["vehicleBatteryMv"]=static_cast<uint32_t>(max(0.0f,chargeV)*1000);else p["vehicleBatteryMv"]=nullptr;p["vehicleBatteryPercent"]=nullptr;p["batteryPercentageEstimated"]=true;p["solarVoltageMv"]=static_cast<uint32_t>(max(0.0f,solarV)*1000);p["solarCurrentMa"]=0;p["solarPowerW"]=0;p["solarEnergyMWh"]=u64(solarEnergyMWh);p["chargingVoltageMv"]=static_cast<uint32_t>(max(0.0f,chargeV)*1000);p["chargingCurrentMa"]=static_cast<uint32_t>(max(0.0f,chargeMa));p["chargingPowerW"]=chargePower();p["energyMWh"]=u64(energyMWh);p["stationEvEnergyMWh"]=u64(stationEnergyMWh);p["stationBatteryPercent"]=nullptr;p["stationBatteryPowerW"]=0;p["auxiliaryPowerW"]=0;p["gridImportPowerW"]=0;p["gridExportPowerW"]=0;p["gridImportEnergyMWh"]="0";p["gridExportEnergyMWh"]="0";p["source"]="SOLAR";JsonArray faults=p["faultCodes"].to<JsonArray>();if(!fault.isEmpty())faults.add(fault);p["final"]=finalReading;
  if(publish(p,"telemetry")){if(finalReading){pendingFinal=false;prefs.putBool("finalPending",false);completedSession=sessionId;prefs.putString("completed",completedSession);sessionId="";persistSession();}}
  else if(finalReading){pendingFinal=true;prefs.putBool("finalPending",true);}
}
void stopCharging(const String& reason,bool safetyEvent){if(relayOn){view=View::STOPPING;setRelay(false);}if(!reason.isEmpty())fault=reason;persistSession();pendingFinal=!sessionId.isEmpty();prefs.putBool("finalPending",pendingFinal);if(safetyEvent&&mqtt.connected())publishEvent("SENSOR_FAULT",reason.c_str());if(mqtt.connected()&&pendingFinal)publishTelemetry(true);view=fault.isEmpty()?View::READY:View::FAULT;}
void remember(const String& command,const String& commandSession,bool accepted,const String& failure){lastCommand=command;lastCommandSession=commandSession;lastCommandAccepted=accepted;lastCommandRelay=relayOn;lastCommandFailure=failure;persistCommand();}
void reject(const String& command,const String& commandSession,const String& failure,bool store=true){stopCharging(failure,false);if(store)remember(command,commandSession,false,failure);publishAck(command,commandSession,false,failure);}

void processCommand(const String& raw){
  if(raw.isEmpty()||raw.length()>MAX_PACKET||mqtt.messageRetain()){stopCharging("INVALID_COMMAND",false);return;}
  JsonDocument doc;if(deserializeJson(doc,raw)||!doc["payload"].is<JsonObject>()||!doc["signature"].is<const char*>()){stopCharging("INVALID_COMMAND",false);return;}
  JsonObjectConst c=doc["payload"].as<JsonObjectConst>();String normalized;canonical(c,normalized);String expected=hmac(channelTopic("commands")+"\n"+normalized);if(expected.isEmpty()||!secureEqual(expected,doc["signature"].as<const char*>())){stopCharging("INVALID_SIGNATURE",false);return;}
  const char* idText=c["commandId"].as<const char*>();const char* typeText=c["type"].as<const char*>();const char* sidText=c["sessionId"].isNull()?"":c["sessionId"].as<const char*>();String id=idText?idText:"invalid",sid=sidText?sidText:"";
  bool identityOk=identifier(idText)&&typeText&&c["stationId"].is<const char*>()&&c["deviceId"].is<const char*>()&&strcmp(c["stationId"].as<const char*>(),STATION_ID)==0&&strcmp(c["deviceId"].as<const char*>(),DEVICE_ID)==0;
  if(!identityOk){reject(id,sid,"IDENTITY_MISMATCH",false);return;}
  if(id==lastCommand){publishAck(lastCommand,lastCommandSession,lastCommandAccepted,lastCommandFailure);return;}
  time_t issued=0,expires=0,now=time(nullptr);if(!clockOk||!parseTimestamp(c["issuedAt"].as<const char*>(),issued)||!parseTimestamp(c["expiresAt"].as<const char*>(),expires)||now>expires||issued>now+5||expires<=issued){reject(id,sid,"COMMAND_EXPIRED");return;}
  String type(typeText);
  if(type=="START"){
    bool amountOk=false;uint64_t maxEnergy=decimal(c["maxEnergyMWh"],amountOk);int duration=c["maxDurationSeconds"]|0,interval=c["telemetryIntervalMs"]|0,relay=c["relayChannel"]|0;
    if(!identifier(sidText)||c["bayId"].as<String>()!=BAY_ID||relay!=RELAY_CHANNEL||c["dataSource"].as<String>()!="LIVE_HARDWARE"||!amountOk||!maxEnergy||duration<=0||interval<100||!inaOk||!plugged()||!sessionId.isEmpty()||sid==completedSession){reject(id,sid,"START_REJECTED");return;}
    sessionId=sid;energyMWh=energyRemainder=0;authorizedEnergyMWh=maxEnergy;authorizedDurationSec=duration;telemetryMs=constrain(static_cast<uint32_t>(interval),100UL,30000UL);sessionStartMs=millis();lowCurrentSince=fullSince=0;fault="";persistSession();setRelay(true);persistSession();view=View::CHARGING;remember(id,sid,true,"");publishAck(id,sid,true);publishTelemetry(false);return;
  }
  if(type=="STOP"||type=="EMERGENCY_STOP"){
    bool matches=!sessionId.isEmpty()&&sid==sessionId&&c["bayId"].as<String>()==BAY_ID&&(c["relayChannel"]|0)==RELAY_CHANNEL;if(!matches){reject(id,sid,"SESSION_MISMATCH");return;}setRelay(false);persistSession();fault=type=="EMERGENCY_STOP"?"EMERGENCY_STOP":"";remember(id,sid,true,"");publishAck(id,sid,true);pendingFinal=true;prefs.putBool("finalPending",true);publishTelemetry(true);view=fault.isEmpty()?View::READY:View::FAULT;return;
  }
  if(type=="TEST"||type=="RESTART"){
    if(relayOn||!sessionId.isEmpty()||!sid.isEmpty()){reject(id,sid,"DEVICE_BUSY");return;}setRelay(false);remember(id,"",true,"");publishAck(id,"",true);if(type=="RESTART"){delay(100);ESP.restart();}return;
  }
  reject(id,sid,"UNKNOWN_COMMAND");
}

bool syncClock(){configTime(0,0,NTP_SERVER_1,NTP_SERVER_2);uint32_t start=millis();while(millis()-start<NTP_TIMEOUT_MS){if(time(nullptr)>1700000000)return true;delay(100);}return false;}
bool connectBroker(){
  if(!strlen(MQTT_HOST)||strcmp(MQTT_HOST,"192.168.x.x")==0||!strlen(MQTT_USERNAME)||!strlen(MQTT_PASSWORD)||strlen(DEVICE_HMAC_KEY)<32){fault="CONFIG_REQUIRED";view=View::FAULT;return false;}
  mqtt.setId(MQTT_CLIENT_ID);mqtt.setUsernamePassword(MQTT_USERNAME,MQTT_PASSWORD);mqtt.setKeepAliveInterval(15);mqtt.setConnectionTimeout(10);JsonDocument will=makeStatus(false);String willTopic=channelTopic("status"),willBody=envelope(will,willTopic);mqtt.beginWill(willTopic,willBody.length(),true,1);mqtt.print(willBody);mqtt.endWill();if(!mqtt.connect(MQTT_HOST,MQTT_PORT))return false;if(!mqtt.subscribe(channelTopic("commands"),1)){mqtt.stop();return false;}publishStatus(true);if(pendingFinal&&!sessionId.isEmpty())publishTelemetry(true);return true;
}
void connections(uint32_t now){
  if(WiFi.status()!=WL_CONNECTED){if(relayOn||!sessionId.isEmpty())stopCharging("WIFI_LOST",false);mqtt.stop();clockOk=false;view=fault.isEmpty()?View::OFFLINE:View::FAULT;if(static_cast<int32_t>(now-nextWifiMs)>=0){WiFi.disconnect();WiFi.begin(WIFI_SSID,WIFI_PASSWORD);nextWifiMs=now+backoff(wifiAttempt++);}return;}
  wifiAttempt=0;if(!clockOk){view=View::CONNECTING;clockOk=syncClock();if(!clockOk)return;}
  if(!mqtt.connected()){if(relayOn||!sessionId.isEmpty())stopCharging("MQTT_LOST",false);view=fault.isEmpty()?View::CONNECTING:View::FAULT;if(static_cast<int32_t>(now-nextMqttMs)>=0){if(connectBroker()){mqttAttempt=0;fault="";view=View::READY;}else nextMqttMs=now+backoff(mqttAttempt++);}return;}mqtt.poll();
}
void safety(uint32_t now){
  if(!relayOn)return;if(!inaOk||!sensorReadingOk){stopCharging("SENSOR_FAULT",true);return;}uint32_t mv=static_cast<uint32_t>(max(0.0f,chargeV)*1000),ma=static_cast<uint32_t>(max(0.0f,chargeMa));if(mv>MAX_CHARGING_VOLTAGE_MV){stopCharging("OVERVOLTAGE",true);return;}if(ma>MAX_CHARGING_CURRENT_MA){stopCharging("OVERCURRENT",true);return;}if(energyMWh>=authorizedEnergyMWh){stopCharging("MAX_ENERGY_REACHED",false);return;}if((now-sessionStartMs)/1000UL>=authorizedDurationSec){stopCharging("MAX_DURATION_REACHED",false);return;}
  if(ma<MIN_CHARGING_CURRENT_MA&&now-sessionStartMs>=CURRENT_GRACE_PERIOD_MS){if(!lowCurrentSince)lowCurrentSince=now;if(now-lowCurrentSince>=UNPLUG_TIMEOUT_MS){stopCharging("PLUG_DISCONNECTED",false);return;}}else lowCurrentSince=0;
  bool full=FULL_BATTERY_MV>0&&mv>=FULL_BATTERY_MV&&ma<=FULL_CURRENT_MA;if(full){if(!fullSince)fullSince=now;if(now-fullSince>=FULL_CONFIRMATION_MS){stopCharging("BATTERY_FULL",false);return;}}else fullSince=0;
}
const char* viewText(){switch(view){case View::READY:return "READY";case View::CONNECTING:return "CONNECTING";case View::CHARGING:return "CHARGING";case View::STOPPING:return "STOPPING";case View::OFFLINE:return "OFFLINE";case View::FAULT:return "FAULT";}return "OFFLINE";}
void draw(uint32_t now){if(!oledOk||now-lastDisplayMs<DISPLAY_MS)return;lastDisplayMs=now;display.clearDisplay();display.setTextColor(SSD1306_WHITE);display.setTextSize(1);display.setCursor(0,0);display.print("HelioBay ");display.println(BAY_ID);display.drawLine(0,10,127,10,SSD1306_WHITE);display.setCursor(0,15);display.print("State: ");display.println(viewText());display.setCursor(0,27);display.print("EV: ");display.print(chargeV,2);display.print("V ");display.print(chargeMa,0);display.println("mA");display.setCursor(0,39);display.print("Power: ");display.print(chargePower());display.println(" W");display.setCursor(0,51);if(!fault.isEmpty())display.print(fault.substring(0,20));else if(WiFi.status()==WL_CONNECTED)display.print(WiFi.localIP());else display.print("Wi-Fi unavailable");display.display();}
}

void setup(){
  Serial.begin(115200);setenv("TZ","UTC0",1);tzset();pinMode(RELAY_PIN,OUTPUT);setRelay(false); // first action: fail-safe OFF
  analogSetAttenuation(ADC_11db);Wire.begin(I2C_SDA_PIN,I2C_SCL_PIN);oledOk=display.begin(SSD1306_SWITCHCAPVCC,OLED_ADDRESS,false,false);inaOk=ina219.begin();prefs.begin("heliobay",false);sequence=prefs.getULong64("seqHigh",0);sequenceLimit=sequence+SEQ_BLOCK;prefs.putULong64("seqHigh",sequenceLimit);stationEnergyMWh=prefs.getULong64("stationEnergy",0);solarEnergyMWh=prefs.getULong64("solarEnergy",0);sessionId=prefs.getString("session","");completedSession=prefs.getString("completed","");energyMWh=prefs.getULong64("energy",0);authorizedEnergyMWh=prefs.getULong64("maxEnergy",0);authorizedDurationSec=prefs.getUInt("maxDuration",0);pendingFinal=prefs.getBool("finalPending",false)||prefs.getBool("active",false);lastCommand=prefs.getString("lastCmd","");lastCommandSession=prefs.getString("lastCmdSess","");lastCommandFailure=prefs.getString("lastFailure","");lastCommandAccepted=prefs.getBool("lastAccepted",false);lastCommandRelay=false;
  char id[24];snprintf(id,sizeof(id),"boot-%08lx%08lx",static_cast<unsigned long>(esp_random()),static_cast<unsigned long>(esp_random()));bootId=id;lastMeasureMs=millis();WiFi.mode(WIFI_STA);WiFi.setAutoReconnect(false);view=View::CONNECTING;
}
void loop(){
  uint32_t now=millis();connections(now);if(mqtt.connected()){int size=mqtt.parseMessage();if(size>0){String body;if(size<=static_cast<int>(MAX_PACKET)){body.reserve(size);while(mqtt.available())body+=static_cast<char>(mqtt.read());processCommand(body);}else{while(mqtt.available())mqtt.read();stopCharging("COMMAND_TOO_LARGE",false);}}}
  measure();integrate(now);safety(now);if(mqtt.connected()&&now-lastTelemetryMs>=telemetryMs){lastTelemetryMs=now;publishTelemetry(false);}if(mqtt.connected()&&now-lastHeartbeatMs>=HEARTBEAT_MS){lastHeartbeatMs=now;publishStatus(true);}if(now-lastPersistMs>=30000){lastPersistMs=now;prefs.putULong64("stationEnergy",stationEnergyMWh);prefs.putULong64("solarEnergy",solarEnergyMWh);if(!sessionId.isEmpty())persistSession();}draw(now);delay(10);
}
