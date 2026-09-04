# HelioBay লোকাল সেটআপ (Windows 10)

এই সেটআপে ব্রাউজার `Caddy → Next.js/Backend`, Backend `→ PostgreSQL`, এবং Backend `↔ Mosquitto ↔ ESP32` পথে যোগাযোগ করে। ব্রাউজার কখনো PostgreSQL বা MQTT-তে সরাসরি privileged command পাঠায় না।

## যা লাগবে

- Windows 10, Docker Desktop (Linux containers এবং Docker Compose v2)
- ESP32 build/flash-এর জন্য VS Code + PlatformIO
- অন্তত 8 GB RAM; Docker Desktop-কে প্রায় 4 GB RAM দেওয়া ভালো
- Laptop ও ESP32 একই Private Wi-Fi router বা mobile hotspot-এ
- প্রথম image/library download, map tiles, এবং ESP32 NTP sync-এর জন্য internet; image তৈরি হয়ে গেলে মূল লোকাল app, database, auth, MQTT ও simulator internet ছাড়াও চলে

## প্রথমবার সেটআপ

PowerShell-এ repository root থেকে:

```powershell
.\scripts\setup-local.ps1
```

এটি `.env`-এ random local password/key তৈরি করে এবং firmware-এর ignored `hardware\heliobay\include\secrets.h` বানায়। `.env` বা `secrets.h` Git-এ commit করবেন না। Account password দেখতে নিজের laptop-এ `.env` খুলুন:

- Admin email: `admin@heliobay.local`
- EV owner email: `user@heliobay.local`
- Password: `.env`-এর `LOCAL_ADMIN_PASSWORD` ও `LOCAL_USER_PASSWORD`

## চালু ও বন্ধ

Physical ESP32 ব্যবহার করলে:

```powershell
.\scripts\start-local.ps1
```

ESP32 ছাড়া simulator দিয়ে test করলে:

```powershell
.\scripts\start-local.ps1 -Simulator
```

তারপর:

- App: `http://localhost:8080`
- একই LAN-এর অন্য device: `http://<LAPTOP_LAN_IP>:8080`
- Firebase Emulator UI (শুধু laptop): `http://localhost:4400`

Status/log/stop:

```powershell
.\scripts\status-local.ps1
.\scripts\logs-local.ps1
.\scripts\logs-local.ps1 backend
.\scripts\stop-local.ps1
```

Raw Docker command-ও কাজ করে:

```powershell
docker compose up --build -d
docker compose ps
docker compose logs -f
docker compose down
```

Simulator-এর raw command:

```powershell
$env:DEVICE_MODE='simulator'
docker compose --profile simulator up --build -d
```

`docker compose down -v` স্বাভাবিক stop command নয়—এটি PostgreSQL, Firebase ও broker-এর persisted local data মুছে দেয়।

## Laptop IPv4 ও ESP32

```powershell
.\scripts\show-lan-ip.ps1
# অথবা
ipconfig
```

Active Wi-Fi adapter-এর `IPv4 Address` নিন। `hardware\heliobay\include\secrets.h`-এ Wi-Fi SSID/password এবং সেই address বসান:

```cpp
#define MQTT_HOST "192.168.x.x"
#define MQTT_PORT 1883
```

ESP32-তে `localhost`, `127.0.0.1`, `mosquitto`, বা অনুমান করা IP দেবেন না। `mosquitto` কেবল Docker container-এর ভেতরের service name; ESP32-কে laptop-এর LAN IPv4 ব্যবহার করতে হবে। তারপর:

```powershell
cd hardware\heliobay
pio run
pio run --target upload
pio device monitor
```

Firmware boot, Wi-Fi/MQTT loss, invalid command বা safety fault-এ active-low relay OFF রাখে। Physical test-এর আগে relay polarity, contactor rating, INA219 calibration, divider ratio, voltage/current thresholds, fuse, thermal protection এবং emergency isolation bench-test করুন। Battery percentage/full detection BMS ছাড়া estimate মাত্র।

## Windows Firewall (Private network only)

Administrator PowerShell-এ প্রয়োজন হলে:

```powershell
New-NetFirewallRule -DisplayName 'HelioBay HTTP 8080' -Direction Inbound -Protocol TCP -LocalPort 8080 -Profile Private -Action Allow
New-NetFirewallRule -DisplayName 'HelioBay MQTT 1883' -Direction Inbound -Protocol TCP -LocalPort 1883 -Profile Private -Action Allow
New-NetFirewallRule -DisplayName 'HelioBay Firebase Auth 9099' -Direction Inbound -Protocol TCP -LocalPort 9099 -Profile Private -Action Allow
```

