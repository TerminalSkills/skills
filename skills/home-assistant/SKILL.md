---
name: home-assistant
description: >-
  Home Assistant is an open-source home automation server that controls lights,
  sensors, thermostats and other smart devices locally, without a cloud account.
  Use when a user asks to install Home Assistant with Docker, edit
  configuration.yaml, write or debug a YAML automation, check the configuration
  before a restart, call the Home Assistant REST API or WebSocket API with a
  long-lived access token, read sensor history, or run `ha` commands on Home
  Assistant OS.
license: Apache-2.0
compatibility: "Home Assistant 2026.8+ on 64-bit hardware (amd64 or aarch64); Container install needs Docker Engine 23.0+ on Linux; API examples need curl and jq, or Python 3.10+ with requests and websockets"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["home-automation", "smart-home", "iot", "yaml-automations", "rest-api"]
  repository: https://github.com/home-assistant/core
---
# Home Assistant — Local smart home control from the terminal

## Overview

Home Assistant runs on a machine in the home and talks to devices directly, so automations keep working when the internet is down. Everything an agent needs is reachable from a shell: YAML files in the configuration directory, a configuration checker, a REST API, a WebSocket API, and (on Home Assistant OS) the `ha` command.

## Instructions

### Installation

Two installation types are supported. Pick one before doing anything else, because the commands differ.

| Type | What it is | Terminal access |
|---|---|---|
| Home Assistant OS | Appliance image for a Raspberry Pi 4/5, x86-64 box or VM. Includes apps (formerly add-ons), backups and one-click updates. Recommended by the project. | `ha` CLI through the **Terminal & SSH** app |
| Home Assistant Container | One Docker container on a Linux host you manage. No apps, manual updates. | `docker` commands on the host |

The Core (Python virtualenv) and Supervised methods were deprecated in 2025.6 and have been unsupported since 2025.12. Do not create new installs with them.

For Container, write `compose.yaml` on the host:

```yaml
services:
  homeassistant:
    container_name: homeassistant
    image: "ghcr.io/home-assistant/home-assistant:stable"
    volumes:
      - /opt/homeassistant/config:/config
      - /etc/localtime:/etc/localtime:ro
      - /run/dbus:/run/dbus:ro        # only needed for the Bluetooth integration
    restart: unless-stopped
    stop_grace_period: 60s            # lets the database close cleanly
    privileged: true
    network_mode: host
    environment:
      TZ: Europe/Amsterdam
```

```bash
docker compose up -d
docker compose logs --tail 50 homeassistant
# update later
docker compose pull homeassistant && docker compose up -d
```

Docker Desktop is not supported; use Docker Engine. The web UI and API listen on port 8123 for Container. On Home Assistant OS the default port is 80 since 2026.8 (8123 is used when 80 is taken). The user finishes onboarding in the browser.

### Create a long-lived access token

The user creates the token in the web UI: **User profile → Security tab → Long-lived access tokens → Create token**. It is shown once and is valid for 10 years. The user exports it in the shell the agent runs in; the agent only ever refers to `$HASS_TOKEN`.

```bash
export HASS_URL="http://192.168.1.40:8123"
read -rs HASS_TOKEN && export HASS_TOKEN     # typed by the user: paste the token, it is not echoed
curl -s -H "Authorization: Bearer $HASS_TOKEN" "$HASS_URL/api/"
```

A working token returns `{"message":"API running."}`. The trailing slash in `/api/` is required.

### Edit configuration and automations

The configuration directory is `/config` on Home Assistant OS and the mounted host folder (`/opt/homeassistant/config` above) for Container. `automations.yaml` belongs to the UI editor, so keep hand-written automations in a separate labeled block:

```yaml
# configuration.yaml — add below the existing lines
automation: !include automations.yaml              # written by the UI editor
automation manual: !include automations_manual.yaml
```

```yaml
# automations_manual.yaml — always a list
- id: hallway_motion_light
  alias: "Hallway light on motion when dark"
  mode: restart
  triggers:
    - trigger: state
      entity_id: binary_sensor.hallway_motion
      to: "on"
  conditions:
    - condition: sun
      after: sunset
      before: sunrise
  actions:
    - action: light.turn_on
      target:
        entity_id: light.hallway
      data:
        brightness_pct: 60
    - delay: "00:03:00"
    - action: light.turn_off
      target:
        entity_id: light.hallway
```

