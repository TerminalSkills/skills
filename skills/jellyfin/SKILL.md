---
name: jellyfin
description: >-
  Jellyfin is a free, open-source media server that streams a personal library of movies, shows, music and books to browsers, TVs and phones, with a REST API for automation. Use this skill to deploy Jellyfin with Docker Compose, finish the startup wizard through the API, create API keys, add libraries, trigger scans and list or search items from scripts. Triggers: "self-host a media server", "Plex alternative", "jellyfin docker compose", "jellyfin API key", "scan jellyfin library", "stream my movie collection at home".
license: Apache-2.0
compatibility: "Linux host with Docker Engine 24+ and the Compose plugin; curl and jq for API calls; ffmpeg only if you want to make test clips"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "jellyfin, media-server, self-hosted, docker-compose, rest-api"
  repository: https://github.com/jellyfin/jellyfin
---

# Jellyfin — self-hosted media server for your own movies, shows and music

## Overview

Jellyfin serves a folder of media files as a browsable, streamable library. It fetches posters and metadata, remembers watch progress per user, transcodes with ffmpeg when a device cannot play a file directly, and exposes everything over a REST API. The server and its web client are one container.

What an agent does well here: deploy the container, complete the first-run wizard over HTTP, create an API key, add libraries that point at mounted folders, trigger scans, and query items. What stays with a human: signing in with TVs and phones, choosing hardware acceleration for a specific GPU, and curating metadata in the web UI.

Everything below was run against `jellyfin/jellyfin:12.4` (release 12.4) on a throwaway Docker container bound to 127.0.0.1. Pin the tag you deploy: `latest` follows major version bumps.

## Instructions

### Deploy with Docker Compose

Image tags: `latest` (newest stable), `12` (major), `12.4` (minor), and a build tag such as `12.4.20261026-211555` (there is no `12.4.0` tag). The image is also on `ghcr.io/jellyfin/jellyfin`.

```yaml
# docker-compose.yml
services:
  jellyfin:
    image: jellyfin/jellyfin:12.4
    container_name: jellyfin
    restart: unless-stopped
    ports:
      - "127.0.0.1:8096:8096/tcp"
    volumes:
      - ./config:/config
      - ./cache:/cache
      - type: bind
        source: /srv/media
        target: /media
        read_only: true
```

```bash
mkdir -p config cache
docker compose up -d
curl -s http://127.0.0.1:8096/System/Info/Public
curl -s http://127.0.0.1:8096/health
```

Before setup, `System/Info/Public` returns `"StartupWizardCompleted": false`. `/health` returns the text `Healthy`. Config (database, users, API keys) lives in `/config`; back it up. The media mount can be read-only because Jellyfin only reads media files. To expose it to other devices, put a reverse proxy in front instead of publishing the port on all interfaces. The Compose example in the official docs also maps `7359/udp` for client auto-discovery; leave it out if you do not need that.

Name folders the way the metadata scanner expects: `Movies/Title (Year)/Title (Year).mp4`, `Shows/Series Name/Season 01/...`. Wrong names produce wrong matches.

### Complete the startup wizard through the API

These endpoints need no authentication while the wizard is open. All return 204 on success.

```bash
BASE=http://127.0.0.1:8096
JSON='Content-Type: application/json'

curl -s -X POST $BASE/Startup/Configuration -H "$JSON" \
  -d '{"UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}'
curl -s $BASE/Startup/User            # touch it first; returns the placeholder user
curl -s -X POST $BASE/Startup/User -H "$JSON" \
  -d "{\"Name\":\"admin\",\"Password\":\"$JELLYFIN_ADMIN_PASSWORD\"}"
curl -s -X POST $BASE/Startup/RemoteAccess -H "$JSON" \
  -d '{"EnableRemoteAccess":false,"EnableAutomaticPortMapping":false}'
curl -s -X POST $BASE/Startup/Complete
```

`JELLYFIN_ADMIN_PASSWORD` is a password you choose and keep in your secret store. After `Startup/Complete`, `System/Info/Public` reports `StartupWizardCompleted: true` and the `Startup/*` endpoints are closed.

### Authenticate and create an API key

Every request after setup carries an `Authorization` header in the `MediaBrowser` scheme. Log in once as the admin to get a user token, then mint a named API key for scripts.

```bash
AUTH='MediaBrowser Client="media-agent", Device="ops-box", DeviceId="ops-box-01", Version="1.0"'
TOKEN=$(curl -s -X POST $BASE/Users/AuthenticateByName -H "$JSON" -H "Authorization: $AUTH" \
  -d "{\"Username\":\"admin\",\"Pw\":\"$JELLYFIN_ADMIN_PASSWORD\"}" | jq -r .AccessToken)

curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/Auth/Keys?app=media-agent" \
  -H "Authorization: MediaBrowser Token=\"$TOKEN\""
export JELLYFIN_API_KEY=$(curl -s $BASE/Auth/Keys \
  -H "Authorization: MediaBrowser Token=\"$TOKEN\"" | jq -r '.Items[] | select(.AppName=="media-agent") | .AccessToken')
```

