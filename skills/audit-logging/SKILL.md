---
name: audit-logging
description: >-
  Implement tamper-evident audit logs for compliance (SOC 2, HIPAA, PCI DSS). Use when building
  compliance audit trails, tracking who did what and when, or implementing immutable event logs
  that satisfy regulatory retention requirements.
license: Apache-2.0
compatibility: "Node.js 18+ and Python 3.9+. Storage: PostgreSQL, S3, AWS CloudTrail."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["audit-logging", "compliance", "soc2", "hipaa", "immutable-log"]
  use-cases:
    - "Add HIPAA-compliant audit logging to a healthcare application"
    - "Build SOC 2 CC7 evidence with tamper-evident logs"
    - "Implement append-only audit trail with hash chaining"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Audit Logging

## Overview

Compliance audit logs must answer: **who** did **what** to **which resource**, **when**, from **where**, and with **what result**. They must also be tamper-evident — an auditor must be able to verify logs haven't been modified.

**Regulatory retention requirements:**
| Standard | Retention |
|----------|-----------|
| HIPAA | 6 years |
| PCI DSS | 12 months online + 12 months archive |
| SOC 2 (typical) | 1 year |
| GDPR | Defined by purpose (often 1-3 years) |

## Required Log Fields

```typescript
interface AuditLogEntry {
  // Core required fields
  id: string;             // UUID — unique event identifier
  timestamp: string;      // ISO 8601 UTC — when the event occurred
  actor_id: string;       // User/service that performed the action
  actor_type: 'user' | 'service' | 'admin' | 'system';
  action: string;         // What happened: "read" | "write" | "delete" | "login" | "export"
  resource_type: string;  // "patient_record" | "invoice" | "user_account"
  resource_id: string;    // ID of the affected resource
  result: 'success' | 'failure' | 'denied';
  
  // Context fields
  ip_address: string;     // Source IP
  user_agent?: string;    // Browser/client identifier
  session_id?: string;    // Session identifier
  
  // Optional fields
  changed_fields?: string[];    // For write operations: which fields changed
  old_values?: Record<string, unknown>;  // Previous values (be careful with PII)
  reason?: string;              // Clinical justification (HIPAA), business reason
  
  // Tamper-evidence
  prev_hash?: string;     // Hash of previous log entry (hash chaining)
  hash: string;           // SHA-256 of this entry
}
```

## Hash Chain Implementation

Hash chaining makes log tampering detectable: each entry includes a hash of the previous entry. Modifying any entry breaks the chain.

```python
import json
import hashlib
import uuid
from datetime import datetime, timezone
from typing import Optional

class AuditLogger:
    def __init__(self, db_connection):
        self.db = db_connection
        self._last_hash: Optional[str] = None
    
    def _compute_hash(self, entry: dict, prev_hash: Optional[str]) -> str:
        """Compute SHA-256 of the log entry for tamper-evidence."""
        hashable = {
            "id": entry["id"],
            "timestamp": entry["timestamp"],
            "actor_id": entry["actor_id"],
            "action": entry["action"],
            "resource_type": entry["resource_type"],
            "resource_id": entry["resource_id"],
            "result": entry["result"],
            "prev_hash": prev_hash or "GENESIS"
        }
        content = json.dumps(hashable, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()
    
    async def log(
        self,
        actor_id: str,
        actor_type: str,
        action: str,
        resource_type: str,
        resource_id: str,
        result: str,
        ip_address: str,
        **kwargs
    ) -> dict:
        """Create and persist a tamper-evident audit log entry."""
        # Get last hash for chaining
        prev_hash = self._last_hash or await self._get_last_hash()
        
        entry = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actor_id": actor_id,
            "actor_type": actor_type,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "result": result,
            "ip_address": ip_address,
            "prev_hash": prev_hash or "GENESIS",
            **kwargs
        }
        
        entry["hash"] = self._compute_hash(entry, prev_hash)
        self._last_hash = entry["hash"]
        
        # Persist to append-only storage
        await self.db.audit_logs.insert_one(entry)
        return entry
    
    async def verify_chain(self, limit: int = 1000) -> bool:
        """Verify the hash chain integrity."""
        entries = await self.db.audit_logs.find(
            sort=[("timestamp", 1)], 
            limit=limit
        )
        
        prev_hash = "GENESIS"
        for i, entry in enumerate(entries):
            expected_hash = self._compute_hash(entry, prev_hash)
            if entry["hash"] != expected_hash:
                print(f"❌ Chain broken at entry {i}: id={entry['id']}")
                return False
            if entry["prev_hash"] != prev_hash:
                print(f"❌ prev_hash mismatch at entry {i}")
                return False
            prev_hash = entry["hash"]
        
        print(f"✅ Chain verified: {len(entries)} entries intact")
        return True
    
    async def _get_last_hash(self) -> Optional[str]:
        last = await self.db.audit_logs.find_one(sort=[("timestamp", -1)])
        return last["hash"] if last else None
```

## Express.js Audit Middleware

