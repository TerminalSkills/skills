---
title: "Build a Crypto Payment Gateway"
description: "Accept USDC payments in your e-commerce store. Derive a unique deposit address per order from an extended public key, detect confirmed on-chain transfers on Ethereum, Polygon and Base, and notify your store with a signed webhook."
skills: [wagmi, prisma]
difficulty: advanced
time_estimate: "8 hours"
tags: [crypto, web3, payments, ethereum, usdc, ecommerce]
---

# Build a Crypto Payment Gateway

Your customers ask to pay in crypto. You want settlement in a dollar stablecoin and a payment flow you control.

## What You'll Build
- Watch-only HD address derivation: a unique deposit address per order, with no private key on the server
- On-chain detection of native USDC transfers on Ethereum, Polygon and Base, counted only once they are safely confirmed
- A wagmi checkout button that sends the USDC transfer from the customer's wallet
- A signed webhook to your store when the payment is confirmed

USDC only, on purpose: no price quotes or volatility, and transfers carry a transaction hash. Amounts are integer base units (6 decimals), never floats. Solana and fiat off-ramps are not covered.

## Prerequisites
- An Alchemy API key (`ALCHEMY_KEY`), PostgreSQL, Node.js 20+, and a wallet mnemonic kept offline

```bash
npm install @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1 pg viem wagmi @tanstack/react-query @scure/bip32 @scure/bip39 @noble/curves
npm install -D prisma@7.10.1 typescript tsx
```

## Step 1: Payment schema

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum PaymentStatus {
  pending
  confirmed
  expired
}

model MerchantWallet {
  id         String @id @default(cuid())
  merchantId String @unique
  xpub       String // account-level extended PUBLIC key, m/44'/60'/0'
  nextIndex  Int    @default(0)
}

model Payment {
  id            String        @id @default(cuid())
  orderId       String        @unique
  merchantId    String
  chain         String // "ethereum" | "polygon" | "base"
  amountUnits   BigInt // USDC base units (6 decimals): $24.90 = 24900000
  receivedUnits BigInt        @default(0)
  address       String        @unique
  addressIndex  Int
  status        PaymentStatus @default(pending)
  txHash        String?
  scannedBlock  BigInt // last block already scanned
  confirmedAt   DateTime?
  expiresAt     DateTime
  createdAt     DateTime      @default(now())

  @@unique([merchantId, addressIndex])
  @@index([status, chain])
}
```

```typescript
// prisma.config.ts
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
});
```
```bash
DATABASE_URL="postgres://app:$DB_PASSWORD@127.0.0.1:5432/shop" npx prisma migrate dev --name init
```

```typescript
// lib/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
```

## Step 2: Derive one address per order from an xpub

Run once offline; give the server only the printed `xpub`:
```typescript
// scripts/derive-xpub.ts — run once on an offline machine, store only the xpub on the server
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";

const root = HDKey.fromMasterSeed(mnemonicToSeedSync(process.env.MNEMONIC!));
console.log(root.derive("m/44'/60'/0'").publicExtendedKey); // xpub...
```

```typescript
// lib/wallet.ts — watch-only address derivation: the server never holds a private key
import { HDKey } from "@scure/bip32";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { publicKeyToAddress } from "viem/utils";
import { prisma } from "./prisma";

export function deriveAddress(xpub: string, index: number): `0x${string}` {
  // xpub is at m/44'/60'/0'; non-hardened children 0/index match MetaMask's standard accounts
  const child = HDKey.fromExtendedKey(xpub).deriveChild(0).deriveChild(index);
  const uncompressed = secp256k1.Point.fromBytes(child.publicKey!).toBytes(false);
  return publicKeyToAddress(`0x${Buffer.from(uncompressed).toString("hex")}`);
}

// Atomically reserve the next index so two checkouts can never share an address
export async function allocateAddress(merchantId: string, xpub: string) {
  const w = await prisma.merchantWallet.upsert({
    where: { merchantId },
    create: { merchantId, xpub, nextIndex: 1 },
    update: { nextIndex: { increment: 1 } },
  });
  const addressIndex = w.nextIndex - 1;
  return { addressIndex, address: deriveAddress(w.xpub, addressIndex) };
}
```

The derived addresses are the standard BIP-44 accounts `m/44'/60'/0'/0/<index>` of the same mnemonic (MetaMask uses this path; Ledger Live uses a different one, `m/44'/60'/<n>'/0/0`, so derive the keys with your own tooling at that path), so you can later sweep funds with the mnemonic. A sweep transaction needs a little native gas (ETH, POL) at the payment address.

## Step 3: Detect confirmed payments

Native USDC contract addresses come from [Circle's published list](https://developers.circle.com/stablecoins/usdc-contract-addresses). Confirmation depths are a risk choice; raise them for large orders.

```typescript
// lib/chains.ts — native USDC contracts, from https://developers.circle.com/stablecoins/usdc-contract-addresses
import { createPublicClient, http } from "viem";
import { base, mainnet, polygon } from "viem/chains";

