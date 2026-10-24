---
title: Build Web3 Wallet Integration
slug: build-web3-wallet-integration
description: Build a Web3 wallet integration with wallet connection, Sign-In with Ethereum, on-chain balance and NFT checks, transaction tracking and multi-chain support using wagmi, viem, Hono, Zod and Redis.
skills:
  - redis
  - hono
  - zod
category: development
tags:
  - web3
  - wallet
  - blockchain
  - ethereum
  - dapp
---

# Build Web3 Wallet Integration

## The Problem

Alex leads frontend at a 20-person company building a marketplace that accepts crypto payments. Wallet connection, disconnection, chain switching and signing take hundreds of lines of error-prone code, and most tutorials are outdated (ethers v5, `window.ethereum` calls by hand). Users sit on different chains (Ethereum, Polygon, Arbitrum, Base, Optimism). The backend needs to know which wallet it is talking to, and the usual shortcut, trusting an address sent in a header or accepting any string that looks like a signature, lets anyone impersonate any wallet.

Alex needs a small, safe pattern: connect and switch chains in the browser, prove wallet ownership with Sign-In with Ethereum (EIP-4361), and read balances, NFT ownership and transaction status from the server.

## The Solution

- **wagmi + viem** in the browser: connectors, chain switching and message signing. wagmi 3 needs `viem` 2, `@tanstack/react-query` 5 and TypeScript 5.9 or newer.
- **viem** on the server: SIWE message verification (also for smart-contract wallets), reads, multicall and receipts.
- **Hono + Zod** for the API and input validation, **Redis** for single-use nonces and sessions.

```bash
npm install viem hono @hono/node-server @hono/zod-validator zod ioredis
npm install wagmi @tanstack/react-query   # frontend
```

## Step 1: Chains

viem ships the chain definitions (ids, native currency, explorers), so there is no hand-maintained table. The default public RPC endpoints are rate limited; set `RPC_URL_<chainId>` to your provider's URL per chain.

```typescript
import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet, polygon, arbitrum, base, optimism } from "viem/chains";

export const SUPPORTED = [mainnet, polygon, arbitrum, base, optimism] as const;

// Use your own RPC provider URL per chain in production; the public default RPCs are rate limited
const clients = new Map<number, PublicClient>();
export function getClient(chainId: number): PublicClient {
  const chain = SUPPORTED.find((c) => c.id === chainId);
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`);
  let client = clients.get(chainId);
  if (!client) {
    client = createPublicClient({ chain, transport: http(process.env[`RPC_URL_${chainId}`]) }) as PublicClient;
    clients.set(chainId, client);
  }
  return client;
}
```

## Step 2: Sign-In with Ethereum

The flow is: the server issues a single-use nonce, the wallet signs an EIP-4361 message containing it, and the server checks the signature, the nonce and the domain before creating a session. Redis `GETDEL` makes the nonce single-use even if two requests race. The session is an opaque random id in an HttpOnly cookie, and the wallet address always comes from the session, never from a request header.

```typescript
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { getClient, SUPPORTED } from "./chains";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const DOMAIN = process.env.APP_DOMAIN ?? "localhost:3000"; // must equal the domain in the signed message

export const auth = new Hono();

// 1. Server issues a single-use nonce
auth.get("/nonce", async (c) => {
  const nonce = generateSiweNonce();
  await redis.set(`siwe:nonce:${nonce}`, "1", "EX", 300);
  return c.json({ nonce });
});

