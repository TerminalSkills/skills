---
name: a2ui
description: >-
  Lets an AI agent describe a user interface as declarative JSON that a client renders with its own trusted components. Use when a user asks to generate forms, cards or dashboards from an agent, wants an agent to return UI instead of text, asks about the A2UI protocol, createSurface or updateComponents messages, catalogs, data binding, or the Lit, Angular, React and Flutter renderers. Covers the v0.9 message format, validating payloads and the official packages.
license: Apache-2.0
compatibility: "Protocol v0.9 / v0.9.1 (v1.0 is a release candidate, v0.8 is legacy). Python 3.10+ for agent SDK packages, Node.js 18+ with Corepack for the web renderers and demo. The restaurant demo needs a Gemini API key."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "a2ui, generative-ui, agent-protocol, json, renderers"
  repository: https://github.com/a2ui-project/a2ui
---

# A2UI — agent-to-user interface protocol

## Overview

A2UI is an open protocol (Apache 2.0, early public preview) in which an agent sends a JSON description of a UI instead of code or markdown. The client maps each described component to a widget from its own catalog of approved components (Card, Button, TextField, and so on), so the payload is data: safe to accept from a remote agent, yet interactive. The same payload can render in Lit web components, Angular, React or Flutter.

Per the README, the current production release is v0.9.1 within the v0.9 family, the v1.0 specification is a release candidate and v0.8 is legacy. Expect changes: always read the schema in the repository's `specification/` folder for the version in use rather than relying on memory.

The model of operation: the agent streams messages over a transport (A2A, AG-UI or any other); the client builds a surface from them; user actions flow back to the agent as events.

## Instructions

### Message format (v0.9)

Each message is one JSON object with a `version` (`"v0.9"` or `"v0.9.1"` are both accepted by the schema) and exactly one of four keys. Streams are usually written one message per line (JSONL).

