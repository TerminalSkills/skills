---
title: Build an IoT Monitoring System with MQTT and Raspberry Pi
slug: build-iot-monitoring-system-with-mqtt
description: Build a sensor network that monitors temperature, humidity, and air quality across a building — with ESP32 sensors publishing to MQTT, a Raspberry Pi hub aggregating data, and a real-time dashboard with alerts.
skills:
  - mqtt
  - raspberry-pi
  - arduino
  - home-assistant
category: IoT
tags:
  - iot
  - mqtt
  - sensors
  - monitoring
  - embedded
---

# Build an IoT Monitoring System with MQTT and Raspberry Pi

Omar manages a wine storage facility with 6 climate-controlled rooms. Temperature excursions ruin inventory worth thousands — but he only discovers problems when doing manual checks. He wants real-time monitoring: sensors in every room reporting temperature, humidity, and air quality, with instant alerts if conditions drift outside safe ranges. The system must work without cloud services (the facility has unreliable internet) and cost under $200 for all hardware.

## Step 1 — Flash ESP32 Sensors with ESPHome

ESPHome generates firmware from YAML configuration. Each ESP32 board reads from a BME280 (temperature + humidity + pressure) and an SGP30 (air quality), then publishes readings via MQTT every 30 seconds.

```yaml
# esphome/wine-room-1.yaml — Sensor node configuration.
# ESPHome compiles this YAML into C++ firmware for the ESP32.
# OTA updates: change config → compile → push over WiFi.

esphome:
  name: wine-room-1
  friendly_name: "Wine Room 1"

esp32:
  board: esp32dev

wifi:
  ssid: "WineCellar-IoT"
  password: "SecurePassword123"

  # Fall back to AP mode if WiFi fails — lets you reconfigure
  ap:
    ssid: "wine-room-1-fallback"
    password: "fallback123"

# MQTT instead of Home Assistant API — works with any MQTT consumer
mqtt:
  broker: 192.168.1.100        # Raspberry Pi running Mosquitto
  port: 1883
  username: "sensor"
  password: "mqtt-sensor-pass"
  topic_prefix: "cellar/room1"

  # Last Will: broker publishes this if the sensor disconnects
  birth_message:
    topic: "cellar/room1/status"
    payload: "online"
    retain: true
  will_message:
    topic: "cellar/room1/status"
    payload: "offline"
    retain: true

# I2C bus for sensors (BME280 + SGP30 share the bus)
i2c:
  sda: GPIO21
  scl: GPIO22
  scan: true

sensor:
  # BME280: temperature, humidity, pressure
  - platform: bme280_i2c
    temperature:
      name: "Temperature"
      oversampling: 16x
      filters:
        - sliding_window_moving_average:
            window_size: 5             # Smooth out noise
            send_every: 1
    humidity:
      name: "Humidity"
      oversampling: 16x
    pressure:
      name: "Pressure"
    address: 0x76
    update_interval: 30s               # Read every 30 seconds

  # SGP30: air quality (eCO2 and TVOC)
  - platform: sgp30
    eco2:
      name: "eCO2"
      accuracy_decimals: 0
    tvoc:
      name: "TVOC"
      accuracy_decimals: 0
    update_interval: 30s

  # Internal: WiFi signal strength and uptime for diagnostics
  - platform: wifi_signal
    name: "WiFi Signal"
    update_interval: 60s

  - platform: uptime
    name: "Uptime"

# Status LED: blink on publish, solid when connected
status_led:
  pin: GPIO2

# Deep sleep between readings to save power (optional, for battery)
# deep_sleep:
#   run_duration: 10s
#   sleep_duration: 5min
```

## Step 2 — Set Up the Raspberry Pi Hub

The Raspberry Pi runs Mosquitto (MQTT broker), receives sensor data, stores it in InfluxDB for historical trends, and runs Home Assistant for the dashboard and alerts.

```yaml
# docker-compose.yml — Raspberry Pi service stack.
# Runs on a Pi 4 with 4GB RAM. All data stays local — no cloud.

services:
  mosquitto:
    image: eclipse-mosquitto:2
    ports:
      - "1883:1883"
    volumes:
      - ./mosquitto/config:/mosquitto/config:ro
      - mosquitto-data:/mosquitto/data
      - mosquitto-log:/mosquitto/log
    restart: unless-stopped

  influxdb:
    image: influxdb:2.7
    ports:
      - "8086:8086"
    volumes:
      - influxdb-data:/var/lib/influxdb2
    environment:
      DOCKER_INFLUXDB_INIT_MODE: setup
      DOCKER_INFLUXDB_INIT_USERNAME: admin
      DOCKER_INFLUXDB_INIT_PASSWORD: influx-password
      DOCKER_INFLUXDB_INIT_ORG: winecellar
      DOCKER_INFLUXDB_INIT_BUCKET: sensors
      DOCKER_INFLUXDB_INIT_RETENTION: 365d    # Keep 1 year of data
    restart: unless-stopped

  telegraf:
    image: telegraf:1.29
    volumes:
      - ./telegraf/telegraf.conf:/etc/telegraf/telegraf.conf:ro
    depends_on:
      - mosquitto
      - influxdb
    restart: unless-stopped

  grafana:
    image: grafana/grafana:10
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
    environment:
      GF_SECURITY_ADMIN_PASSWORD: grafana-password
    restart: unless-stopped

  homeassistant:
    image: ghcr.io/home-assistant/home-assistant:stable
    ports:
      - "8123:8123"
    volumes:
      - ./homeassistant:/config
    privileged: true
    restart: unless-stopped

volumes:
  mosquitto-data:
  mosquitto-log:
  influxdb-data:
  grafana-data:
```

