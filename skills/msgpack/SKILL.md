---
name: msgpack
description: >-
  Encodes and decodes MessagePack, a compact binary serialization format that
  carries the same data types as JSON plus raw bytes and timestamps. Use when
  someone asks to "replace JSON with MessagePack", "serialize to binary",
  "send msgpack over WebSocket", "store msgpack in Redis", or "decode a
  msgpack stream" in JavaScript, TypeScript, Python or Go.
license: Apache-2.0
compatibility: "Node.js, browsers, Deno or Bun with @msgpack/msgpack 3.x; Python 3.10+ with msgpack 1.2; Go with vmihailenco/msgpack v5"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/msgpack/msgpack
  tags:
    - serialization
    - binary
    - json-alternative
    - msgpack
    - cross-language
---

# MessagePack

## Overview

MessagePack is a binary format that maps onto JSON's data model (null, booleans, numbers, strings, arrays, maps) and adds a binary type, extension types and a standard timestamp. Payloads are usually smaller than JSON and cheaper to parse, but the gain depends on the data: measure on your own payloads before promising a number. The format is schemaless, so you still need a contract between sender and receiver. Official libraries: `@msgpack/msgpack` (JS/TS, 3.1.x), `msgpack` (Python, 1.2.x). In Go, `github.com/vmihailenco/msgpack/v5` is the widely used package.

## Instructions

### Install

```bash
npm install @msgpack/msgpack      # JavaScript / TypeScript
pip install msgpack               # Python (package name is msgpack, not msgpack-python)
go get github.com/vmihailenco/msgpack/v5
```

### JavaScript / TypeScript

- `encode(value)` returns a `Uint8Array`; `decode(bytes)` returns `unknown`. `decode` expects exactly one object: extra bytes or an empty buffer throw `RangeError`.
- `Date` round-trips natively through the standard timestamp extension. No codec is needed.
- Integers beyond 2^53: pass `useBigInt64: true` to both `encode` and `decode`.
- Several concatenated objects: `decodeMulti(bytes)` (sync) or `decodeMultiStream(stream)` (async). One big array arriving as a stream: `decodeArrayStream`. A `fetch` response body: `decodeAsync(response.body)`.
- Reuse `new Encoder()` / `new Decoder()` in hot paths; options are the same as for `encode`/`decode`.
- Custom types: register an `ExtensionCodec` entry with a type in 0-127 (negatives are reserved) and pass `{ extensionCodec }` to every encode and decode call, including the recursive ones inside your handlers.
- Untrusted input: set `maxStrLength`, `maxBinLength`, `maxArrayLength`, `maxMapLength`, `maxExtLength` in the decoder options.

### Python

- `msgpack.packb(obj)` / `msgpack.unpackb(data)`; `dumps`/`loads` are aliases; `pack`/`unpack` work with file objects.
- Since 1.0, bytes are packed as the bin type (`use_bin_type=True`) and strings unpack as `str` (`raw=False`). Use `use_bin_type=False` and `raw=True` only to talk to very old peers.
- Map keys must be `str` or `bytes` by default (`strict_map_key=True`); pass `strict_map_key=False` for other key types.
- `msgpack.Unpacker()` with `feed()` (or a file object) iterates over a stream of objects. After an error other than `OutOfData` an `Unpacker` cannot be reused.
- Timezone-aware datetimes: `packb(obj, datetime=True)` and `unpackb(data, timestamp=3)` give a round trip. Other custom types: `default=` when packing, and `object_hook=` or `ext_hook=` (with `msgpack.ExtType`) when unpacking.
- `max_buffer_size` defaults to 100 MiB to limit abuse from untrusted data.

### Go

Use `msgpack.Marshal(&v)` and `msgpack.Unmarshal(data, &v)`. Struct tags are `msgpack:"name"` and `msgpack:",omitempty"`. Check the package's documentation for options such as sorted map keys.

## Examples

### Example 1: Compact WebSocket messages in TypeScript

Request: "Our dashboard sends JSON over a WebSocket every 100 ms, switch the frames to MessagePack."

```typescript
import { encode, decode } from "@msgpack/msgpack";

const ws = new WebSocket("wss://metrics.internal.example.net/stream");
ws.binaryType = "arraybuffer";

ws.onopen = () => ws.send(encode({ type: "subscribe", channel: "cpu", since: new Date() }));
ws.onmessage = (event) => {
  const msg = decode(new Uint8Array(event.data as ArrayBuffer)) as { type: string };
  console.log(msg.type);
};
```

The server must send binary frames too; the `Date` arrives as a `Date`. Result: frames are binary and typically smaller than the same JSON.

### Example 2: Custom `Set` type with an extension codec

Request: "Serialize a Set of user IDs, JSON turns it into {}."

```typescript
import { encode, decode, ExtensionCodec } from "@msgpack/msgpack";

const extensionCodec = new ExtensionCodec();
extensionCodec.register({
  type: 0,
  encode: (v) => (v instanceof Set ? encode([...v], { extensionCodec }) : null),
  decode: (data) => new Set(decode(data, { extensionCodec }) as number[]),
});

const bytes = encode({ admins: new Set([101, 204]) }, { extensionCodec });
console.log(decode(bytes, { extensionCodec })); // { admins: Set(2) { 101, 204 } }
```

### Example 3: Redis cache and stream in Python

Request: "Cache API results in Redis as MessagePack and read a file of many records."

```python
import datetime
import msgpack

record = {"order_id": 88123, "paid_at": datetime.datetime(2026, 10, 1, 10, tzinfo=datetime.timezone.utc), "receipt": b"\x89PNG"}
blob = msgpack.packb(record, datetime=True)          # store this value, e.g. redis.set("order:88123", blob)
print(msgpack.unpackb(blob, timestamp=3))            # same dict back, datetime and bytes intact

unpacker = msgpack.Unpacker()
unpacker.feed(msgpack.packb(1) + msgpack.packb([2]))
print(list(unpacker))                                # [1, [2]]
```

## Guidelines

- It is not human-readable: keep JSON for public APIs and debugging, and offer MessagePack via content negotiation (`Accept: application/x-msgpack`; `application/msgpack` is also seen).
- Never decode untrusted input without the size limits above, and never rebuild arbitrary classes from decoded data.
- Extension type IDs are a private contract: document them and use the same IDs in every language.
- Numbers: JavaScript numbers above 2^53 lose precision unless `useBigInt64` is on; Python ints beyond 64 bits cannot be packed.
- For very small or highly repetitive payloads, gzip over JSON or a schema-based format (Protocol Buffers, Avro) may win; benchmark first.
