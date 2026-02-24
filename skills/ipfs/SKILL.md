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
  version: 1.0.0
  category: development
  tags:
    - ipfs
    - decentralized
    - storage
    - nft
    - pinning
---

# IPFS

## Overview

IPFS is a decentralized file storage protocol. Files are content-addressed (identified by hash, not location). Used for NFT metadata, dApp assets, and censorship-resistant content. Pinning services (Pinata, web3.storage) ensure files stay available.

## Instructions

### Step 1: Upload via Pinata

```typescript
// lib/ipfs.ts — Upload files to IPFS via Pinata
const PINATA_JWT = process.env.PINATA_JWT!

export async function uploadToIPFS(file: Buffer, name: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', new Blob([file]), name)
  formData.append('pinataMetadata', JSON.stringify({ name }))

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData,
  })

  const { IpfsHash } = await res.json()
  return `ipfs://${IpfsHash}`
}

export async function uploadJSON(data: object): Promise<string> {
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({ pinataContent: data }),
  })

  const { IpfsHash } = await res.json()
  return `ipfs://${IpfsHash}`
}
```

### Step 2: NFT Metadata

```typescript
// Upload NFT image and metadata
const imageHash = await uploadToIPFS(imageBuffer, 'nft-image.png')

const metadata = {
  name: 'Cool NFT #1',
  description: 'A very cool NFT',
  image: imageHash,
  attributes: [
    { trait_type: 'Background', value: 'Blue' },
    { trait_type: 'Rarity', value: 'Rare' },
  ],
}

const metadataHash = await uploadJSON(metadata)
// Use metadataHash as tokenURI in your NFT contract
```

### Step 3: Retrieve Content

```typescript
// Read from IPFS via gateway
const GATEWAY = 'https://gateway.pinata.cloud/ipfs'

async function getFromIPFS(cid: string) {
  const res = await fetch(`${GATEWAY}/${cid}`)
  return res.json()
}
```

## Guidelines

- Content on IPFS is not automatically permanent — it needs to be "pinned" by at least one node.
- Pinata free tier: 500MB storage, 100 pins. web3.storage: 5GB free.
- Use IPFS gateways (ipfs.io, pinata, cloudflare-ipfs) for HTTP access to IPFS content.
- For mutable content, use IPNS (IPFS Name System) or ENS domains.