```conf
# mosquitto/config/mosquitto.conf — MQTT broker configuration.
# Requires authentication. Logs to file for debugging.

persistence true
persistence_location /mosquitto/data/

log_dest file /mosquitto/log/mosquitto.log
log_type all

listener 1883
allow_anonymous false
password_file /mosquitto/config/passwords

# ACL: sensors can only publish to their own topics
acl_file /mosquitto/config/acl
```

```toml
# telegraf/telegraf.conf — Bridge between MQTT and InfluxDB.
# Subscribes to all sensor topics, writes to InfluxDB.
# Telegraf handles the parsing and batching.

[agent]
  interval = "10s"
  flush_interval = "10s"

# Input: subscribe to all cellar MQTT topics
[[inputs.mqtt_consumer]]
  servers = ["tcp://mosquitto:1883"]
  topics = ["cellar/+/sensor/+/state"]
  username = "telegraf"
  password = "mqtt-telegraf-pass"
  data_format = "value"
  data_type = "float"

  # Parse topic structure into tags
  # cellar/room1/sensor/temperature/state → room=room1, measurement=temperature
  [inputs.mqtt_consumer.topic_parsing]
    topic = "cellar/+/sensor/+/state"
    tags = "_/room/_/measurement/_"

# Output: write to InfluxDB
[[outputs.influxdb_v2]]
  urls = ["http://influxdb:8086"]
  token = "influx-token"
  organization = "winecellar"
  bucket = "sensors"
```

## Step 3 — Configure Alerts in Home Assistant

```yaml
# homeassistant/automations.yaml — Temperature alert automations.
# Sends push notifications and triggers the alarm if temperature
# goes outside the safe range for wine storage (12-18°C).

- id: wine_temp_high_alert
  alias: "Wine Temperature Too High"
  trigger:
    - platform: numeric_state
      entity_id:
        - sensor.wine_room_1_temperature
        - sensor.wine_room_2_temperature
        - sensor.wine_room_3_temperature
        - sensor.wine_room_4_temperature
        - sensor.wine_room_5_temperature
        - sensor.wine_room_6_temperature
      above: 18                        # Maximum safe temperature for wine
      for:
        minutes: 5                     # Ignore brief spikes (door opening)
  condition:
    - condition: template
      # Only alert if it's a real problem (not just a brief door opening)
      value_template: >
        {{ trigger.to_state.state | float > 20 or
           (trigger.to_state.state | float > 18 and
            as_timestamp(now()) - as_timestamp(trigger.to_state.last_changed) > 600) }}
  action:
    - service: notify.mobile_app_omar
      data:
        title: "⚠️ Temperature Alert"
        message: >
          {{ trigger.to_state.attributes.friendly_name }}:
          {{ trigger.to_state.state }}°C (safe range: 12-18°C).
          Duration: {{ relative_time(trigger.to_state.last_changed) }}.
        data:
          priority: high
          channel: critical             # Bypass Do Not Disturb on Android
          push:
            sound:
              name: default
              critical: 1               # Critical alert on iOS

    # Log the event for compliance records
    - service: logbook.log
      data:
        name: "Temperature Alert"
        message: >
          {{ trigger.to_state.attributes.friendly_name }} reached
          {{ trigger.to_state.state }}°C

- id: sensor_offline_alert
  alias: "Sensor Offline Alert"
  trigger:
    - platform: mqtt
      topic: "cellar/+/status"
      payload: "offline"
  action:
    - service: notify.mobile_app_omar
      data:
        title: "🔴 Sensor Offline"
        message: >
          A sensor has gone offline: {{ trigger.topic }}.
          Check WiFi and power supply.
```

## Results

Omar deployed the system across 6 rooms in a weekend. After three months:

- **Total hardware cost: $156** — 6× ESP32 boards ($5 each), 6× BME280 sensors ($3 each), 6× SGP30 air quality sensors ($8 each), 1× Raspberry Pi 4 4GB ($55), miscellaneous (cables, enclosures, SD card) $5. Under his $200 budget.
- **Temperature excursion caught in 7 minutes** — Room 4's cooling unit failed at 2 AM on a Saturday. The alert woke Omar, who turned on backup cooling remotely via Home Assistant. Without monitoring, the wine (worth $12,000) would have been damaged by Monday morning.
- **100% local operation** — the entire system works without internet. During a 3-day internet outage, sensors continued reporting, data was stored in InfluxDB, and alerts fired over the local network. No cloud dependency.
- **Historical data for insurance** — InfluxDB stores 365 days of temperature/humidity readings at 30-second intervals. Omar's insurance company requires proof of climate control compliance — Grafana exports meet their requirements.
- **Sensor reliability: 99.8% uptime** — ESP32 nodes with LWT detect the 0.2% downtime (WiFi glitches, power blips). Average recovery time: 45 seconds (ESP32 auto-reconnects).
- **Air quality monitoring caught a refrigerant leak** — the SGP30 sensor in Room 2 detected elevated TVOC levels. Maintenance found and fixed a coolant micro-leak before it became a major repair.
