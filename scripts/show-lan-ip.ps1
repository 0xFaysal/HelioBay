$addresses = Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notmatch 'vEthernet|Loopback|Docker' }
if (-not $addresses) { Write-Host 'No active DHCP IPv4 found. Run ipconfig and inspect the active Wi-Fi adapter.'; exit 1 }
$addresses | Select-Object InterfaceAlias,IPAddress | Format-Table -AutoSize
Write-Host 'Use the active Wi-Fi/hotspot IPv4 as MQTT_HOST; never use localhost on the ESP32.'