Current syntax uses the plural keys `triggers`, `conditions`, `actions`, with `trigger:` and `action:` inside each item. Give every YAML automation an `id`, otherwise its traces are not available. Modes are `single` (default), `restart`, `queued` and `parallel`.

Keep passwords and API keys out of the configuration: write `password: !secret meter_password` and define `meter_password` in `secrets.yaml` in the same directory.

### Validate, then reload or restart

Always check the configuration before applying it.

```bash
# Container
docker exec homeassistant python -m homeassistant --script check_config --config /config

# Home Assistant OS (Terminal & SSH app)
ha core check

# Any install, over the API
curl -s -X POST -H "Authorization: Bearer $HASS_TOKEN" "$HASS_URL/api/config/core/check_config"
```

The API answers `{"errors": null, "result": "valid"}` or `"result": "invalid"` with the error text. Apply changes without a restart where possible:

```bash
curl -s -X POST -H "Authorization: Bearer $HASS_TOKEN" "$HASS_URL/api/services/automation/reload"         # automations only
curl -s -X POST -H "Authorization: Bearer $HASS_TOKEN" "$HASS_URL/api/services/homeassistant/reload_all"   # everything reloadable
docker restart homeassistant      # full restart, Container
ha core restart                   # full restart, Home Assistant OS
```

### REST API

All calls send `Authorization: Bearer $HASS_TOKEN`; bodies are JSON.

| Method and path | Purpose |
|---|---|
| `GET /api/states` | Every entity with state and attributes |
| `GET /api/states/light.hallway` | One entity; 404 if unknown |
| `POST /api/services/light/turn_on` | Perform an action (domain, then action name); add `?return_response` for actions that return data |
| `GET /api/history/period/2026-09-29T00:00:00+02:00` | State history from that time; `filter_entity_id` is required, `minimal_response` and `no_attributes` make it faster |
| `POST /api/template` | Render a template, body `{"template": "{{ states('sun.sun') }}"}` |
| `GET /api/error_log` | Errors logged in the current session, plain text |

```bash
# list every light with its state
curl -s -H "Authorization: Bearer $HASS_TOKEN" "$HASS_URL/api/states" \
  | jq -r '.[] | select(.entity_id | startswith("light.")) | "\(.entity_id)\t\(.state)"'

# temperature readings since midnight, without attributes
curl -s -H "Authorization: Bearer $HASS_TOKEN" \
  "$HASS_URL/api/history/period/2026-09-29T00:00:00+02:00?filter_entity_id=sensor.bedroom_temperature&minimal_response&no_attributes" \
  | jq -r '.[0][] | "\(.last_changed)\t\(.state)"'
```

### WebSocket API

Use the WebSocket at `/api/websocket` to receive events as they happen. The server sends `auth_required`, the client answers with the token, and every later message carries an integer `id`.

```python
import asyncio, json, os
import websockets

URL = os.environ["HASS_URL"].replace("http", "ws", 1) + "/api/websocket"

async def main():
    async with websockets.connect(URL) as ws:
        await ws.recv()                                        # auth_required
        await ws.send(json.dumps({"type": "auth", "access_token": os.environ["HASS_TOKEN"]}))
        if json.loads(await ws.recv())["type"] != "auth_ok":
            raise SystemExit("token rejected")
        await ws.send(json.dumps({"id": 1, "type": "subscribe_events", "event_type": "state_changed"}))
        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("type") != "event":
                continue
            data = msg["event"]["data"]
            if data["entity_id"].startswith("binary_sensor.") and data["new_state"]:
                print(data["entity_id"], data["new_state"]["state"])

asyncio.run(main())
```

Other command types: `get_states`, `get_config`, `get_services`, `call_service`, `subscribe_trigger`, `validate_config` (checks trigger, condition and action snippets) and `ping`.

### The `ha` CLI (Home Assistant OS only)

```bash
ha core info                 # version and state
ha core logs                 # recent log output
ha core check                # validate configuration
ha core restart --safe-mode  # start without custom integrations
ha core update --version 2026.9.4
ha backups new --name before-automation-changes
```

