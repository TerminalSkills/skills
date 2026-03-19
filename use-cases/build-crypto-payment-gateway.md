---
title: "Build a Crypto Payment Gateway"
description: "Accept USDC and ETH payments in your e-commerce store. Generate per-payment HD wallets, detect on-chain confirmations via Alchemy, support Ethereum, Polygon, Base, and Solana, and convert to fiat via Circle."
skills: [wagmi, prisma]
difficulty: advanced
time_estimate: "8 hours"
tags: [crypto, web3, payments, ethereum, solana, usdc, ecommerce]
---

# Build a Crypto Payment Gateway

Your Shopify store wants to accept crypto. Your customers are asking for it. Stripe doesn't do ETH. You want **instant settlement, no chargebacks, 1% fees** — not 2.9%.

## Who This Is For

An e-commerce store owner ready to add crypto checkout. You already have a product, you have customers who want to pay in crypto, and you want a clean, professional payment flow.

## What You'll Build

- 🔐 HD wallet generation — unique address per payment (no address reuse)
- ⛓️ On-chain detection — Alchemy/Infura webhooks for payment confirmation
- 🌐 Multi-chain — Ethereum, Polygon, Base (EVM) + Solana
- 💵 Fiat conversion — USDC → USD via Circle
- 🔔 Merchant webhooks — real-time payment notifications

## Prerequisites

- Alchemy or Infura account (free tier)
- Circle account for USDC settlement (optional)
- PostgreSQL database

---

## Step 1: Payment Schema

```prisma
// schema.prisma
model Payment {
  id              String   @id @default(cuid())
  orderId         String   @unique
  merchantId      String
  amountUSD       Float
  chain           String   // "ethereum" | "polygon" | "base" | "solana"
  token           String   // "ETH" | "USDC" | "MATIC"
  expectedAmount  String   // in token units (string to preserve precision)
  walletAddress   String
  walletIndex     Int      // HD derivation index
  status          String   @default("pending") // pending | confirmed | expired | converted
  txHash          String?
  blockNumber     Int?
  confirmedAt     DateTime?
  expiresAt       DateTime
  webhookUrl      String?
  createdAt       DateTime @default(now())
}

model MerchantWallet {
  id          String @id @default(cuid())
  merchantId  String @unique
  xpub        String // extended public key for HD derivation
  nextIndex   Int    @default(0)
}
```

```bash
npx prisma migrate dev --name init
```

---

## Step 2: HD Wallet Generation (EVM)

```typescript
// lib/wallet.ts
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { getAddress } from 'viem';
import { prisma } from './prisma';

// Store mnemonic in HSM / secrets manager — never in DB
const MNEMONIC = process.env.MERCHANT_MNEMONIC!;

function deriveEVMAddress(index: number): string {
  const seed = mnemonicToSeedSync(MNEMONIC);
  const root = HDKey.fromMasterSeed(seed);
  // BIP-44: m/44'/60'/0'/0/index
  const child = root.derive(`m/44'/60'/0'/0/${index}`);
  const pubKey = child.publicKey!;
  // Convert uncompressed public key to Ethereum address
  const address = getAddress(`0x${Buffer.from(pubKey).slice(1).toString('hex').slice(-40)}`);
  return address;
}

export async function createPaymentAddress(
  merchantId: string,
  orderId: string,
  amountUSD: number,
  chain: 'ethereum' | 'polygon' | 'base',
  token: 'ETH' | 'USDC'
): Promise<{ address: string; expiresAt: Date }> {
  // Get/create merchant HD wallet config
  let merchantWallet = await prisma.merchantWallet.findUnique({ where: { merchantId } });
  if (!merchantWallet) {
    merchantWallet = await prisma.merchantWallet.create({
      data: { merchantId, xpub: 'derived_from_mnemonic', nextIndex: 0 }
    });
  }

  const index = merchantWallet.nextIndex;
  const address = deriveEVMAddress(index);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  // Fetch current ETH price for conversion
  const ethPrice = await getETHPrice();
  const expectedAmount = token === 'ETH'
    ? (amountUSD / ethPrice).toFixed(8)
    : amountUSD.toFixed(6); // USDC is 1:1

  await prisma.payment.create({
    data: { orderId, merchantId, amountUSD, chain, token, expectedAmount, walletAddress: address, walletIndex: index, expiresAt }
  });

  await prisma.merchantWallet.update({
    where: { merchantId },
    data: { nextIndex: index + 1 }
  });

  return { address, expiresAt };
}