Use the key like this on every call:

```bash
KEYAUTH="Authorization: MediaBrowser Token=\"$JELLYFIN_API_KEY\""
curl -s -H "$KEYAUTH" $BASE/Users | jq '.[].Name'
```

Since 12.0 legacy authorization is off by default (release notes), so only this header form works. A `?api_key=` query parameter, `X-Emby-Token` and `X-MediaBrowser-Token` headers are the legacy forms and return 401, so do not copy older tutorials that use them. Revoke a key with `DELETE /Auth/Keys/{key}`.

### Add a library and scan it

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "$BASE/Library/VirtualFolders?name=Movies&collectionType=movies&refreshLibrary=false" \
  -H "$KEYAUTH" -H "$JSON" \
  -d '{"LibraryOptions":{"PathInfos":[{"Path":"/media/Movies"}]}}'

curl -s -o /dev/null -w "%{http_code}\n" -X POST $BASE/Library/Refresh -H "$KEYAUTH"
```

`Path` is the path inside the container. `collectionType` values include `movies`, `tvshows` and `music`. `Library/Refresh` returns 204 immediately and scans in the background; a tiny library finished within seconds. For large libraries poll the item count, or read the `Scan Media Library` entry from `GET /ScheduledTasks` (its `State` is `Running` or `Idle`). Check libraries with:

```bash
curl -s -H "$KEYAUTH" $BASE/Library/VirtualFolders | jq '.[] | {Name, CollectionType, Locations, ItemId}'
```

### List, search and stream items

```bash
# every movie with its file path and runtime
curl -s -H "$KEYAUTH" \
  "$BASE/Items?Recursive=true&IncludeItemTypes=Movie&SortBy=SortName&Fields=Path,ProductionYear" \
  | jq '{total: .TotalRecordCount, items: [.Items[] | {Name, Id, Path, RunTimeTicks}]}'

# search by title
curl -s -H "$KEYAUTH" "$BASE/Items?searchTerm=harbor&Recursive=true&Limit=5" | jq '.Items[].Name'

# newest items in one library (ItemId from VirtualFolders)
curl -s -H "$KEYAUTH" "$BASE/Items/Latest?ParentId=$LIBRARY_ID" | jq '.[].Name'
```

`RunTimeTicks` is in 100-nanosecond units (30000000 is 3 seconds). Fetch artwork with `GET /Items/{id}/Images/Primary` and the original file with `GET /Videos/{id}/stream?static=true` (returned `video/mp4` for an mp4). Both accept the same header.

### Add files later

Copy new files into the mounted folder, then call `POST /Library/Refresh` again. The test run added a second movie folder and the next refresh listed 2 items.

## Examples

### Example 1: Stand up a family movie server and verify it

Request: "Set up Jellyfin for the movies on /srv/media/Movies and tell me when it lists them."

```bash
mkdir -p ~/jellyfin/config ~/jellyfin/cache && cd ~/jellyfin || exit 1
docker compose up -d
until [ "$(curl -s http://127.0.0.1:8096/health)" = "Healthy" ]; do sleep 2; done
# run the wizard, log in, create the key, add the library (sections above)
curl -s -H "$KEYAUTH" "$BASE/Items?Recursive=true&IncludeItemTypes=Movie" | jq .TotalRecordCount
```

Result: the health check returns `Healthy`, the wizard calls return 204, and the final command prints the number of movies found, for example `214`. The agent reports the URL, the admin user name, and that the API key is stored in `JELLYFIN_API_KEY`, not the key value.

### Example 2: Report library items that are missing artwork

Request: "Which movies in Jellyfin have no poster?"

```bash
curl -s -H "$KEYAUTH" "$BASE/Items?Recursive=true&IncludeItemTypes=Movie&Fields=Path" \
  | jq -r '.Items[] | select(.ImageTags.Primary == null) | "\(.Name)\t\(.Path)"'
```

Result: a tab-separated list such as `Night Ferry (2019)	/media/Movies/Night Ferry (2019)/Night Ferry.mkv`. An empty result means every item has a primary image.

## Guidelines

- Pin the image tag (`12.4` or a full build tag such as `12.4.20261026-211555`). The `latest` tag follows major version bumps; back up `/config` before changing the tag.
- Bind to 127.0.0.1 and add a reverse proxy with TLS for remote access. The wizard endpoints are open until `Startup/Complete` is called, so finish setup before exposing the port.
- Use the `Authorization: MediaBrowser Token="..."` header. Query-string keys and `X-Emby-Token` returned 401 on 12.4.
- Create one key per script (`app=` name) so each can be revoked alone. Never print keys or the admin password in logs or reports.
- Mount media read-only and keep `/config` and `/cache` on local disk, not a network share.
- Hardware transcoding needs host GPU devices passed into the container and is hardware specific; this skill does not cover it. Direct play needs no transcoding.
- Running the container on Windows or macOS is not supported by the project; use the native installers there.
- Not for photo backup from phones (use Immich) and not a replacement for a backup of the originals.
