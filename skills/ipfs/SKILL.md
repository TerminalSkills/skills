---
name: ipfs
description: >-
  Store and retrieve files on IPFS (InterPlanetary File System). Use when a
  user asks to store files in a decentralized way, pin content on IPFS, upload
  NFT metadata, or use content-addressed storage.
license: Apache-2.0
compatibility: 'Any platform via HTTP API'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags: "ipfs, decentralized, storage, nft, pinning"
---

# IPFS

## Overview

IPFS is a decentralized file storage protocol. Files are content-addressed (identified by hash, not location). Used for NFT metadata, dApp assets, and censorship-resistant content. Pinning services (Pinata, Storacha, your own Kubo node) ensure files stay available.

## Instructions

### Step 1: Upload via Pinata (v3 API)

Create an API key in the Pinata dashboard and export its JWT as `PINATA_JWT`. The v3 endpoint takes a `network` field (`public` or `private`; it defaults to `private`, so set `public` for NFT metadata and anything that must be reachable on the open network). Responses are wrapped in `data`.

```typescript
// lib/ipfs.ts — upload files and JSON to public IPFS through Pinata's v3 API
const PINATA_JWT = process.env.PINATA_JWT!

export async function uploadToIPFS(file: Buffer, name: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', new File([file], name))
  formData.append('network', 'public')
  formData.append('name', name)

  const res = await fetch('https://uploads.pinata.cloud/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData,
  })
  if (!res.ok) throw new Error(`Pinata upload failed: ${res.status} ${await res.text()}`)

  const { data } = await res.json()
  return `ipfs://${data.cid}`
}

export async function uploadJSON(content: object, name: string): Promise<string> {
  const json = JSON.stringify(content)
  return uploadToIPFS(Buffer.from(json), `${name}.json`)
}
```

The same upload with the official SDK (`npm install pinata`, currently 2.x):

```typescript
import { PinataSDK } from 'pinata'

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.PINATA_GATEWAY!, // e.g. aquamarine-casual-tarantula-177.mypinata.cloud
})

const upload = await pinata.upload.public.file(new File(['hello'], 'hello.txt'))
console.log(upload.cid)
await pinata.upload.public.json({ name: 'Pinnie #1', image: `ipfs://${upload.cid}` })
```

The v3 upload endpoint does not accept folders. For a directory (for example a collection of numbered metadata files) use the legacy `https://api.pinata.cloud/pinning/pinFileToIPFS` endpoint, which is still documented, or add the folder to a Kubo node (Step 4). Files over 100 MB need resumable uploads; the SDK's `upload.public.file()` handles that.

### Step 2: NFT Metadata

```typescript
const imageUri = await uploadToIPFS(imageBuffer, 'nft-image.png')

const metadata = {
  name: 'Pinnie the Pinata #1',
  description: 'First piece of the Pinnie collection',
  image: imageUri,
  attributes: [
    { trait_type: 'Background', value: 'Blue' },
    { trait_type: 'Rarity', value: 'Rare' },
  ],
}

const tokenURI = await uploadJSON(metadata, 'pinnie-1')
// Pass tokenURI to your contract's mint function
```

### Step 3: Retrieve Content

Every Pinata account gets a dedicated gateway at `https://aquamarine-casual-tarantula-177.mypinata.cloud/ipfs/` plus the CID. By default it serves only files pinned to your account. Public gateways such as `https://ipfs.io/ipfs/<cid>` work without an account but rate-limit heavily (HTTP 429 is common), so use them for spot checks, not production traffic.

```typescript
const GATEWAY = process.env.PINATA_GATEWAY! // your dedicated gateway domain

export async function getFromIPFS(cid: string) {
  const res = await fetch(`https://${GATEWAY}/ipfs/${cid}`)
  if (!res.ok) throw new Error(`Gateway returned ${res.status} for ${cid}`)
  return res.json()
}
```

### Step 4: Run your own node with Kubo

Kubo is the reference IPFS implementation. Install it from a package manager (`brew install ipfs`, or the Linux packages listed in the Kubo README) or from the official release page, verifying the published checksum, then:

```console
$ ipfs init
$ ipfs daemon &
$ echo "hello IPFS" | ipfs add -q
QmYDAmHsFu5oWsJU21esKnN4ZRyE8txJNvrZxvxXLymC2L
$ ipfs cat QmYDAmHsFu5oWsJU21esKnN4ZRyE8txJNvrZxvxXLymC2L
hello IPFS
$ ipfs add -r ./metadata
$ ipfs pin ls --type=recursive
```

`ipfs add` pins by default and produces CIDv0 (`Qm…`) unless you pass `--cid-version=1` (or set `Import.CidVersion`), which gives `bafy…`/`bafkrei…` CIDs like Pinata's. The local gateway listens on 127.0.0.1:8080 and the RPC API on 127.0.0.1:5001; never expose port 5001 beyond localhost, because it controls the node.

## Examples

### Example 1: Upload a collection image and mint metadata

User: "Upload art/001.png to IPFS and give me a tokenURI for my ERC-721."

Run Steps 1 and 2 with `PINATA_JWT` set. Result: `uploadToIPFS` returns an `ipfs://bafybei…` URI for the image (the CID differs per file), and `uploadJSON` returns another for the metadata; pass the second to `mint`. Open it through your gateway, for example `https://aquamarine-casual-tarantula-177.mypinata.cloud/ipfs/` followed by the CID, to confirm it resolves.

### Example 2: Publish a static folder from a local node

User: "Pin my docs/build folder so it stays online."

```console
$ ipfs add -r -Q docs/build
```

`-Q` prints only the root CID of the folder; run `ipfs pin ls` with that CID to confirm it is pinned.

The node must stay online, or a pinning service must also hold the CID, for others to fetch it.

## Guidelines

- A CID is a hash of the content: changing one byte gives a new CID. Content is not permanent until at least one node pins it.
- Free-plan quotas and rate limits change; check the provider's current limits page (Pinata's API is 60 requests per minute on the free plan).
- `cloudflare-ipfs.com` no longer serves content; do not use it. web3.storage was replaced by Storacha, which uses a different client.
- Keep `PINATA_JWT` in environment variables and use scoped API keys; never ship it to browser code.
- For mutable pointers use IPNS or ENS; for immutable NFT metadata prefer `ipfs://<cid>` URIs over gateway URLs so you are not tied to one host.