async function getETHPrice(): Promise<number> {
  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
  const data = await res.json();
  return data.ethereum.usd;
}
```

---

## Step 3: Monitor On-Chain Payments with Alchemy

```typescript
// lib/monitor.ts
import { createPublicClient, http, parseEther, formatEther } from 'viem';
import { mainnet, polygon, base } from 'viem/chains';
import { prisma } from './prisma';

const chains = { ethereum: mainnet, polygon, base };
const rpcUrls = {
  ethereum: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
  polygon: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
  base: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
};

export async function watchPayment(orderId: string) {
  const payment = await prisma.payment.findUnique({ where: { orderId } });
  if (!payment || payment.status !== 'pending') return;

  const chain = payment.chain as keyof typeof chains;
  const client = createPublicClient({ chain: chains[chain], transport: http(rpcUrls[chain]) });

  const unwatch = client.watchBlocks({
    onBlock: async (block) => {
      if (new Date() > payment.expiresAt) {
        await prisma.payment.update({ where: { orderId }, data: { status: 'expired' } });
        unwatch();
        return;
      }

      // Check balance of payment address
      const balance = await client.getBalance({ address: payment.walletAddress as `0x${string}` });
      const expectedWei = parseEther(payment.expectedAmount);

      if (balance >= expectedWei) {
        await prisma.payment.update({
          where: { orderId },
          data: { status: 'confirmed', blockNumber: Number(block.number), confirmedAt: new Date() }
        });

        await notifyMerchant(payment);
        unwatch();
      }
    }
  });

  // Auto-cleanup after 35 min
  setTimeout(unwatch, 35 * 60 * 1000);
}

async function notifyMerchant(payment: any) {
  if (!payment.webhookUrl) return;
  await fetch(payment.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'payment.confirmed',
      orderId: payment.orderId,
      amount: payment.expectedAmount,
      token: payment.token,
      chain: payment.chain,
      txHash: payment.txHash,
    })
  });
}
```

---

## Step 4: Checkout API Endpoint

```typescript
// api/checkout.ts — Next.js API route or Express handler
import { createPaymentAddress } from '../lib/wallet';
import { watchPayment } from '../lib/monitor';

export async function POST(req: Request) {
  const { orderId, amountUSD, chain, token, webhookUrl } = await req.json();

  const { address, expiresAt } = await createPaymentAddress(
    'merchant_001', orderId, amountUSD, chain, token
  );

  // Start monitoring in background
  watchPayment(orderId).catch(console.error);

  return Response.json({
    paymentAddress: address,
    amount: amountUSD,
    token,
    chain,
    expiresAt,
    qrData: `ethereum:${address}?value=${amountUSD}`, // EIP-681
  });
}
```

---

## Step 5: USDC → USD Conversion via Circle

```typescript
// lib/circle-convert.ts

export async function convertUSDCToFiat(walletAddress: string, amountUsdc: number) {
  // Circle API: initiate transfer from custodial wallet to bank account
  const res = await fetch('https://api-sandbox.circle.com/v1/transfers', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.CIRCLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      source: { type: 'wallet', id: process.env.CIRCLE_WALLET_ID },
      destination: { type: 'bank', id: process.env.CIRCLE_BANK_ID },
      amount: { amount: amountUsdc.toFixed(2), currency: 'USD' },
    })
  });

  return res.json();
}
```

---

## Checkout UI (React/wagmi)

```typescript
// components/CryptoCheckout.tsx
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';

export function CryptoCheckout({ address, amount, token }: { address: string; amount: string; token: string }) {
  const { sendTransaction, data: hash } = useSendTransaction();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  return (
    <div>
      <p>Send {amount} {token} to:</p>
      <code>{address}</code>
      <button onClick={() => sendTransaction({ to: address as `0x${string}`, value: parseEther(amount) })}>
        Pay with Wallet
      </button>
      {isSuccess && <p>✅ Payment sent! Awaiting confirmation...</p>}
    </div>
  );
}
```

---

## Next Steps

- Add Solana support using `@solana/web3.js` for SPL token transfers
- Implement Alchemy Notify webhooks instead of block polling for reliability
- Add payment link generation (shareable URLs)
- Build merchant dashboard with transaction history and settlement reports
- Implement automatic sweep: consolidate payment wallets to cold storage daily
