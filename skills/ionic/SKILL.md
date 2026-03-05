---
name: ionic
description: Expert guidance for Ionic, the open-source framework for building cross-platform mobile, desktop, and progressive web apps using web technologies (HTML, CSS, JavaScript/TypeScript). Helps developers build apps with Ionic's UI components, integrate with native device APIs via Capacitor, and deploy to iOS, Android, and web from a single codebase.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
  - mobile
  - cross-platform
  - hybrid
  - capacitor
  - angular
---

# Ionic — Cross-Platform Apps with Web Technologies


## Overview

You are an expert in Ionic, the open-source framework for building cross-platform mobile, desktop, and progressive web apps using web technologies (HTML, CSS, JavaScript/TypeScript). You help developers build apps with Ionic's UI components, integrate with native device APIs via Capacitor, and deploy to iOS, Android, and web from a single codebase.

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
// src/pages/Home.tsx — Ionic React component with native-feeling UI
// Ionic provides 100+ UI components that adapt to iOS/Android automatically.

import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonList, IonItem, IonLabel, IonBadge, IonSearchbar,
  IonRefresher, IonRefresherContent, IonFab, IonFabButton,
  IonIcon, IonSegment, IonSegmentButton, IonCard, IonCardHeader,
  IonCardTitle, IonCardContent, IonChip, IonAvatar,
} from "@ionic/react";
import { add, filterOutline } from "ionicons/icons";
import { useState } from "react";

const Home: React.FC = () => {
  const [segment, setSegment] = useState("all");
  const [searchText, setSearchText] = useState("");

  const handleRefresh = async (event: CustomEvent) => {
    await fetchTasks();
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
          {tasks.map((task) => (
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
```

### Native APIs with Capacitor

```typescript
// src/services/native.ts — Access device features via Capacitor plugins
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Geolocation } from "@capacitor/geolocation";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Preferences } from "@capacitor/preferences";

// Camera — take photo or pick from gallery
export async function takePhoto(): Promise<string> {
  const image = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: CameraSource.Prompt,          // Let user choose camera or gallery
  });
  return image.webPath!;
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
      id: Date.now(),
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
  --ion-color-primary-shade: #463ec9;
  --ion-color-primary-tint: #6158e8;

  --ion-color-secondary: #06b6d4;
  --ion-color-success: #22c55e;
  --ion-color-warning: #f59e0b;
  --ion-color-danger: #ef4444;

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

### Example 1

**User request:** "Help me set up Ionic"

The agent follows the instructions above to configure Ionic with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Ionic configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Capacitor over Cordova** — Capacitor is Ionic's modern native runtime; it supports any web framework and has better plugin ecosystem
2. **Platform-adaptive components** — Ionic components auto-adapt to iOS/Android look; don't override platform styles unless necessary
3. **Lazy load pages** — Use React.lazy or Angular lazy modules for each page; keeps initial bundle small
4. **Test in browser first** — Develop and debug with `ionic serve`; only test on device for native features (camera, GPS)
5. **Use Ionic's CSS utilities** — Ionic includes padding, margin, text alignment utilities; avoid writing custom CSS for spacing
6. **Progressive Web App first** — Ionic apps are PWAs by default; test the web version before adding native platforms
7. **Capacitor plugins for native** — Always use Capacitor plugins over direct Cordova plugins; they have better TypeScript support
8. **Live reload on device** — `ionic cap run ios --livereload --external` for instant feedback during native testing
