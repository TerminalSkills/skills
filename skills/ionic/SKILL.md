---
name: ionic
description: Ionic is an open-source framework for building cross-platform mobile, desktop, and progressive web apps using web technologies (HTML, CSS, JavaScript/TypeScript). Use when building apps with Ionic's UI components, integrating native device APIs via Capacitor, or deploying to iOS, Android, and web from a single codebase.
license: Apache-2.0
compatibility: Node.js 22+ and npm; Xcode on macOS for iOS builds, Android Studio for Android builds
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
  - mobile
  - cross-platform
  - hybrid
  - capacitor
  - angular
  repository: https://github.com/ionic-team/ionic-framework
---

# Ionic — Cross-Platform Apps with Web Technologies

## Overview

Ionic is an open-source (MIT) framework for building cross-platform mobile, desktop, and progressive web apps with web technologies (HTML, CSS, JavaScript/TypeScript). Its UI components are Web Components that work with React, Angular, or Vue, adapt to the iOS and Android look automatically, and reach native device APIs through Capacitor — letting you ship to iOS, Android, and the web from a single codebase.

## Instructions

### Project Setup

```bash
# Install Ionic CLI
npm install -g @ionic/cli

# Create a new project (React, Angular, or Vue)
ionic start my-app tabs --type=react
cd my-app

# Run in browser
ionic serve

# Add native platforms
ionic cap add ios
ionic cap add android

# Build and sync to native
ionic cap sync
ionic cap open ios          # Opens Xcode
ionic cap open android      # Opens Android Studio
```

### UI Components

```tsx
// src/pages/Home.tsx — Ionic React page; the components adapt to iOS/Android automatically

import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonList, IonItem, IonLabel, IonBadge, IonSearchbar,
  IonRefresher, IonRefresherContent, IonFab, IonFabButton,
  IonIcon, IonSegment, IonSegmentButton, IonAvatar,
} from "@ionic/react";
import { add } from "ionicons/icons";
import { useState } from "react";

type Task = { id: string; title: string; description: string; priority: "high" | "normal"; done: boolean; assignee: { avatar: string } };

const Home: React.FC = () => {
  const [segment, setSegment] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const visible = tasks.filter((t) => (segment === "all" || (segment === "done") === t.done) && t.title.toLowerCase().includes(searchText.toLowerCase()));

  const handleRefresh = async (event: CustomEvent) => {
    setTasks(await (await fetch("/api/tasks")).json());   // your tasks endpoint
    event.detail.complete();    // Dismiss the refresher spinner
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Tasks</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar
            value={searchText}
            onIonInput={(e) => setSearchText(e.detail.value ?? "")}
            placeholder="Search tasks..."
          />
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={segment} onIonChange={(e) => setSegment(e.detail.value as string)}>
            <IonSegmentButton value="all"><IonLabel>All</IonLabel></IonSegmentButton>
            <IonSegmentButton value="active"><IonLabel>Active</IonLabel></IonSegmentButton>
            <IonSegmentButton value="done"><IonLabel>Done</IonLabel></IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <IonList>
          {visible.map((task) => (
            <IonItem key={task.id} routerLink={`/task/${task.id}`}>
              <IonAvatar slot="start">
                <img src={task.assignee.avatar} alt="" />
              </IonAvatar>
              <IonLabel>
                <h2>{task.title}</h2>
                <p>{task.description}</p>
              </IonLabel>
              <IonBadge slot="end" color={task.priority === "high" ? "danger" : "medium"}>
                {task.priority}
              </IonBadge>
            </IonItem>
          ))}
        </IonList>

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton routerLink="/task/new">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};
export default Home;
```

### Native APIs with Capacitor