Public profile-এ rule খুলবেন না এবং router থেকে 1883/8080/9099 internet-এ port-forward করবেন না। Plain HTTP LAN address-এ browser geolocation block হতে পারে; `localhost` বা HTTPS-এ এটি সবচেয়ে নির্ভরযোগ্য। Map tile না এলে station list fallback ব্যবহার করুন।

## ESP32 ছাড়া test

1. `start-local.ps1 -Simulator` চালান।
2. Owner account দিয়ে sign in করুন।
3. `LOCAL SANDBOX` top-up-এ success/failure/cancel পরীক্ষা করুন—এটি real payment নয়।
4. Station-এর BAY01 plugged/online হওয়ার পর charging start করুন। ACK না আসা পর্যন্ত UI charging দাবি করবে না।
5. Live voltage/current/power/energy, credit deduction, stop এবং receipt দেখুন।
6. Admin account দিয়ে sessions, devices, telemetry, faults, payments ও Digital Twin grid energy দেখুন।
7. Scenario বদলাতে `.env`-এ `SIMULATOR_SCENARIO=unplug`, `battery-full`, `credit-exhausted`, `timeout`, `sensor-fault`, বা `emergency-stop` দিয়ে simulator recreate করুন।

## Physical ESP32 smoke test

1. Simulator বন্ধ করুন; `start-local.ps1` দিয়ে hardware mode seed করুন।
2. Power দেওয়ার সঙ্গে relay OFF এবং OLED `CONNECTING` নিশ্চিত করুন।
3. Serial log, OLED `READY`, admin device online এবং heartbeat দেখুন।
4. Charger output নিরাপদ dummy load-এ রেখে plug detection যাচাই করুন।
5. Owner start → MQTT command → relay ON → ACK → UI `CHARGING` ক্রম যাচাই করুন।
6. Telemetry ও energy meter reference instrument-এর সঙ্গে মিলিয়ে calibrate করুন।
7. User stop, Wi-Fi loss, broker stop, unplug, overcurrent/overvoltage test input, max duration/energy—প্রতিটিতে relay দ্রুত OFF হয় নিশ্চিত করুন।
8. Final telemetry, wallet settlement, released hold এবং receipt যাচাই করুন।

## Backup ও restore

Database SQL backup (চলমান stack):

```powershell
docker compose exec -T postgres pg_dump -U heliobay -d heliobay -Fc -f /tmp/heliobay.dump
docker compose cp postgres:/tmp/heliobay.dump .\heliobay-backup.dump
```

Restore করার আগে বর্তমান database-এর আলাদা backup নিন। Volume-level backup-এর জন্য Docker Desktop volume export ব্যবহার করতে পারেন। `.env` আলাদাভাবে encrypted password manager-এ রাখুন।

## সাধারণ সমস্যা

- `Docker daemon`/pipe error: Docker Desktop চালু করুন, Linux containers ready হওয়া পর্যন্ত অপেক্ষা করুন, তারপর retry করুন।
- Port busy: `Get-NetTCPConnection -State Listen` দিয়ে 8080/1883/9099/4400 দেখুন; conflicting app বন্ধ করুন।
- Login ব্যর্থ: `firebase-emulator` ও `local-seed` logs দেখুন; পুরোনো `.env` বদলালে emulator volume-এর account passwordও পুরোনো থাকতে পারে। Data reset সত্যিই চাইলে backup নিয়ে তারপর `down -v` করুন।
- ESP32 offline: একই hotspot, সঠিক laptop IPv4, Private firewall rule, MQTT username/password/HMAC key এবং `DEVICE_MODE=hardware` যাচাই করুন।
- Start rejected: bay plugged, device online, INA219 valid, wallet available এবং কোনো active session নেই নিশ্চিত করুন।
- Map নেই: station list ব্যবহার করুন; online tiles-এর internet লাগতে পারে।

## Competition-day checklist

1. Laptop charger লাগান; sleep/automatic restart বন্ধ করুন।
2. Private hotspot চালু করে IPv4 বদলেছে কি না দেখুন; বদলালে firmware config/flash ঠিক করুন।
3. Docker Desktop ready, তারপর `start-local.ps1` চালান।
4. `status-local.ps1` এবং logs-এ সব health check দেখুন।
5. Admin/owner login, LOCAL SANDBOX top-up, one start/stop/receipt dry run করুন।
6. Relay OFF অবস্থায় booth খুলুন; spare USB cable, fuse ও manual isolation প্রস্তুত রাখুন।

জরুরি অবস্থায় physical emergency isolator/charger supply বন্ধ করুন—software button-এর জন্য অপেক্ষা করবেন না। তারপর ESP32 power খুলুন (normally-open contactor OFF), `docker compose stop controller-simulator backend mosquitto` চালান, এবং fault cause পরীক্ষা না করে আবার energize করবেন না।
