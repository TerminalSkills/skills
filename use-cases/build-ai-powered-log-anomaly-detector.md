---
title: Build an AI-Powered Log Anomaly Detector
slug: build-ai-powered-log-anomaly-detector
description: Build a system that uses embeddings and statistical analysis to detect anomalous log patterns in real-time, alerting on novel errors before they become outages.
skills:
  - typescript
  - openai
  - redis
  - postgresql
  - hono
category: AI & Machine Learning
tags:
  - observability
  - anomaly-detection
  - logs
  - ai
  - monitoring
---

# Build an AI-Powered Log Anomaly Detector

## The Problem

Reina leads SRE at a 55-person e-commerce platform processing 200K requests/hour. Their ELK stack stores logs, but finding problems means writing queries after incidents. Last week, a subtle payment gateway error appeared in logs 45 minutes before checkout broke completely — but nobody noticed among 2M daily log lines. They need a system that learns what "normal" logs look like and alerts when something new and suspicious appears.

## Step 1: Build the Log Embedding Pipeline

The system converts log messages into embeddings, clusters them into known patterns, and flags messages that don't fit any cluster.

```typescript
// src/pipeline/log-embedder.ts — Convert logs to embeddings and detect anomalies
import OpenAI from "openai";
import { Redis } from "ioredis";
import { pool } from "../db";

const openai = new OpenAI();
const redis = new Redis(process.env.REDIS_URL!);

interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  service: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface LogPattern {
  id: string;
  centroid: number[];          // embedding centroid of this pattern
  exampleMessage: string;
  count: number;               // how many times we've seen this pattern
  firstSeen: string;
  lastSeen: string;
  avgFrequencyPerHour: number;
  services: string[];
}

// Normalize log messages by removing variable parts
function normalizeMessage(msg: string): string {
  return msg
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "<IP>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<UUID>")
    .replace(/\b\d{13,}\b/g, "<TIMESTAMP>")
    .replace(/\b\d+ms\b/g, "<DURATION>")
    .replace(/\b\d+\.\d+s\b/g, "<DURATION>")
    .replace(/port \d+/g, "port <PORT>")
    .replace(/:\d{4,5}\b/g, ":<PORT>")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "<EMAIL>")
    .replace(/\/api\/v\d+\/\w+\/[a-zA-Z0-9-]+/g, (m) => m.replace(/\/[a-f0-9-]{20,}/, "/<ID>"))
    .replace(/\b\d{3,}\b/g, "<NUM>");
}

export async function processLogBatch(logs: LogEntry[]): Promise<{
  anomalies: Array<LogEntry & { anomalyScore: number; reason: string }>;
  newPatterns: LogPattern[];
}> {
  const anomalies: Array<LogEntry & { anomalyScore: number; reason: string }> = [];
  const newPatterns: LogPattern[] = [];

  // Group by normalized message to reduce embedding calls
  const groups = new Map<string, LogEntry[]>();
  for (const log of logs) {
    const normalized = normalizeMessage(log.message);
    if (!groups.has(normalized)) groups.set(normalized, []);
    groups.get(normalized)!.push(log);
  }

  // Get embeddings for unique normalized messages
  const uniqueMessages = [...groups.keys()];
  const embeddings: number[][] = [];

  for (let i = 0; i < uniqueMessages.length; i += 100) {
    const batch = uniqueMessages.slice(i, i + 100);
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });
    embeddings.push(...response.data.map((d) => d.embedding));
  }

  // Load known patterns from Redis
  const patternsRaw = await redis.get("log:patterns");
  const knownPatterns: LogPattern[] = patternsRaw ? JSON.parse(patternsRaw) : [];

  // Compare each message against known patterns
  for (let i = 0; i < uniqueMessages.length; i++) {
    const embedding = embeddings[i];
    const logsInGroup = groups.get(uniqueMessages[i])!;

    let bestMatch: { pattern: LogPattern; similarity: number } | null = null;

    for (const pattern of knownPatterns) {
      const sim = cosineSimilarity(embedding, pattern.centroid);
      if (!bestMatch || sim > bestMatch.similarity) {
        bestMatch = { pattern, similarity: sim };
      }
    }

    if (!bestMatch || bestMatch.similarity < 0.85) {
      // New pattern — never seen before
      const newPattern: LogPattern = {
        id: `pat-${Date.now()}-${i}`,
        centroid: embedding,
        exampleMessage: logsInGroup[0].message,
        count: logsInGroup.length,
        firstSeen: logsInGroup[0].timestamp,
        lastSeen: logsInGroup[logsInGroup.length - 1].timestamp,
        avgFrequencyPerHour: 0,
        services: [...new Set(logsInGroup.map((l) => l.service))],
      };
      knownPatterns.push(newPattern);
      newPatterns.push(newPattern);

      // Error/fatal level new patterns are always anomalies
      for (const log of logsInGroup) {
        if (log.level === "error" || log.level === "fatal") {
          anomalies.push({
            ...log,
            anomalyScore: 0.95,
            reason: `New error pattern never seen before: "${normalizeMessage(log.message).slice(0, 100)}"`,
          });
        }
      }
    } else {
      // Known pattern — check for frequency anomalies
      const pattern = bestMatch.pattern;
      pattern.count += logsInGroup.length;
      pattern.lastSeen = logsInGroup[logsInGroup.length - 1].timestamp;

      // Frequency spike detection
      if (pattern.avgFrequencyPerHour > 0) {
        const currentRate = logsInGroup.length; // in this batch (5 min)
        const expectedPerBatch = pattern.avgFrequencyPerHour / 12;
        const ratio = currentRate / Math.max(1, expectedPerBatch);

        if (ratio > 5) { // 5x normal frequency
          for (const log of logsInGroup.slice(0, 3)) { // report first 3
            anomalies.push({
              ...log,
              anomalyScore: Math.min(0.9, 0.5 + ratio * 0.05),
              reason: `Frequency spike: ${currentRate} occurrences vs expected ${expectedPerBatch.toFixed(1)} per 5min (${ratio.toFixed(1)}x normal)`,
            });
          }
        }
      }

      // Update rolling average
      pattern.avgFrequencyPerHour = pattern.count / Math.max(1,
        (Date.now() - new Date(pattern.firstSeen).getTime()) / 3600000
      );
    }
  }

  // Save updated patterns
  await redis.setex("log:patterns", 86400 * 7, JSON.stringify(knownPatterns));

  // Store anomalies in database
  for (const anomaly of anomalies) {
    await pool.query(
      `INSERT INTO log_anomalies (timestamp, service, level, message, anomaly_score, reason, detected_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [anomaly.timestamp, anomaly.service, anomaly.level, anomaly.message, anomaly.anomalyScore, anomaly.reason]
    );
  }

  return { anomalies, newPatterns };
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