## Examples

### Example 1: Control a light and read a sensor

**User request:** "Dim the living room lamp to 40% and tell me how warm the bedroom is."

```bash
curl -s -X POST -H "Authorization: Bearer $HASS_TOKEN" -H "Content-Type: application/json" \
  -d '{"entity_id": "light.living_room_lamp", "brightness_pct": 40}' \
  "$HASS_URL/api/services/light/turn_on" | jq -r '.[] | "\(.entity_id) \(.state)"'

curl -s -H "Authorization: Bearer $HASS_TOKEN" "$HASS_URL/api/states/sensor.bedroom_temperature" \
  | jq '{state, unit: .attributes.unit_of_measurement, last_changed}'
```

**Result:**

```text
light.living_room_lamp on
{
  "state": "21.4",
  "unit": "°C",
  "last_changed": "2026-09-29T19:42:11.302817+00:00"
}
```

The action call returns the entities whose state changed while it ran; an empty list means nothing changed, for example because the lamp was already at 40%.

### Example 2: Add a freezer alert and apply it safely

**User request:** "Warn me on my phone when the garage freezer stays above -10 °C for ten minutes."

Append to `/opt/homeassistant/config/automations_manual.yaml`:

```yaml
- id: garage_freezer_too_warm
  alias: "Garage freezer too warm"
  triggers:
    - trigger: numeric_state
      entity_id: sensor.garage_freezer_temperature
      above: -10
      for: "00:10:00"
  actions:
    - action: notify.send_message
      target:
        entity_id: notify.annas_phone
      data:
        title: "Freezer alert"
        message: "Garage freezer is at {{ states('sensor.garage_freezer_temperature') }} °C"
```

```bash
docker exec homeassistant python -m homeassistant --script check_config --config /config
curl -s -X POST -H "Authorization: Bearer $HASS_TOKEN" "$HASS_URL/api/services/automation/reload"
curl -s -H "Authorization: Bearer $HASS_TOKEN" \
  "$HASS_URL/api/states/automation.garage_freezer_too_warm" | jq '{state, last_triggered: .attributes.last_triggered}'
```

**Result:** the checker exits without listing errors, and the new entity reports `{"state": "on", "last_triggered": null}`. Find the right notify entity first with `jq` on `/api/states` filtered by `notify.`.

## Guidelines

- **Check before every restart.** A broken `configuration.yaml` can keep Home Assistant from loading integrations. `homeassistant.restart` cancels itself when the check fails; `docker restart` does not check anything.
- **Use actions to control devices.** A `POST` to `/api/states/light.hallway` only changes what Home Assistant displays. It never reaches the device; use `POST /api/services/...`.
- **Do not hand-edit `automations.yaml`** while the UI editor is in use. `!secret` inside that file makes every automation uneditable in the UI.
- **Numeric triggers fire on crossing.** `numeric_state` runs when the value crosses the threshold, not while it stays beyond it, and a `for:` timer resets on restart or automation reload.
- **Do not add an `http:` block.** Since 2026.8 the port, TLS and reverse-proxy settings are managed under Settings → System → Network; an old `http:` block is imported once and raises a repair issue.
- **Treat the token as a password.** It grants the full rights of the user that created it. Read it from `$HASS_TOKEN`, never write it into YAML, scripts or a repository, and delete unused tokens on the Security tab.
- **Webhooks are unauthenticated.** Anyone who knows a webhook ID can trigger it. Keep `local_only: true` and never attach locks, garage doors or alarm panels to a webhook.
- **The container is privileged.** The official Compose file uses `privileged: true` and host networking. Run it on a host you trust with that level of access.
- **Do not expose port 8123 or 80 to the internet directly.** Put a VPN or a reverse proxy with TLS in front, and add the proxy under trusted proxies.
- **Never run `ha os datadisk wipe`.** It erases all user data. Create a backup with `ha backups new` before updates or large configuration changes.
- **When not to use it.** Prefer Home Assistant OS over Container when Thread or Z-Wave is needed: both are driven by apps, and Container has no out-of-the-box support for them. Do not rely on Home Assistant alone for safety-critical control such as smoke alarms or heating cut-offs, which must keep working when the server is down.