export const CHAINS = {
  ethereum: { chain: mainnet, rpc: "eth-mainnet", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", confirmations: 12n },
  polygon: { chain: polygon, rpc: "polygon-mainnet", usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", confirmations: 64n },
  base: { chain: base, rpc: "base-mainnet", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", confirmations: 12n },
} as const;
export type ChainName = keyof typeof CHAINS;
export const isChain = (c: string): c is ChainName => Object.hasOwn(CHAINS, c);

export const clientFor = (name: ChainName) =>
  createPublicClient({
    chain: CHAINS[name].chain,
    transport: http(`https://${CHAINS[name].rpc}.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`),
  });
```

```typescript
// lib/scanner.ts — restart-safe: all state is in Postgres, run it from one worker
import { createHmac } from "node:crypto";
import { parseAbiItem } from "viem";
import { CHAINS, clientFor, type ChainName } from "./chains";
import type { Payment } from "../generated/prisma/client";
import { prisma } from "./prisma";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
// Alchemy limits eth_getLogs block ranges per plan (free plans: as few as 10 blocks); raise on paid plans
const MAX_RANGE = BigInt(process.env.GETLOGS_RANGE ?? 10);

export async function scanPending() {
  const pending = await prisma.payment.findMany({ where: { status: "pending" } });
  for (const p of pending) {
    try {
      await scanOne(p);
    } catch (err) {
      console.error(`scan failed for ${p.orderId}`, err);
    }
  }
}

async function scanOne(p: Payment) {
  const cfg = CHAINS[p.chain as ChainName];
  const client = clientFor(p.chain as ChainName);
  // Only count blocks that are `confirmations` deep, so a reorg cannot undo a credited payment
  const safeHead = (await client.getBlockNumber()) - cfg.confirmations;
  let from = p.scannedBlock + 1n;
  let received = p.receivedUnits;
  let txHash = p.txHash;

  while (from <= safeHead && received < p.amountUnits) {
    const to = from + MAX_RANGE - 1n < safeHead ? from + MAX_RANGE - 1n : safeHead;
    const logs = await client.getLogs({
      address: cfg.usdc, event: TRANSFER, args: { to: p.address as `0x${string}` }, fromBlock: from, toBlock: to,
    });
    for (const log of logs) {
      received += log.args.value!;
      txHash ??= log.transactionHash;
    }
    from = to + 1n;
  }

  const confirmed = received >= p.amountUnits; // overpayment is accepted; underpayment stays pending
  const expired = !confirmed && p.expiresAt < new Date() && from > safeHead;
  const status = confirmed ? "confirmed" : expired ? "expired" : "pending";
  // Compare-and-set on scannedBlock so two overlapping runs cannot double count
  const { count } = await prisma.payment.updateMany({
    where: { id: p.id, scannedBlock: p.scannedBlock, status: "pending" },
    data: { scannedBlock: from - 1n, receivedUnits: received, txHash, status, confirmedAt: confirmed ? new Date() : null },
  });
  if (count === 1 && confirmed) await notifyMerchant(p.orderId, txHash!, received);
}

// One webhook URL per merchant from your own config. Never take it from the checkout request (SSRF).
async function notifyMerchant(orderId: string, txHash: string, received: bigint) {
  const url = process.env.MERCHANT_WEBHOOK_URL;
  if (!url) return;
  const body = JSON.stringify({ event: "payment.confirmed", orderId, txHash, receivedUnits: received.toString() });
  const signature = createHmac("sha256", process.env.WEBHOOK_SECRET!).update(body).digest("hex");
  await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-signature": signature }, body });
}

setInterval(() => void scanPending(), 15_000);
```
Run `scanPending` in one worker process. State lives in Postgres, so a restart resumes where it stopped. Payments that arrive after `expiresAt` are not credited automatically; handle them as a refund or manual review.

## Step 4: Checkout endpoint

```typescript
// api/checkout.ts — fetch-style handler (Next.js route, Hono, Bun…)
import { clientFor, isChain } from "../lib/chains";
import { prisma } from "../lib/prisma";
import { allocateAddress } from "../lib/wallet";
import { parseUnits } from "viem";

export async function POST(req: Request) {
  const { orderId, amountUsd, chain } = await req.json();
  if (typeof orderId !== "string" || !isChain(chain) || !/^\d+(\.\d{1,2})?$/.test(String(amountUsd))) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const merchantId = "merchant_001";
  const { address, addressIndex } = await allocateAddress(merchantId, process.env.MERCHANT_XPUB!);
  const startBlock = await clientFor(chain).getBlockNumber();
  const payment = await prisma.payment.create({
    data: {
      orderId, merchantId, chain, address, addressIndex,
      amountUnits: parseUnits(String(amountUsd), 6), // USDC has 6 decimals; $1 = 1 USDC
      scannedBlock: startBlock,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
  return Response.json({ address, chain, amountUsd, token: "USDC", expiresAt: payment.expiresAt });
}
```
Run your own checks in front of this route: authenticate the caller and look up the order total on the server instead of trusting `amountUsd` from the browser.

## Step 5: Checkout UI with wagmi

Wrap the app in `WagmiProvider` and `QueryClientProvider` (config with the Base chain), then render:

```typescript
// components/CryptoCheckout.tsx
import { erc20Abi, parseUnits } from "viem";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { base } from "wagmi/chains";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export function CryptoCheckout({ address, amountUsd }: { address: `0x${string}`; amountUsd: string }) {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  return (
    <div>
      <p>Send {amountUsd} USDC on Base to:</p>
      <code>{address}</code>
      <button
        disabled={isPending}
        onClick={() =>
          writeContract({ address: USDC_BASE, abi: erc20Abi, functionName: "transfer", args: [address, parseUnits(amountUsd, 6)], chainId: base.id })
        }
      >
        Pay with wallet
      </button>
      {error && <p role="alert">{error.message}</p>}
      {isSuccess && <p>Payment sent. Waiting for confirmations...</p>}
    </div>
  );
}
```

## Next Steps

- Add Solana (SPL USDC) with its own derivation and scanner
