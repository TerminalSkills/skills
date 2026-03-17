---
title: Build an IoT Device Dashboard
slug: build-iot-device-dashboard
description: Build an IoT device management dashboard with real-time telemetry, device provisioning, OTA firmware updates, alerting, and fleet management for connected device deployments.
skills:
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - iot
  - dashboard
  - devices
  - telemetry
  - fleet-management
---

# Build an IoT Device Dashboard

## The Problem

Olga leads engineering at a 20-person IoT company with 10,000 deployed sensors (temperature, humidity, motion) in 200 buildings. Devices report data but there's no centralized dashboard — checking a device requires SSH. 15% of devices are offline but nobody knows until a customer complains. Firmware updates require physical access to each device. There's no alerting — a freezer temperature sensor reading 25°C (should be -18°C) goes unnoticed. They need a dashboard: real-time telemetry, device health monitoring, OTA updates, configurable alerts, and fleet-wide analytics.

## Step 1: Build the Device Dashboard

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface Device {
  id: string;
  name: string;
  type: "temperature" | "humidity" | "motion" | "energy" | "air_quality";
  location: { building: string; floor: string; room: string; lat?: number; lng?: number };
  firmware: string;
  status: "online" | "offline" | "error" | "updating";
  lastSeenAt: string;
  config: Record<string, any>;
  tags: string[];
}

interface TelemetryPoint { deviceId: string; metric: string; value: number; unit: string; timestamp: number; }
interface Alert { id: string; deviceId: string; metric: string; value: number; threshold: number; condition: "above" | "below"; severity: "critical" | "warning"; message: string; acknowledgedAt: string | null; createdAt: string; }
interface AlertRule { id: string; deviceType: string; metric: string; condition: "above" | "below"; threshold: number; severity: "critical" | "warning"; message: string; }

const ALERT_RULES: AlertRule[] = [
  { id: "temp-high", deviceType: "temperature", metric: "temperature", condition: "above", threshold: 30, severity: "warning", message: "Temperature above 30°C" },
  { id: "temp-critical", deviceType: "temperature", metric: "temperature", condition: "above", threshold: 40, severity: "critical", message: "Temperature critical: above 40°C" },
  { id: "temp-freezer", deviceType: "temperature", metric: "temperature", condition: "above", threshold: -10, severity: "critical", message: "Freezer temperature above -10°C" },
  { id: "humidity-high", deviceType: "humidity", metric: "humidity", condition: "above", threshold: 80, severity: "warning", message: "Humidity above 80%" },
  { id: "motion-offline", deviceType: "motion", metric: "battery", condition: "below", threshold: 10, severity: "warning", message: "Battery below 10%" },
];

// Ingest telemetry from device
export async function ingestTelemetry(points: TelemetryPoint[]): Promise<void> {
  const pipeline = redis.pipeline();
  for (const point of points) {
    // Latest value
    pipeline.hset(`device:${point.deviceId}:latest`, point.metric, JSON.stringify({ value: point.value, unit: point.unit, timestamp: point.timestamp }));
    // Time series (keep 24h at 1min resolution)
    const minute = Math.floor(point.timestamp / 60000);
    pipeline.hset(`telemetry:${point.deviceId}:${minute}`, point.metric, point.value);
    pipeline.expire(`telemetry:${point.deviceId}:${minute}`, 86400);
    // Mark device as seen
    pipeline.set(`device:lastseen:${point.deviceId}`, point.timestamp);
    pipeline.expire(`device:lastseen:${point.deviceId}`, 600); // 10 min TTL
  }
  await pipeline.exec();

  // Check alert rules
  for (const point of points) {
    await checkAlerts(point);
  }
}

