---
title: Automate Smart Home Devices with Home Assistant
slug: automate-smart-home-devices-with-home-assistant
description: Put lights, plugs and sensors from different brands under one local server with tested automations, for homeowners and small practices.
skills:
  - home-assistant
  - docker-helper
category: automation
tags:
  - home-automation
  - smart-home
  - local-control
  - yaml-automations
  - docker
---

## The Problem

Ingrid Solberg runs a two-room physiotherapy practice on the ground floor of her house. Over three years she collected 11 smart bulbs, 3 smart plugs and 4 temperature sensors from three brands, each with its own phone app and cloud account. Nothing talks to anything else. The waiting-room lights and the infrared heater stay on overnight about three times a week, and in July the cold-pack freezer failed on a Friday evening. Nobody noticed until Monday, and 40 gel packs went in the bin.

She does not want a fourth subscription. She has an unused mini PC running Ubuntu Server in the storage room and wants everything controlled from there, with rules she can read and change.

## The Solution

Use the **home-assistant** skill to run Home Assistant on the mini PC, write the automations as YAML, check them before they go live and query the API. Use the **docker-helper** skill to write and review the Compose file for the container.

## Step-by-Step Walkthrough

### 1. Deploy the container

```text
Set up Home Assistant on my mini PC at 192.168.1.40. Docker Engine is installed. Keep the configuration in /opt/homeassistant/config and use the Europe/Oslo timezone.
```

The agent writes `/opt/homeassistant/compose.yaml` and starts it:

```yaml
services:
  homeassistant:
    container_name: homeassistant
    image: "ghcr.io/home-assistant/home-assistant:stable"
    volumes:
      - /opt/homeassistant/config:/config
      - /etc/localtime:/etc/localtime:ro
    restart: unless-stopped
    stop_grace_period: 60s
    privileged: true
    network_mode: host
    environment:
      TZ: Europe/Oslo
```

```bash
cd /opt/homeassistant && docker compose up -d
docker compose logs --tail 20 homeassistant
```

Ingrid opens `http://192.168.1.40:8123`, creates her account and adds the three device integrations in the browser.

### 2. Create a token and check the API

```text
I created a long-lived access token on the Security tab of my profile. Check that you can reach the API and list what Home Assistant found.
```

```bash
export HASS_URL="http://192.168.1.40:8123"
read -rs HASS_TOKEN && export HASS_TOKEN     # typed by Ingrid: paste the token, it is not echoed
curl -s -H "Authorization: Bearer $HASS_TOKEN" "$HASS_URL/api/"
curl -s -H "Authorization: Bearer $HASS_TOKEN" "$HASS_URL/api/states" \
  | jq -r '.[].entity_id' | grep -E '^(light|switch|sensor|notify)\.' | sort
```

The first call prints `{"message":"API running."}`. The second lists 11 `light.` entities, 3 `switch.` entities, the temperature sensors and `notify.ingrids_phone`.

### 3. Write the automations

```text
Turn off the waiting room lights and the heater plug at 19:30 on weekdays. Also alert my phone if the cold-pack freezer stays above -12 °C for 15 minutes.
```

The agent adds one line to `configuration.yaml` and creates the file it points to:

```yaml
automation manual: !include automations_manual.yaml
```

```yaml
- id: practice_closing_time
  alias: "Practice closing time"
  triggers:
    - trigger: time
      at: "19:30:00"
      weekday: [mon, tue, wed, thu, fri]
  actions:
    - action: light.turn_off
      target:
        entity_id:
          - light.waiting_room_ceiling
          - light.waiting_room_corner
    - action: switch.turn_off
      target:
        entity_id: switch.treatment_room_heater

- id: cold_pack_freezer_too_warm
  alias: "Cold pack freezer too warm"
  triggers:
    - trigger: numeric_state
      entity_id: sensor.cold_pack_freezer_temperature
      above: -12
      for: "00:15:00"
  actions:
    - action: notify.send_message
      target:
        entity_id: notify.ingrids_phone
      data:
        title: "Freezer alert"
        message: "Cold-pack freezer is at {{ states('sensor.cold_pack_freezer_temperature') }} °C"
```

### 4. Validate and reload

```text
Check the configuration and load the new automations without restarting.
```

```bash
docker exec homeassistant python -m homeassistant --script check_config --config /config
curl -s -X POST -H "Authorization: Bearer $HASS_TOKEN" "$HASS_URL/api/config/core/check_config"
curl -s -X POST -H "Authorization: Bearer $HASS_TOKEN" "$HASS_URL/api/services/automation/reload"
curl -s -H "Authorization: Bearer $HASS_TOKEN" "$HASS_URL/api/states" \
  | jq -r '.[] | select(.entity_id | startswith("automation.")) | "\(.entity_id)\t\(.state)"'
```

The API check returns `{"errors": null, "result": "valid"}` and both automations show up with state `on`.

### 5. Report the freezer temperature for the week

```text
Every Monday I want the lowest and highest freezer temperature of the last 7 days.
```

```python
import os, requests
from datetime import datetime, timedelta, timezone

end = datetime.now(timezone.utc).replace(microsecond=0)
start = end - timedelta(days=7)
resp = requests.get(
    f"{os.environ['HASS_URL']}/api/history/period/{start.isoformat()}",
    headers={"Authorization": f"Bearer {os.environ['HASS_TOKEN']}"},
    params={
        "filter_entity_id": "sensor.cold_pack_freezer_temperature",
        "end_time": end.isoformat(),
        "minimal_response": "",
        "no_attributes": "",
    },
    timeout=30,
)
resp.raise_for_status()
values = [float(s["state"]) for s in resp.json()[0] if s["state"] not in ("unknown", "unavailable")]
print(f"{len(values)} readings, min {min(values):.1f} °C, max {max(values):.1f} °C")
```

```text
2016 readings, min -19.8 °C, max -16.9 °C
```

## Real-World Example

Ingrid gives the agent the mini PC on a Saturday morning. The container is running 10 minutes later, and she spends another 25 minutes in the browser adding her three device integrations. The agent finds 18 devices through the API, writes the two automations, and the configuration check passes on the second attempt. The first attempt failed because an entity ID in her notes was misspelled.

1. At 19:30 on Monday the waiting-room lights and the heater plug switch off on their own. Over the next four weeks they are never left on overnight, compared with roughly 12 nights in the month before.
2. In week three the freezer door is left ajar after the last patient. The sensor crosses -12 °C at 18:52, the alert reaches her phone at 19:07, and she closes the door before anything thaws.
3. The Monday report shows the freezer holding between -19.8 °C and -16.9 °C, which she keeps as a record for her equipment log.

All rules live in one short YAML file on her own hardware, and no device data leaves the building.

## Related Skills

- [home-assistant](/skills/home-assistant) — runs the server, validates the YAML automations and calls the REST API
- [docker-helper](/skills/docker-helper) — writes and reviews the Compose file that runs the Home Assistant container
