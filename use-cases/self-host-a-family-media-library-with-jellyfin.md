---
title: Self-Host a Family Movie and Music Library with Jellyfin
slug: self-host-a-family-media-library-with-jellyfin
description: Move a household's ripped movies and music off scattered drives and paid streaming apps onto one home server with Jellyfin, with scripted setup, library scans and a sanity report.
skills:
  - jellyfin
  - ffmpeg
  - caddy
category: devops
tags:
  - media-server
  - self-hosted
  - plex-alternative
  - docker-compose
  - home-server
---

# Self-Host a Family Movie and Music Library with Jellyfin

## The Problem

Marta has 380 movies ripped from discs she owns, 60 home videos and a few thousand music files spread over three external drives and a NAS share. Her kids watch on a living-room TV, a tablet and two phones. The files play only if someone plugs the right drive into the right laptop, the home videos have no thumbnails, and the one app that could unify it all wants a monthly fee for features that should be free. She wants one address on the home network that lists everything with posters, remembers where each person stopped watching, and does not send her library to a third party.

## The Solution

Run Jellyfin in a container on the home server with the media folder mounted read-only. The agent writes the Compose file, completes the first-run wizard through the REST API, creates a scoped API key, adds Movies and Music libraries, triggers scans and checks that every folder produced an item. ffmpeg normalises the few files whose container the TV cannot play and makes a quick report on odd files. Caddy fronts the server with a single hostname so it is not published on every interface.

## Step-by-Step Walkthrough

### 1. Prepare folders the scanner understands

Prompt: "Look at /srv/media and tell me which movie folders Jellyfin would not match."

```bash
cd /srv/media/Movies || exit 1
# folders that do not end in a (year) will usually be matched wrongly
ls -1 | grep -v -E ' \([0-9]{4}\)$'
```

The agent lists the offenders, for example `Night Ferry` and `harbor lights 2019`, proposes renames to `Night Ferry (2019)` style, and applies them only after Marta approves the list.

### 2. Deploy the container

Prompt: "Deploy Jellyfin 12.4 on this box, local only, media read-only."

```yaml
services:
  jellyfin:
    image: jellyfin/jellyfin:12.4
    container_name: jellyfin
    restart: unless-stopped
    ports:
      - "127.0.0.1:8096:8096/tcp"
    volumes:
      - /srv/jellyfin/config:/config
      - /srv/jellyfin/cache:/cache
      - type: bind
        source: /srv/media
        target: /media
        read_only: true
```

```bash
mkdir -p /srv/jellyfin/config /srv/jellyfin/cache
docker compose up -d
until [ "$(curl -s http://127.0.0.1:8096/health)" = "Healthy" ]; do sleep 2; done
```

### 3. Finish setup through the API

Prompt: "Do the first-run wizard for me. The admin password is in JELLYFIN_ADMIN_PASSWORD."

```bash
BASE=http://127.0.0.1:8096
JSON='Content-Type: application/json'
curl -s -X POST $BASE/Startup/Configuration -H "$JSON" -d '{"UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}'
curl -s $BASE/Startup/User >/dev/null
curl -s -X POST $BASE/Startup/User -H "$JSON" -d "{\"Name\":\"marta\",\"Password\":\"$JELLYFIN_ADMIN_PASSWORD\"}"
curl -s -X POST $BASE/Startup/RemoteAccess -H "$JSON" -d '{"EnableRemoteAccess":false,"EnableAutomaticPortMapping":false}'
curl -s -X POST $BASE/Startup/Complete
```

Each call answers 204. The agent then logs in with `/Users/AuthenticateByName`, creates an API key named `media-agent` and exports it as `JELLYFIN_API_KEY`, never printing the value.

### 4. Add libraries and scan

Prompt: "Add Movies and Music libraries and scan them."

```bash
KEYAUTH="Authorization: MediaBrowser Token=\"$JELLYFIN_API_KEY\""
curl -s -X POST "$BASE/Library/VirtualFolders?name=Movies&collectionType=movies&refreshLibrary=false" \
  -H "$KEYAUTH" -H "$JSON" -d '{"LibraryOptions":{"PathInfos":[{"Path":"/media/Movies"}]}}'
curl -s -X POST "$BASE/Library/VirtualFolders?name=Music&collectionType=music&refreshLibrary=false" \
  -H "$KEYAUTH" -H "$JSON" -d '{"LibraryOptions":{"PathInfos":[{"Path":"/media/Music"}]}}'
curl -s -X POST $BASE/Library/Refresh -H "$KEYAUTH"
```

### 5. Compare folders with items

Prompt: "Did every movie folder become an item?"

```bash
FOLDERS=$(find /srv/media/Movies -mindepth 1 -maxdepth 1 -type d | wc -l)
ITEMS=$(curl -s -H "$KEYAUTH" "$BASE/Items?Recursive=true&IncludeItemTypes=Movie&Limit=1" | jq .TotalRecordCount)
echo "folders=$FOLDERS items=$ITEMS"
curl -s -H "$KEYAUTH" "$BASE/Items?Recursive=true&IncludeItemTypes=Movie&Fields=Path" \
  | jq -r '.Items[] | select(.ImageTags.Primary == null) | .Path'
```

If the counts differ the agent waits for the scan to go idle (`GET /ScheduledTasks`, entry `Scan Media Library`) and checks again, then lists the folders that have no matching item.

### 6. Fix files a device cannot play

Prompt: "The TV will not play the two AVI files. Convert them without touching the originals."

```bash
cd /srv/media/Movies || exit 1
for f in *.avi; do
  ffmpeg -n -i "$f" -c:v libx264 -crf 20 -c:a aac "${f%.avi}.mp4"
done
```

The new MP4s sit beside the originals; the agent moves the AVIs to an archive folder after Marta confirms playback and calls `/Library/Refresh` again.

### 7. Put it behind a reverse proxy

Prompt: "Put it behind Caddy as media.home.lan."

```bash
printf 'media.home.lan {\n    reverse_proxy 127.0.0.1:8096\n}\n' > Caddyfile
caddy validate --config Caddyfile
```

## Real-World Example

On a Saturday afternoon Marta gives the agent the folder and the admin password variable. Step 1 finds 11 folders without years; she approves the renames. The container is healthy in 20 seconds, the wizard and key take one script, and the first scan of 380 movie folders and 60 home videos finishes before she has made coffee. The comparison shows 438 items for 440 folders; the two gaps are the AVI files. After the ffmpeg conversion both appear. The kids open the server in the TV browser, and each family member gets their own watch history from separate user accounts.

## Related Skills

- [jellyfin](/skills/jellyfin) — the media server, its wizard and library API
- [ffmpeg](/skills/ffmpeg) — converting files a device cannot direct-play
- [caddy](/skills/caddy) — reverse proxy in front of the server