- `createSurface`: `surfaceId`, `catalogId`, optional `theme`, optional `sendDataModel` (the client then attaches the surface's data model to every action it sends back). Must come first; creating an existing surface is an error.
- `updateComponents`: `surfaceId` and a flat `components` list. One component must have `id: "root"`.
- `updateDataModel`: `surfaceId`, optional JSON-Pointer `path` (default `/`) and `value`. Omitting `value` removes the key.
- `deleteSurface`: `surfaceId`.

Components are a flat list linked by ID, not a nested tree. Containers name their children: `Card` and `Button` take `child`, `Row`, `Column` and `List` take `children`. Order does not matter, and the agent may send parts incrementally.

Values can be literals or bound to the data model: `"value": {"path": "/booking/name"}` reads and (for inputs) writes `/booking/name`. Validation lives in `checks` with functions such as `required`, `regex`, `length`, `numeric` and `email`.

The basic catalog (id `https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json`) has these components: Text, Image, Icon, Video, AudioPlayer, Row, Column, List, Card, Tabs, Modal, Divider, Button, TextField, CheckBox, ChoicePicker, Slider, DateTimeInput. Its functions: required, regex, length, numeric, email, formatString, formatNumber, formatCurrency, formatDate, pluralize, openUrl, and, or, not. Check property names against `catalog.json`; for example a Button's label is a separate Text component referenced by `child`.

### Actions and the return path

A Button's `action` is either an event to the server or a local function call:

```json
{"action": {"event": {"name": "reserve_table", "context": {"restaurant": "trattoria-verde"}}}}
{"action": {"functionCall": {"call": "openUrl", "args": {"url": "https://a2ui.org"}}}}
```

The client replies with an `action` message: `name`, `surfaceId`, `sourceComponentId`, an ISO `timestamp` and the `context`. If the surface was created with `sendDataModel: true`, the full data model travels in transport metadata (`a2uiClientDataModel`). Clients also advertise supported catalogs in `a2uiClientCapabilities.supportedCatalogIds`, and may report an `error` message when a payload fails validation.

### Validate an agent's output

The repository publishes JSON schemas. Clone it, then validate each line against `server_to_client.json`. The catalog schema is referenced by a relative `catalog.json`, so register it under that address too:

```python
import json
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

SPEC = "a2ui/specification/v0_9_1"
files = [f"{SPEC}/json/{n}.json" for n in ("server_to_client", "common_types")]
files.append(f"{SPEC}/catalogs/basic/catalog.json")
resources = [(json.load(open(f))["$id"], Resource.from_contents(json.load(open(f)))) for f in files]
catalog = json.load(open(f"{SPEC}/catalogs/basic/catalog.json"))
resources.append(("https://a2ui.org/specification/v0_9/catalog.json", Resource.from_contents(catalog)))

validator = Draft202012Validator(json.load(open(f"{SPEC}/json/server_to_client.json")),
                                 registry=Registry().with_resources(resources))
for line in open("booking.jsonl"):
    for error in validator.iter_errors(json.loads(line)):
        print(error.message)
```

Install with `pip install jsonschema` (it needs a version that ships `referencing`). The official Python agent SDK also validates against the active catalog when it parses model output.

### Official packages

From the project README (some are not published yet and are used from source):

- Python: `a2ui-core` (messages, data model, catalog validation) and `a2ui-agent-sdk` (teaches the LLM a catalog and parses its reply into A2UI messages) on PyPI. `a2ui-a2a` and `a2ui-adk` (Google Agent Development Kit) are not published yet.
- TypeScript: `@a2ui/web_core`, `@a2ui/lit`, `@a2ui/angular`, `@a2ui/react`, `@a2ui/markdown-it` on npm. `@a2ui/agent` is not published yet.
- Dart and Flutter: `a2ui_core` and `a2ui_agent` on pub.dev; the Flutter renderer `a2ui_flutter` is not published yet (Flutter also has the GenUI SDK, which uses A2UI).
- Swift: SwiftUI renderer built from the repository's `Package.swift`.

### Run the official demo

The restaurant finder runs a Gemini-backed Python agent and a Lit client. It needs Node.js 18+ with Corepack, uv, and a Gemini API key from Google AI Studio:

```bash
git clone https://github.com/a2ui-project/a2ui.git
cd a2ui
export GEMINI_API_KEY="your key from aistudio.google.com/apikey"
corepack enable
yarn install
cd samples/client/lit
yarn demo:restaurant
```

It opens the client on `http://localhost:5173`. To wire A2UI into another agent framework through AG-UI, the README points to `npx create-ag-ui-app@latest` and a guide in `docs/public/guides/`. The A2UI Composer (a2ui-project.github.io/composer) generates payloads from a visual editor.

## Examples

### Example 1: an agent returns a booking form

Request: "Have the reservation agent answer with a form, not a paragraph."

The agent emits these three messages, one per line (validated against the v0.9.1 schema):

```json
{"version":"v0.9","createSurface":{"surfaceId":"table_booking","catalogId":"https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json","sendDataModel":true}}
{"version":"v0.9","updateComponents":{"surfaceId":"table_booking","components":[{"id":"root","component":"Card","child":"form"},{"id":"form","component":"Column","children":["title","guest_name","party_size","time_slot","submit"]},{"id":"title","component":"Text","text":"Book a table at Trattoria Verde","variant":"h2"},{"id":"guest_name","component":"TextField","label":"Name","value":{"path":"/booking/name"},"variant":"shortText","checks":[{"condition":{"call":"required","args":{"value":{"path":"/booking/name"}}},"message":"Name is required."}]},{"id":"party_size","component":"Slider","label":"Guests","min":1,"max":10,"value":{"path":"/booking/guests"}},{"id":"time_slot","component":"ChoicePicker","label":"Time","variant":"mutuallyExclusive","options":[{"label":"18:30","value":"18:30"},{"label":"19:30","value":"19:30"},{"label":"20:30","value":"20:30"}],"value":{"path":"/booking/time"}},{"id":"submit_label","component":"Text","text":"Reserve"},{"id":"submit","component":"Button","child":"submit_label","variant":"primary","action":{"event":{"name":"reserve_table","context":{"restaurant":"trattoria-verde"}}}}]}}
{"version":"v0.9","updateDataModel":{"surfaceId":"table_booking","path":"/booking","value":{"name":"","guests":2,"time":"19:30"}}}
```

A compliant client shows a card with a name field, a guests slider, three time options and a Reserve button. When the user presses it, the agent receives an `action` named `reserve_table` plus, because of `sendDataModel`, the entered name, guests and time.

### Example 2: update one value, then clear the surface

Request: "The guest picked 4 people; reflect it, and remove the form after confirmation."

```json
{"version":"v0.9","updateDataModel":{"surfaceId":"table_booking","path":"/booking/guests","value":4}}
{"version":"v0.9","deleteSurface":{"surfaceId":"table_booking"}}
```

Only the bound slider changes for the first message; no components are resent. The second removes the surface. Sending `createSurface` again for the same ID without deleting it first would be an error.

## Guidelines

- Pin the protocol version in `version` and `catalogId`, and validate every payload before sending it to a client. LLMs often invent component names or property names; the schema catches that.
- A2UI carries UI structure, not business logic. Keep the real work (booking, payment) on the server and trigger it from an `event` action.
- Only components in the client's catalog can be rendered. For custom widgets, register them in the client's catalog and advertise that catalog by ID; do not try to send code.
- Treat the data the model puts in `text` and `context` as untrusted. Do not render it as raw HTML, and do not execute anything based on it without checks on the server.
- Several packages are marked not yet published and the project is in preview: pin versions and re-read the spec when upgrading.
- Do not choose A2UI for a single known screen in one app; ordinary components are simpler. It pays off when the agent decides the UI at run time or runs across a trust boundary.
