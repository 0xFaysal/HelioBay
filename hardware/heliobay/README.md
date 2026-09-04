# HelioBay ESP32 firmware

This PlatformIO firmware controls one active-low relay for `ST001 / ESP32-ST001 / BAY01`. Charging is command-driven; the old automatic 10-second ON / 4-second OFF cycle is removed.

## Configure and flash

1. Copy `include/secrets.example.h` to `include/secrets.h`.
2. Run `ipconfig` on the Windows laptop and copy the active Wi-Fi adapter's **IPv4 Address** into `MQTT_HOST`. Do not use `localhost`, `127.0.0.1`, or `mosquitto`.
3. Set the generated device MQTT password and per-device HMAC key from local setup.
4. Keep the laptop and ESP32 on the same private Wi-Fi/hotspot. Permit private-network inbound TCP 1883 in Windows Firewall; never port-forward it from the internet.
5. Calibrate the divider, INA219, voltage/current limits, and battery thresholds before energizing hardware.
6. Build and upload:

```powershell
pio run
pio run --target upload
pio device monitor
```

The OLED reports `READY`, `CONNECTING`, `CHARGING`, `STOPPING`, `OFFLINE`, or `FAULT`. The relay is forced OFF at boot and on Wi-Fi/MQTT loss, invalid commands, sensor failure, overcurrent, overvoltage, authorization exhaustion, timeout, unplug inference, or inferred full charge.

INA219 readings and voltage/current full-charge inference are prototype estimates. They do not replace a vehicle BMS, certified meter, contactor feedback, fuse, thermal cutoff, residual-current protection, or emergency isolation.