```typescript
// src/services/native.ts — Access device features via Capacitor plugins
import { Camera } from "@capacitor/camera";
import { Geolocation } from "@capacitor/geolocation";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Preferences } from "@capacitor/preferences";

// Camera — take a photo (Camera.chooseFromGallery() picks existing ones; getPhoto() is deprecated since plugin 8.1)
export async function takePhoto(): Promise<string> {
  const photo = await Camera.takePhoto({ quality: 80 });
  return photo.webPath!;
}

// Geolocation
export async function getCurrentPosition() {
  const coords = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
  });
  return {
    lat: coords.coords.latitude,
    lng: coords.coords.longitude,
  };
}

// Local notifications
export async function scheduleReminder(title: string, body: string, date: Date) {
  await LocalNotifications.schedule({
    notifications: [{
      title,
      body,
      id: Date.now() % 2147483647,   // must fit a 32-bit int on Android
      schedule: { at: date },
    }],
  });
}

// Share
export async function shareContent(title: string, text: string, url?: string) {
  await Share.share({ title, text, url });
}

// Haptic feedback
export async function hapticTap() {
  await Haptics.impact({ style: ImpactStyle.Light });
}

// Local storage (key-value, persists across app restarts)
export async function savePreference(key: string, value: string) {
  await Preferences.set({ key, value });
}

export async function getPreference(key: string): Promise<string | null> {
  const { value } = await Preferences.get({ key });
  return value;
}
```

### Theming

```css
/* src/theme/variables.css — Custom theme */
:root {
  --ion-color-primary: #4f46e5;
  --ion-color-primary-rgb: 79, 70, 229;
  --ion-color-primary-contrast: #ffffff;
  --ion-color-primary-contrast-rgb: 255, 255, 255;
  --ion-color-primary-shade: #463ec9;
  --ion-color-primary-tint: #6158e8;
  /* Override secondary, success, warning, danger the same way — set all six variables per color */

  --ion-font-family: 'Inter', system-ui, sans-serif;
}

/* Dark mode — Ionic auto-detects system preference */
@media (prefers-color-scheme: dark) {
  :root {
    --ion-background-color: #0f172a;
    --ion-text-color: #e2e8f0;
    --ion-card-background: #1e293b;
  }
}
```

## Installation

```bash
npm install -g @ionic/cli
npm install @ionic/react @ionic/react-router
npm install @capacitor/core @capacitor/cli
npm install @capacitor/camera @capacitor/geolocation  # Per-plugin
```

## Examples

### Example 1: Scaffold a tabbed React app and preview it

**User request:**

```
Start a new Ionic React app called field-notes with tabs, then open it in the browser.
```

The agent runs:

```bash
npm install -g @ionic/cli
ionic start field-notes tabs --type=react
cd field-notes
ionic serve
```

Result: a new project with three starter tab pages and routing wired up, served
at `http://localhost:8100` with live reload. `--type=react` picks the React
flavor (`--type=angular` or `--type=vue` for the others).

### Example 2: Add the camera on a real device

**User request:**

```
Let users attach a photo to a note using the device camera on iOS.
```

The agent installs the plugin, adds the iOS platform, and calls it from a
service:

```bash
npm install @capacitor/camera
ionic cap add ios
ionic cap sync
```

```typescript
import { Camera } from "@capacitor/camera";

const photo = await Camera.takePhoto({ quality: 80 });
// photo.webPath -> use as an <img> src
```

Result: on a device, tapping the button opens the camera and returns a usable
image path. `ionic cap open ios` launches Xcode to run it; add the
`NSCameraUsageDescription` key to `Info.plist` first (and
`NSPhotoLibraryUsageDescription` if you also call `Camera.chooseFromGallery()`).

## Guidelines

1. **Capacitor over Cordova** — Capacitor is Ionic's modern native runtime; it supports any web framework and has better plugin ecosystem
2. **Platform-adaptive components** — Ionic components auto-adapt to iOS/Android look; don't override platform styles unless necessary
3. **Lazy load pages** — Use React.lazy or Angular lazy modules for each page; keeps initial bundle small
4. **Test in browser first** — Develop and debug with `ionic serve`; only test on device for native features (camera, GPS)
5. **Use Ionic's CSS utilities** — Ionic includes padding, margin, text alignment utilities; avoid writing custom CSS for spacing
6. **Progressive Web App first** — Test the web version before adding native platforms; a new app has no service worker, so add `vite-plugin-pwa` (React/Vue) or `ng add @angular/pwa` to make it an installable PWA
7. **Capacitor plugins for native** — Always use Capacitor plugins over direct Cordova plugins; they have better TypeScript support
8. **Live reload on device** — `ionic cap run ios --livereload --external` for instant feedback during native testing
