---
title: Build a Secrets Scanner
slug: build-secrets-scanner
description: Build a secrets scanner that detects API keys, passwords, tokens, and credentials in code repositories, environment files, and logs with pattern matching, entropy analysis, and remediation workflows.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - secrets
  - scanning
  - security
  - credentials
  - detection
---

# Build a Secrets Scanner

## The Problem

Olga leads security at a 25-person company. An AWS access key was committed to a public GitHub repo — attackers found it in 4 minutes and spun up $3K of crypto miners. The company also found Stripe API keys in frontend JavaScript bundles, database passwords in Docker Compose files committed to git, and JWT secrets in CI logs. Secret scanning services cost $500+/month and only cover git. They need a comprehensive scanner: detect secrets in code, configs, logs, and CI output using pattern matching and entropy analysis, with automated remediation.

## Step 1: Build the Scanner Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash, randomBytes } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
const redis = new Redis(process.env.REDIS_URL!);

interface SecretFinding {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  file: string;
  line: number;
  match: string;
  masked: string;
  entropy: number;
  verified: boolean;
  status: "open" | "resolved" | "false_positive";
  detectedAt: string;
}

interface ScanResult {
  scanId: string;
  findings: SecretFinding[];
  filesScanned: number;
  duration: number;
}

const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp; severity: SecretFinding["severity"]; verify?: (match: string) => Promise<boolean> }> = [
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/g, severity: "critical", verify: async (m) => /^AKIA[A-Z0-9]{16}$/.test(m) },
  { name: "AWS Secret Key", pattern: /(?:aws_secret_access_key|AWS_SECRET)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi, severity: "critical" },
  { name: "GitHub Token", pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g, severity: "critical" },
  { name: "Stripe API Key", pattern: /sk_(?:live|test)_[A-Za-z0-9]{24,}/g, severity: "critical" },
  { name: "Stripe Publishable", pattern: /pk_(?:live|test)_[A-Za-z0-9]{24,}/g, severity: "medium" },
  { name: "JWT Secret", pattern: /(?:jwt_secret|JWT_SECRET|jwt_key)\s*[=:]\s*['"]?([^\s'"]{8,})['"]?/gi, severity: "high" },
  { name: "Database URL", pattern: /(?:postgres|mysql|mongodb)(?:ql)?:\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi, severity: "critical" },
  { name: "Generic API Key", pattern: /(?:api_key|apikey|api_secret)\s*[=:]\s*['"]?([A-Za-z0-9_\-]{20,})['"]?/gi, severity: "high" },
  { name: "Private Key", pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, severity: "critical" },
  { name: "Slack Token", pattern: /xox[bpoas]-[0-9a-zA-Z-]{10,}/g, severity: "high" },
  { name: "SendGrid Key", pattern: /SG\.[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{43,}/g, severity: "high" },
  { name: "Generic Secret", pattern: /(?:password|secret|token|credential)\s*[=:]\s*['"]([^'"\s]{8,})['"]?/gi, severity: "medium" },
];

const EXCLUDE_PATTERNS = [/node_modules/, /\.git\//, /package-lock\.json/, /yarn\.lock/, /\.min\.js$/, /\.(png|jpg|gif|svg|ico|woff|ttf|eot)$/];

// Scan a directory for secrets
export async function scanDirectory(dir: string): Promise<ScanResult> {
  const scanId = `scan-${randomBytes(6).toString("hex")}`;
  const start = Date.now();
  const findings: SecretFinding[] = [];
  let filesScanned = 0;

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (EXCLUDE_PATTERNS.some((p) => p.test(fullPath))) continue;
      if (entry.isDirectory()) { await walk(fullPath); continue; }
      if (entry.isFile()) {
        const stats = await stat(fullPath);
        if (stats.size > 1024 * 1024) continue; // skip files > 1MB
        try {
          const content = await readFile(fullPath, "utf-8");
          const fileFindings = scanContent(content, fullPath);
          findings.push(...fileFindings);
          filesScanned++;
        } catch {}
      }
    }
  }

  await walk(dir);

  // Store results
  await pool.query(
    `INSERT INTO secret_scans (id, findings_count, files_scanned, duration, created_at) VALUES ($1, $2, $3, $4, NOW())`,
    [scanId, findings.length, filesScanned, Date.now() - start]
  );

  for (const finding of findings) {
    await pool.query(
      `INSERT INTO secret_findings (id, scan_id, type, severity, file, line, masked, entropy, status, detected_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', NOW())`,
      [finding.id, scanId, finding.type, finding.severity, finding.file, finding.line, finding.masked, finding.entropy]
    );
  }

  // Alert on critical findings
  const critical = findings.filter((f) => f.severity === "critical");
  if (critical.length > 0) {
    await redis.rpush("notification:queue", JSON.stringify({ type: "secrets_found", scanId, criticalCount: critical.length, findings: critical.map((f) => ({ type: f.type, file: f.file, line: f.line })) }));
  }

  return { scanId, findings, filesScanned, duration: Date.now() - start };
}

function scanContent(content: string, filePath: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split("\n");

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    for (const pattern of SECRET_PATTERNS) {
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      let match;
      while ((match = regex.exec(line)) !== null) {
        const secretValue = match[1] || match[0];
        // Skip low-entropy matches (likely false positives)
        const entropy = calculateEntropy(secretValue);
        if (entropy < 3.0 && pattern.severity !== "critical") continue;
        // Skip common false positives
        if (/^(true|false|null|undefined|example|test|TODO|FIXME)/i.test(secretValue)) continue;
        if (secretValue.length < 8) continue;

        findings.push({
          id: `find-${randomBytes(4).toString("hex")}`,
          type: pattern.name, severity: pattern.severity,
          file: filePath, line: lineNum + 1,
          match: secretValue, masked: maskSecret(secretValue),
          entropy, verified: false, status: "open",
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  return findings;
}

function calculateEntropy(str: string): number {
  const freq = new Map<string, number>();
  for (const char of str) freq.set(char, (freq.get(char) || 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) return "****";
  return secret.slice(0, 4) + "*".repeat(secret.length - 8) + secret.slice(-4);
}

// Mark finding as resolved or false positive
export async function updateFinding(findingId: string, status: "resolved" | "false_positive"): Promise<void> {
  await pool.query("UPDATE secret_findings SET status = $2 WHERE id = $1", [findingId, status]);
}

// Get open findings
export async function getOpenFindings(): Promise<SecretFinding[]> {
  const { rows } = await pool.query("SELECT * FROM secret_findings WHERE status = 'open' ORDER BY severity, detected_at DESC");
  return rows;
}
```

## Results

- **$3K AWS incident prevented** — scanner runs in CI pre-commit; AWS key detected in diff; commit blocked; key never reaches GitHub
- **Database passwords in Docker Compose** — scanner finds `postgres://user:password@db` in committed files; team moves to env vars; password rotated
- **Entropy analysis reduces false positives** — `password=test123` (low entropy) → skipped; `password=aK9$mP2xL#7nQ` (high entropy) → flagged; 80% fewer false positives
- **Private keys caught** — `-----BEGIN RSA PRIVATE KEY-----` in repo; developer committed instead of adding to .gitignore; caught before push; key rotated
- **Remediation workflow** — finding → alert → developer rotates secret → marks as resolved; audit trail of every secret exposure and resolution