async function checkAlerts(point: TelemetryPoint): Promise<void> {
  const { rows: [device] } = await pool.query("SELECT type, name, location FROM devices WHERE id = $1", [point.deviceId]);
  if (!device) return;

  for (const rule of ALERT_RULES) {
    if (rule.deviceType !== device.type || rule.metric !== point.metric) continue;
    const triggered = rule.condition === "above" ? point.value > rule.threshold : point.value < rule.threshold;

    if (triggered) {
      const dedupeKey = `alert:dedup:${point.deviceId}:${rule.id}`;
      if (await redis.exists(dedupeKey)) continue; // already alerted recently

      await redis.setex(dedupeKey, 3600, "1"); // dedup for 1 hour
      const alertId = `alert-${randomBytes(6).toString("hex")}`;
      const location = JSON.parse(device.location);

      await pool.query(
        `INSERT INTO device_alerts (id, device_id, device_name, metric, value, threshold, condition, severity, message, location, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [alertId, point.deviceId, device.name, point.metric, point.value, rule.threshold, rule.condition, rule.severity, `${rule.message} — ${device.name} at ${location.building}/${location.room}`, JSON.stringify(location)]
      );

      await redis.rpush("notification:queue", JSON.stringify({ type: "iot_alert", alertId, severity: rule.severity, device: device.name, metric: point.metric, value: point.value, threshold: rule.threshold }));
    }
  }
}

// Get fleet overview
export async function getFleetOverview(): Promise<{ total: number; online: number; offline: number; alerting: number; byType: Record<string, number>; byBuilding: Record<string, number> }> {
  const { rows: devices } = await pool.query("SELECT id, type, location FROM devices");
  let online = 0, offline = 0, alerting = 0;
  const byType: Record<string, number> = {};
  const byBuilding: Record<string, number> = {};

  for (const device of devices) {
    const lastSeen = await redis.get(`device:lastseen:${device.id}`);
    if (lastSeen) online++; else offline++;
    byType[device.type] = (byType[device.type] || 0) + 1;
    const loc = JSON.parse(device.location);
    byBuilding[loc.building] = (byBuilding[loc.building] || 0) + 1;
  }

  const { rows: [{ count: alertCount }] } = await pool.query("SELECT COUNT(*) as count FROM device_alerts WHERE acknowledged_at IS NULL AND created_at > NOW() - INTERVAL '24 hours'");
  alerting = parseInt(alertCount);

  return { total: devices.length, online, offline, alerting, byType, byBuilding };
}

// Get device telemetry history
export async function getDeviceTelemetry(deviceId: string, hours: number = 24): Promise<Array<{ timestamp: number; metrics: Record<string, number> }>> {
  const now = Math.floor(Date.now() / 60000);
  const data: any[] = [];
  for (let m = now - hours * 60; m <= now; m += 5) { // 5 min resolution
    const metrics = await redis.hgetall(`telemetry:${deviceId}:${m}`);
    if (Object.keys(metrics).length > 0) {
      data.push({ timestamp: m * 60000, metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, parseFloat(v)])) });
    }
  }
  return data;
}

// Schedule OTA firmware update
export async function scheduleOTAUpdate(deviceIds: string[], firmwareVersion: string, firmwareUrl: string): Promise<{ scheduled: number }> {
  for (const deviceId of deviceIds) {
    await pool.query(
      "INSERT INTO ota_updates (device_id, firmware_version, firmware_url, status, scheduled_at) VALUES ($1, $2, $3, 'pending', NOW())",
      [deviceId, firmwareVersion, firmwareUrl]
    );
    await redis.rpush(`device:commands:${deviceId}`, JSON.stringify({ command: "ota_update", firmwareUrl, version: firmwareVersion }));
  }
  return { scheduled: deviceIds.length };
}

// Get active alerts
export async function getActiveAlerts(): Promise<Alert[]> {
  const { rows } = await pool.query("SELECT * FROM device_alerts WHERE acknowledged_at IS NULL ORDER BY severity, created_at DESC LIMIT 100");
  return rows;
}

// Acknowledge alert
export async function acknowledgeAlert(alertId: string, userId: string): Promise<void> {
  await pool.query("UPDATE device_alerts SET acknowledged_at = NOW(), acknowledged_by = $2 WHERE id = $1", [alertId, userId]);
}
```

## Results

- **15% offline devices found** — fleet overview shows 1,500 offline out of 10,000; ops team investigates; network issue in Building 7 fixed; uptime: 85% → 98%
- **Freezer alert in 30 seconds** — temperature sensor reads 25°C → critical alert fires → facility manager notified → compressor restarted; $50K of inventory saved
- **OTA firmware updates** — schedule update for 10,000 devices from dashboard; devices pull update on next check-in; no physical access; rollout in hours not weeks
- **Real-time telemetry** — click any device → see temperature, humidity, battery in real-time; 24-hour history chart; anomalies visible at a glance
- **Fleet analytics** — 200 buildings, 10K devices, grouped by type and location; identify buildings with most offline devices; prioritize maintenance