## Step 2: Build the Alert Manager

```typescript
// src/alerts/alert-manager.ts — Alert routing with deduplication and escalation
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface Alert {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  service: string;
  anomalyCount: number;
  firstSeen: string;
  samples: Array<{ message: string; timestamp: string }>;
}

export async function processAnomalies(anomalies: Array<{
  service: string;
  level: string;
  message: string;
  timestamp: string;
  anomalyScore: number;
  reason: string;
}>): Promise<Alert[]> {
  if (anomalies.length === 0) return [];

  const alerts: Alert[] = [];

  // Group anomalies by service + reason pattern
  const groups = new Map<string, typeof anomalies>();
  for (const a of anomalies) {
    const key = `${a.service}:${a.reason.slice(0, 50)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  for (const [key, group] of groups) {
    // Deduplication: don't alert on the same pattern within 30 minutes
    const dedupeKey = `alert:dedupe:${key}`;
    const recent = await redis.get(dedupeKey);
    if (recent) continue;

    const severity = group[0].anomalyScore > 0.8 ? "critical"
      : group[0].anomalyScore > 0.6 ? "warning" : "info";

    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      severity,
      title: `${severity === "critical" ? "🔴" : "🟡"} Anomaly in ${group[0].service}`,
      description: group[0].reason,
      service: group[0].service,
      anomalyCount: group.length,
      firstSeen: group[0].timestamp,
      samples: group.slice(0, 5).map((a) => ({ message: a.message, timestamp: a.timestamp })),
    };

    alerts.push(alert);
    await redis.setex(dedupeKey, 1800, alert.id); // 30 min cooldown

    // Store alert
    await pool.query(
      `INSERT INTO alerts (id, severity, title, description, service, anomaly_count, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [alert.id, alert.severity, alert.title, alert.description, alert.service, alert.anomalyCount]
    );

    // Send to Slack/PagerDuty based on severity
    if (severity === "critical") {
      await sendSlackAlert(alert);
    }
  }

  return alerts;
}

async function sendSlackAlert(alert: Alert): Promise<void> {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `${alert.title}\n${alert.description}\nService: ${alert.service} | Count: ${alert.anomalyCount}`,
      blocks: [{
        type: "section",
        text: { type: "mrkdwn", text: `*${alert.title}*\n${alert.description}` },
      }, {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Service:* ${alert.service}` },
          { type: "mrkdwn", text: `*Anomalies:* ${alert.anomalyCount}` },
        ],
      }, {
        type: "section",
        text: { type: "mrkdwn", text: `*Sample:*\n\`\`\`${alert.samples[0]?.message}\`\`\`` },
      }],
    }),
  });
}
```

## Results

- **Payment gateway error detected 42 minutes earlier** — the anomaly detector flagged the new error pattern at first occurrence; the team fixed it before checkout broke
- **False positive rate: 3%** — log normalization and embedding similarity filter out variable data; only genuinely new patterns trigger alerts
- **2M daily logs processed for $12/month** — batched embeddings and pattern caching keep costs low; only unique normalized messages need embedding
- **Pattern library grew to 1,200 known patterns** — after 2 weeks of learning, the system knows what "normal" looks like for each service and only alerts on true novelty