// 2. Client signs an EIP-4361 message; server verifies the signature, nonce and domain
const verifyBody = z.object({
  message: z.string().min(1).max(2000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

auth.post("/verify", zValidator("json", verifyBody), async (c) => {
  const { message, signature } = c.req.valid("json");
  const fields = parseSiweMessage(message);
  if (!fields.address || !fields.nonce || !fields.chainId) return c.json({ error: "Malformed message" }, 400);

  // GETDEL makes the nonce single-use even under concurrent requests
  if (!(await redis.getdel(`siwe:nonce:${fields.nonce}`))) return c.json({ error: "Unknown or used nonce" }, 401);

  // Verify on the chain named in the message, so smart-contract wallets (ERC-1271) are checked where they live
  if (!SUPPORTED.some((ch) => ch.id === fields.chainId)) return c.json({ error: "Unsupported chain" }, 400);
  const valid = await getClient(fields.chainId).verifySiweMessage({
    message,
    signature: signature as `0x${string}`,
    domain: DOMAIN,
    nonce: fields.nonce,
  });
  if (!valid) return c.json({ error: "Invalid signature" }, 401);

  const sessionId = randomBytes(32).toString("hex");
  await redis.set(`siwe:session:${sessionId}`, fields.address.toLowerCase(), "EX", 86400);
  setCookie(c, "session", sessionId, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 86400 });
  return c.json({ address: fields.address });
});

// Middleware: the address comes from the server-side session, never from a client header
export const requireWallet = async (c: any, next: () => Promise<void>) => {
  const sessionId = getCookie(c, "session");
  const address = sessionId ? await redis.get(`siwe:session:${sessionId}`) : null;
  if (!address) return c.json({ error: "Sign in with your wallet first" }, 401);
  c.set("walletAddress", address);
  await next();
};
```

## Step 3: Balances, NFT gating and transaction status

Reads go through viem's public client. `multicall` batches the ERC-20 `balanceOf`, `symbol` and `decimals` calls into one request, and `formatUnits` handles decimals correctly (never convert wei with `Number`, it loses precision).

```typescript
import { erc721Abi, erc20Abi, formatUnits, isAddress, type Address, type Hash } from "viem";
import { getClient } from "./chains";

export async function getNativeBalance(address: Address, chainId: number) {
  const client = getClient(chainId);
  const wei = await client.getBalance({ address });
  const { symbol, decimals } = client.chain!.nativeCurrency;
  return { symbol, balance: formatUnits(wei, decimals) };
}

export async function getTokenBalances(address: Address, chainId: number, tokens: Address[]) {
  const client = getClient(chainId);
  const calls = tokens.flatMap((token) => [
    { address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] } as const,
    { address: token, abi: erc20Abi, functionName: "symbol" } as const,
    { address: token, abi: erc20Abi, functionName: "decimals" } as const,
  ]);
  const res = await client.multicall({ contracts: calls, allowFailure: true });

  return tokens.flatMap((token, i) => {
    const [bal, sym, dec] = [res[i * 3], res[i * 3 + 1], res[i * 3 + 2]];
    if (bal.status !== "success" || sym.status !== "success" || dec.status !== "success") return [];
    if (bal.result === 0n) return [];
    return [{ token, symbol: sym.result as string, balance: formatUnits(bal.result as bigint, dec.result as number) }];
  });
}

// ERC-721 ownership check for gated content (ERC-1155 uses balanceOf(address, id) instead)
export async function ownsNft(owner: Address, collection: Address, chainId: number) {
  const count = await getClient(chainId).readContract({
    address: collection, abi: erc721Abi, functionName: "balanceOf", args: [owner],
  });
  return count > 0n;
}

export async function trackTransaction(hash: Hash, chainId: number) {
  try {
    const r = await getClient(chainId).getTransactionReceipt({ hash });
    return { hash, status: r.status === "success" ? "confirmed" : "failed", blockNumber: Number(r.blockNumber), gasUsed: r.gasUsed.toString() };
  } catch {
    return { hash, status: "pending" as const }; // receipt not found yet
  }
}

export const parseAddress = (v: string) => (isAddress(v) ? (v as Address) : null);
```

## Step 4: The API

Every route takes validated input, and everything about the caller's wallet comes from the session.

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { auth, requireWallet } from "./auth";
import { getNativeBalance, getTokenBalances, ownsNft, trackTransaction } from "./onchain";

const app = new Hono<{ Variables: { walletAddress: `0x${string}` } }>();
app.route("/auth", auth);

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((v) => v as `0x${string}`);
const chainId = z.coerce.number().int().positive();

app.get("/me/balance", requireWallet, zValidator("query", z.object({ chainId })), async (c) =>
  c.json(await getNativeBalance(c.get("walletAddress"), c.req.valid("query").chainId)));

app.post("/me/tokens", requireWallet, zValidator("json", z.object({ chainId, tokens: z.array(address).max(50) })), async (c) => {
  const { chainId, tokens } = c.req.valid("json");
  return c.json(await getTokenBalances(c.get("walletAddress"), chainId, tokens));
});

app.get("/premium", requireWallet, zValidator("query", z.object({ chainId, collection: address })), async (c) => {
  const { chainId, collection } = c.req.valid("query");
  if (!(await ownsNft(c.get("walletAddress"), collection, chainId))) return c.json({ error: "NFT required" }, 403);
  return c.json({ content: "members only" });
});

app.get("/tx/:hash", zValidator("query", z.object({ chainId })), async (c) =>
  c.json(await trackTransaction(c.req.param("hash") as `0x${string}`, c.req.valid("query").chainId)));

serve({ fetch: app.fetch, port: 3001, hostname: "127.0.0.1" });
```

The server binds to `127.0.0.1`; put a TLS-terminating reverse proxy in front of it in production (the session cookie is `Secure`).

## Step 5: The browser side

wagmi's `injected()` connector covers MetaMask and other browser wallets; add `walletConnect` for mobile wallets. The sign-in button fetches a nonce, builds the message with viem's `createSiweMessage`, signs it and posts it to the server.

```tsx
import { createConfig, http, WagmiProvider, useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet, polygon, arbitrum, base, optimism } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createSiweMessage } from "viem/siwe";

export const config = createConfig({
  chains: [mainnet, polygon, arbitrum, base, optimism],
  connectors: [injected()], // MetaMask and any other EIP-1193 browser wallet
  transports: { [mainnet.id]: http(), [polygon.id]: http(), [arbitrum.id]: http(), [base.id]: http(), [optimism.id]: http() },
});
const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

export function WalletButton() {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChain } = useSwitchChain();

  async function signIn() {
    const { nonce } = await (await fetch("/auth/nonce")).json();
    const message = createSiweMessage({
      address: address!, chainId: chainId!, domain: window.location.host, nonce,
      uri: window.location.origin, version: "1", statement: "Sign in to the marketplace",
    });
    const signature = await signMessageAsync({ message });
    await fetch("/auth/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, signature }),
    });
  }

  if (!isConnected) return <button onClick={() => connect({ connector: connectors[0] })}>Connect wallet</button>;
  return (
    <div>
      <button onClick={signIn}>Sign in</button>
      <button onClick={() => switchChain({ chainId: polygon.id })}>Switch to Polygon</button>
      <button onClick={() => disconnect()}>Disconnect {address?.slice(0, 6)}</button>
    </div>
  );
}
```

## Result

- **Five chains, one code path**: the chain id selects a viem client; the frontend only calls `switchChain`.
- **Wallet login without passwords**: signature, nonce and domain are verified server-side, the nonce is single-use, and sessions live in Redis with a 24-hour expiry.
- **NFT-gated content**: `ownsNft` checks `balanceOf` on the collection contract; no third-party indexer needed for a yes/no gate.
- **Balances and receipts straight from the chain**: native and ERC-20 balances in one multicall; receipts report pending, confirmed or failed.

Before production, add rate limiting on `/auth/nonce`, cache balance reads with a short Redis TTL if traffic needs it, and use a paid RPC provider. The SIWE verification, domain mismatch rejection and RPC reads in this page were run against current viem; the wagmi component and the Redis calls were type-checked only.

## Related Skills

- [redis](../skills/redis/SKILL.md) -- single-use nonces, session storage and expiry
- [hono](../skills/hono/SKILL.md) -- the HTTP API, middleware and routing
- [zod](../skills/zod/SKILL.md) -- validating addresses, chain ids and request bodies