```javascript
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class AuditLogger {
  constructor(db) {
    this.db = db;
  }
  
  async log({ actorId, actorType = 'user', action, resourceType, resourceId, 
               result, ipAddress, sessionId, reason, changedFields }) {
    const prevHash = await this.getLastHash();
    
    const entry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      actor_id: actorId,
      actor_type: actorType,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      result,
      ip_address: ipAddress,
      session_id: sessionId,
      reason,
      changed_fields: changedFields,
      prev_hash: prevHash || 'GENESIS',
    };
    
    entry.hash = this.computeHash(entry);
    await this.db.auditLogs.create(entry);
    return entry;
  }
  
  computeHash(entry) {
    const hashable = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      actor_id: entry.actor_id,
      action: entry.action,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      result: entry.result,
      prev_hash: entry.prev_hash,
    });
    return crypto.createHash('sha256').update(hashable).digest('hex');
  }
  
  async getLastHash() {
    const last = await this.db.auditLogs.findOne({ order: [['timestamp', 'DESC']] });
    return last?.hash || null;
  }
}

// Express middleware — auto-log all requests
const createAuditMiddleware = (auditLogger) => async (req, res, next) => {
  const start = Date.now();
  
  // Capture response
  const originalSend = res.send;
  res.send = function(body) {
    res.send = originalSend;
    
    // Log after response sent
    setImmediate(async () => {
      try {
        await auditLogger.log({
          actorId: req.user?.id || 'anonymous',
          actorType: req.user ? 'user' : 'anonymous',
          action: `${req.method.toLowerCase()}_${req.route?.path || req.path}`,
          resourceType: req.params.resourceType || 'api_request',
          resourceId: req.params.id || req.path,
          result: res.statusCode < 400 ? 'success' : 
                  res.statusCode === 403 ? 'denied' : 'failure',
          ipAddress: req.ip,
          sessionId: req.session?.id,
          duration_ms: Date.now() - start,
        });
      } catch (err) {
        console.error('Audit log failed:', err);
        // Never let audit logging errors break the main flow
      }
    });
    
    return originalSend.apply(this, arguments);
  };
  
  next();
};
```

## PostgreSQL Append-Only Table

```sql
-- Append-only audit log table
-- The CHECK constraint and trigger prevent UPDATE/DELETE
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'service', 'admin', 'system')),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
  ip_address INET,
  session_id TEXT,
  reason TEXT,
  changed_fields TEXT[],
  prev_hash TEXT,
  hash TEXT NOT NULL UNIQUE
);

-- Create append-only trigger — prevent modification
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable — modification not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- Indexes for common queries
CREATE INDEX idx_audit_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_action ON audit_logs(action);

-- Query: All actions by a user in the last 30 days
SELECT timestamp, action, resource_type, resource_id, result, ip_address
FROM audit_logs
WHERE actor_id = 'user-123'
  AND timestamp > NOW() - INTERVAL '30 days'
ORDER BY timestamp DESC;

-- Query: All access to a specific patient record
SELECT timestamp, actor_id, action, result, ip_address, reason
FROM audit_logs
WHERE resource_type = 'patient_record'
  AND resource_id = 'patient-456'
ORDER BY timestamp DESC;

-- Query: Failed access attempts (security monitoring)
SELECT actor_id, COUNT(*) as failed_attempts, MAX(timestamp) as last_attempt
FROM audit_logs
WHERE result IN ('failure', 'denied')
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY actor_id
HAVING COUNT(*) > 5
ORDER BY failed_attempts DESC;
```

## AWS CloudTrail + Immutable S3

```bash
# Create CloudTrail that logs to immutable S3 bucket
aws cloudtrail create-trail \
  --name compliance-audit-trail \
  --s3-bucket-name my-audit-logs-bucket \
  --include-global-service-events \
  --is-multi-region-trail \
  --enable-log-file-validation  # Cryptographic log integrity

# Create S3 bucket with Object Lock (WORM - Write Once Read Many)
aws s3api create-bucket \
  --bucket my-audit-logs-bucket \
  --object-lock-enabled-for-bucket

# Set default retention: compliance mode (cannot delete even by admin)
aws s3api put-object-lock-configuration \
  --bucket my-audit-logs-bucket \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": {
      "DefaultRetention": {
        "Mode": "COMPLIANCE",
        "Years": 6
      }
    }
  }'

# Verify log file integrity (CloudTrail)
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:us-east-1:123456789:trail/compliance-audit-trail \
  --start-time 2024-01-01T00:00:00Z
```

## FastAPI Audit Middleware (Python)

```python
from fastapi import FastAPI, Request
import time

app = FastAPI()

@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    start_time = time.time()
    
    # Extract context before processing
    actor_id = None
    if hasattr(request.state, 'user'):
        actor_id = request.state.user.id
    
    response = await call_next(request)
    duration_ms = int((time.time() - start_time) * 1000)
    
    # Determine result from status code
    if response.status_code < 400:
        result = "success"
    elif response.status_code == 403:
        result = "denied"
    else:
        result = "failure"
    
    # Log asynchronously to avoid blocking response
    import asyncio
    asyncio.create_task(audit_logger.log(
        actor_id=actor_id or "anonymous",
        actor_type="user" if actor_id else "anonymous",
        action=f"{request.method.lower()}:{request.url.path}",
        resource_type="api_endpoint",
        resource_id=str(request.url.path),
        result=result,
        ip_address=request.client.host,
        duration_ms=duration_ms,
        http_status=response.status_code,
    ))
    
    return response
```

## Compliance Checklist

- [ ] All required fields logged (actor, action, resource, timestamp, IP, result)
- [ ] Tamper-evidence implemented (hash chaining or digital signatures)
- [ ] Append-only storage (trigger prevents UPDATE/DELETE, or S3 Object Lock)
- [ ] Log aggregation centralized (avoid local file logs that can be deleted)
- [ ] Retention policy matches regulation (HIPAA: 6yr, PCI: 1yr+1yr archive)
- [ ] Alerts for anomalies (failed logins, access spikes, unusual hours)
- [ ] Logs reviewed periodically (monthly for SOC 2, daily for high-security)
- [ ] Log access itself is audited (who viewed audit logs)
- [ ] Backup of audit logs separate from primary storage
- [ ] WORM storage for regulatory compliance archives
