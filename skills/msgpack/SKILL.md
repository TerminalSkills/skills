---
name: msgpack
category: Developer Tools
tags: [serialization, binary, json-alternative, performance, compact, cross-language]
version: 1.0.0
author: terminal-skills
---

# MessagePack — Efficient Binary Serialization

You are an expert in MessagePack, the efficient binary serialization format. You help developers replace JSON with a compact binary format that's 30-50% smaller and 2-10x faster to parse — supporting all JSON types plus binary data, timestamps, and custom extensions, with libraries available for 50+ programming languages.

## Core Capabilities

### Node.js Usage

```typescript
import { encode, decode, Encoder, Decoder, ExtensionCodec } from "@msgpack/msgpack";

// Basic encode/decode
const data = {
  name: "Alice",
  age: 30,
  scores: [95, 87, 92],
  active: true,
  metadata: { role: "admin", lastLogin: new Date() },
};

const packed = encode(data);              // Uint8Array (binary)
console.log(packed.length);               // ~65 bytes vs ~120 bytes JSON

const unpacked = decode(packed);          // Original object

// Custom extension for Date
const extensionCodec = new ExtensionCodec();
extensionCodec.register({
  type: 0,                                // Extension type ID (0-127)
  encode: (input: unknown) => {
    if (input instanceof Date) {
      return encode(input.getTime());
    }
    return null;
  },
  decode: (data: Uint8Array) => {
    return new Date(decode(data) as number);
  },
});

const encoder = new Encoder({ extensionCodec });
const decoder = new Decoder({ extensionCodec });

// Streaming decode for large data
import { decodeMultiStream } from "@msgpack/msgpack";
for await (const item of decodeMultiStream(readableStream)) {
  processItem(item);
}

// WebSocket with MessagePack
ws.binaryType = "arraybuffer";
ws.onmessage = (event) => {
  const data = decode(new Uint8Array(event.data));
  handleMessage(data);
};
ws.send(encode({ type: "subscribe", channel: "metrics" }));
```

### Comparison

```typescript
const testData = { users: Array.from({ length: 1000 }, (_, i) => ({
  id: i, name: `User ${i}`, email: `user${i}@example.com`, score: Math.random() * 100,
}))};

// JSON: 89,234 bytes, encode 2.1ms, decode 3.4ms
// MessagePack: 52,847 bytes (41% smaller), encode 0.8ms, decode 1.2ms
```

## Installation

```bash
npm install @msgpack/msgpack              # JavaScript/TypeScript
pip install msgpack                       # Python
go get github.com/vmihailenco/msgpack/v5  # Go
```

## Best Practices

1. **Replace JSON for internal APIs** — Use MessagePack between microservices; keep JSON for public APIs (human-readable)
2. **WebSocket payloads** — Use MessagePack for real-time binary data over WebSocket; smaller frames, faster parsing
3. **Cache storage** — Store MessagePack in Redis/Memcached; 30-50% less memory than JSON strings
4. **Extension types** — Register custom types (Date, BigInt, Decimal) with extension codec; type-safe round-trip
5. **Streaming decode** — Use `decodeMultiStream` for large datasets; process items as they arrive
6. **Content-Type** — Use `application/x-msgpack` or `application/msgpack` header for HTTP APIs
7. **Schema evolution** — Like JSON, MessagePack is schema-less; add/remove fields freely
8. **Fallback to JSON** — Support both formats via Accept header; MessagePack for performance, JSON for debugging
