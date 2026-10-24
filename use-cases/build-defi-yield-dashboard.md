---
title: "Build a DeFi Yield Dashboard"
description: "Track your DeFi positions across Aave and Uniswap v3 in one place by reading the contracts directly. Calculate portfolio value, current APY and daily yield, impermanent loss, and get alerts when liquidation risk rises."
skills: [wagmi, prisma]
difficulty: advanced
time_estimate: "7 hours"
tags: [defi, web3, ethereum, yield, aave, uniswap, portfolio, dashboard]
---

# Build a DeFi Yield Dashboard

$100k across 10 protocols. Six browser tabs. Three spreadsheets. **Never again.**

You need a single dashboard that pulls all your positions, calculates real APY, tracks impermanent loss, and warns you before you get liquidated.

## What You'll Build

- Position aggregator for Aave v3 and Uniswap v3 on Ethereum, valued in USD with the Aave oracle
- Supply APY, daily yield, and snapshots in PostgreSQL ready to chart
- Risk metrics (Aave health factor, impermanent loss) and a health-factor alert

## Prerequisites

- An Ethereum JSON-RPC URL (Alchemy, Infura, or any provider), exported as `ETH_RPC_URL`
- PostgreSQL (`DATABASE_URL`), Node.js 22+ and your wallet address(es)

```bash
npm install viem@2 @prisma/client@7 @prisma/adapter-pg@7 pg
npm install -D prisma@7 typescript tsx @types/node @types/pg
```

## Why on-chain reads, not subgraphs

The hosted Graph endpoints (`api.thegraph.com/subgraphs/name/...`) were shut down; the Graph Network needs an API key and a URL per deployment. The Aave Pool and the Uniswap position manager answer everything this dashboard needs through plain `eth_call` reads, so there is nothing else to host or pay for. The contract addresses below are the Ethereum mainnet deployments from the Aave address book and the Uniswap docs; other chains have different addresses.

## Step 1: Database Schema

Prisma 7 moved the connection URL out of the schema into `prisma.config.ts`, and the client is generated into your project.

```typescript
// prisma.config.ts
import { defineConfig, env } from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
});
```

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}
datasource db {
  provider = "postgresql"
}
model WalletPosition {
  id            String   @id @default(cuid())
  walletAddr    String
  protocol      String   // "aave" | "uniswap"
  chain         String   @default("ethereum")
  poolId        String?  // Uniswap NFT token ID
  token0        String
  token1        String?
  valueUSD      Float
  apy           Float    // 0.031 = 3.1 %
  dailyYieldUSD Float    @default(0)
  healthFactor  Float?   // Aave account-level; null = no debt
  snapshotAt    DateTime @default(now())
  @@index([walletAddr, snapshotAt])
}
model PortfolioSnapshot {
  id         String   @id @default(cuid())
  walletAddr String
  totalUSD   Float
  totalApy   Float    // value-weighted
  dailyYield Float
  takenAt    DateTime @default(now())
}
model Alert {
  id         String   @id @default(cuid())
  walletAddr String
  type       String   // "liquidation_risk" | "il_threshold"
  protocol   String
  message    String
  threshold  Float
  currentVal Float
  read       Boolean  @default(false)
  createdAt  DateTime @default(now())
}
```

```bash
npx prisma migrate dev --name init   # also generates the client
```
Create the client in `lib/prisma.ts` with the Postgres adapter: `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })`, importing `PrismaClient` from `../generated/prisma/client` and `PrismaPg` from `@prisma/adapter-pg`.

## Step 2: Fetch Aave v3 Positions

`getUserAccountData` returns USD totals (8 decimals) and the health factor (18 decimals; it is `2^256-1` when you have no debt). A supply position is your aToken balance times the Aave oracle price, and the supply rate comes from `getReserveData`.

```typescript
// lib/client.ts
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
export const client = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETH_RPC_URL), // Alchemy, Infura or any Ethereum RPC URL
});
```

```typescript
// lib/protocols/aave.ts — Aave v3 Ethereum, read straight from the contracts
import { erc20Abi, formatUnits, maxUint256, parseAbi, type Address } from 'viem';
import { client } from '../client';
export const POOL = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2' as const;
export const ORACLE = '0x54586bE62E3c3580375aE3723C145253060Ca0C2' as const;
const poolAbi = parseAbi([
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function getReserveData(address asset) view returns ((uint256 data) configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt)',
]);
const oracleAbi = parseAbi(['function getAssetPrice(address asset) view returns (uint256)']);
export async function usdPrice(asset: Address): Promise<number> {
  const p = await client.readContract({ address: ORACLE, abi: oracleAbi, functionName: 'getAssetPrice', args: [asset] });
  return Number(formatUnits(p, 8)); // Aave oracle prices are USD with 8 decimals
}
/** Account-level numbers: collateral, debt and the liquidation health factor. */
export async function getAaveAccount(user: Address) {
  const [collateral, debt, , , , hf] = await client.readContract({
    address: POOL, abi: poolAbi, functionName: 'getUserAccountData', args: [user],
  });
  // With no debt Aave returns 2^256-1: treat that as "no liquidation risk".
  return { collateralUSD: Number(formatUnits(collateral, 8)), debtUSD: Number(formatUnits(debt, 8)), healthFactor: hf === maxUint256 ? null : Number(formatUnits(hf, 18)) };
}
/** One supplied asset: aToken balance x oracle price, and the supply APR. */
export async function getAaveSupply(user: Address, asset: Address) {
  const r = await client.readContract({ address: POOL, abi: poolAbi, functionName: 'getReserveData', args: [asset] });
  const [balance, decimals, symbol, price] = await Promise.all([
    client.readContract({ address: r[8], abi: erc20Abi, functionName: 'balanceOf', args: [user] }),
    client.readContract({ address: asset, abi: erc20Abi, functionName: 'decimals' }),
    client.readContract({ address: asset, abi: erc20Abi, functionName: 'symbol' }),
    usdPrice(asset),
  ]);
  const apr = Number(r[2]) / 1e27; // liquidity rate is a ray (1e27), a yearly rate
  const apy = (1 + apr / 31_536_000) ** 31_536_000 - 1; // Aave compounds per second
  return { protocol: 'aave', token0: symbol, valueUSD: Number(formatUnits(balance, decimals)) * price, apy };
}
```

## Step 3: Fetch Uniswap v3 Positions + Impermanent Loss

Each v3 position is an NFT. Enumerate your NFTs, read the range and liquidity, read the pool price from `slot0`, and convert liquidity into token amounts. Prices come from the Aave oracle, so this version values pools whose tokens are both listed on Aave v3. Fee APY needs volume data and is left at 0 here.

```typescript
// lib/protocols/uniswap.ts — Uniswap v3 positions (NFTs) on Ethereum, read from the contracts
import { formatUnits, parseAbi, erc20Abi, type Address } from 'viem';
import { client } from '../client';
import { usdPrice } from './aave';
const NPM = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88' as const; // NonfungiblePositionManager
const FACTORY = '0x1F98431c8aD98523631AE4a59f267346ea31F984' as const;
const npmAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
]);
const factoryAbi = parseAbi(['function getPool(address a, address b, uint24 fee) view returns (address)']);
const poolAbi = parseAbi(['function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)']);
const Q96 = 2 ** 96;
const tickToSqrt = (tick: number) => 1.0001 ** (tick / 2);
/** Token amounts held by a v3 position (Uniswap v3 whitepaper formulas, floating point is fine for a dashboard). */
function amounts(liquidity: number, sqrtP: number, tickLower: number, tickUpper: number) {
  const a = tickToSqrt(tickLower), b = tickToSqrt(tickUpper);
  if (sqrtP <= a) return [liquidity * (1 / a - 1 / b), 0];
  if (sqrtP >= b) return [0, liquidity * (b - a)];
  return [liquidity * (1 / sqrtP - 1 / b), liquidity * (sqrtP - a)];
}
/** Full-range IL approximation from the price ratio since entry: 2*sqrt(r)/(1+r) - 1 (concentrated ranges lose more). */
export const impermanentLossPct = (priceNow: number, priceAtEntry: number) => {
  const r = priceNow / priceAtEntry;
  return (2 * Math.sqrt(r) / (1 + r) - 1) * 100;
};
export async function getUniswapPositions(owner: Address) {
  const count = await client.readContract({ address: NPM, abi: npmAbi, functionName: 'balanceOf', args: [owner] });
  const out = [];
  for (let i = 0n; i < count; i++) {
    const id = await client.readContract({ address: NPM, abi: npmAbi, functionName: 'tokenOfOwnerByIndex', args: [owner, i] });
    const [, , t0, t1, fee, lo, hi, liq, , , owed0, owed1] = await client.readContract({ address: NPM, abi: npmAbi, functionName: 'positions', args: [id] });
    if (liq === 0n) continue; // closed position
    const pool = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'getPool', args: [t0, t1, fee] });
    const [sqrtPriceX96] = await client.readContract({ address: pool, abi: poolAbi, functionName: 'slot0' });
    const dec = (address: Address) => client.readContract({ address, abi: erc20Abi, functionName: 'decimals' });
    const sym = (address: Address) => client.readContract({ address, abi: erc20Abi, functionName: 'symbol' });
    const [d0, d1, s0, s1] = await Promise.all([dec(t0), dec(t1), sym(t0), sym(t1)]);
    const [raw0, raw1] = amounts(Number(liq), Number(sqrtPriceX96) / Q96, lo, hi);
    // Prices come from the Aave oracle, so both tokens must be listed on Aave v3 (WETH, USDC, WBTC, ...).
    const [p0, p1] = await Promise.all([usdPrice(t0), usdPrice(t1)]);
    const amt0 = Number(formatUnits(BigInt(Math.floor(raw0)) + owed0, d0));
    const amt1 = Number(formatUnits(BigInt(Math.floor(raw1)) + owed1, d1));
    out.push({ protocol: 'uniswap', poolId: id.toString(), token0: s0, token1: s1, valueUSD: amt0 * p0 + amt1 * p1, apy: 0 });
  }
  return out;
}
```
Impermanent loss cannot be read from the chain: it depends on the price when you entered. Record the price ratio when you open a position and pass it to `impermanentLossPct`. The formula is exact for full-range liquidity and understates the loss for concentrated ranges.

## Step 4: Aggregate and Store Snapshot

```typescript
// lib/aggregator.ts
import type { Address } from 'viem';
import { prisma } from './prisma';
import { getAaveAccount, getAaveSupply } from './protocols/aave';
import { getUniswapPositions } from './protocols/uniswap';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
export async function snapshotPortfolio(wallet: Address) {
  const [account, supplies, uni] = await Promise.all([
    getAaveAccount(wallet),
    Promise.all([WETH, USDC].map((a) => getAaveSupply(wallet, a as Address))),
    getUniswapPositions(wallet),
  ]);
  const positions = [
    ...supplies.filter((p) => p.valueUSD > 0.01).map((p) => ({ ...p, healthFactor: account.healthFactor })),
    ...uni,
  ];
  const totalUSD = positions.reduce((s, p) => s + p.valueUSD, 0);
  const dailyYield = positions.reduce((s, p) => s + (p.valueUSD * p.apy) / 365, 0);
  const totalApy = totalUSD > 0 ? (dailyYield * 365) / totalUSD : 0; // value-weighted
  await prisma.walletPosition.createMany({
    data: positions.map((p) => ({
      walletAddr: wallet, protocol: p.protocol, chain: 'ethereum', poolId: 'poolId' in p ? p.poolId : null,
      token0: p.token0, token1: 'token1' in p ? p.token1 : null, valueUSD: p.valueUSD, apy: p.apy,
      dailyYieldUSD: (p.valueUSD * p.apy) / 365, healthFactor: 'healthFactor' in p ? p.healthFactor : null,
    })),
  });
  await prisma.portfolioSnapshot.create({ data: { walletAddr: wallet, totalUSD, totalApy, dailyYield } });
  return { totalUSD, totalApy, dailyYield, positions };
}
```

## Step 5: Alert Engine

Alert on the account-level Aave health factor. Aave liquidates positions below 1.0, so a threshold of 1.5 leaves room to react.

```typescript
// lib/alerts.ts
import { prisma } from './prisma';
export async function checkRiskAlerts(walletAddr: string, minHealth = 1.5) {
  const latest = await prisma.walletPosition.findFirst({ where: { walletAddr, protocol: 'aave', healthFactor: { not: null } }, orderBy: { snapshotAt: 'desc' } });
  if (!latest?.healthFactor || latest.healthFactor >= minHealth) return;
  await prisma.alert.create({
    data: {
      walletAddr, type: 'liquidation_risk', protocol: 'aave',
      message: `Aave health factor is ${latest.healthFactor.toFixed(2)}. Positions are liquidated below 1.0.`,
      threshold: minHealth, currentVal: latest.healthFactor,
    },
  });
}
```

Run `snapshotPortfolio` then `checkRiskAlerts` from a cron job (hourly is plenty), and expose the result at `/api/portfolio?wallet=0x...` (validate the address with viem's `isAddress` first).

## Dashboard UI (React/wagmi)

wagmi 3 renamed `useAccount` to `useConnection` (v2 projects keep using `useAccount`).

```typescript
// components/YieldDashboard.tsx
import { useConnection } from 'wagmi';
import { useEffect, useState } from 'react';
export function YieldDashboard() {
  const { address } = useConnection();
  const [p, setP] = useState<any>(null);
  useEffect(() => {
    if (address) fetch(`/api/portfolio?wallet=${address}`).then(r => r.json()).then(setP);
  }, [address]);
  if (!p) return <p>Loading positions...</p>;
  return (
    <div>
      <h2>Total: ${p.totalUSD.toLocaleString()} at {(p.totalApy * 100).toFixed(2)}% APY</h2>
      {p.positions.map((x: any) => (
        <div key={`${x.protocol}-${x.poolId ?? x.token0}`}>
          {x.protocol.toUpperCase()} {x.token0}{x.token1 ? `/${x.token1}` : ''}: ${x.valueUSD.toFixed(0)}
          {x.healthFactor != null && ` (HF ${x.healthFactor.toFixed(2)})`}
        </div>
      ))}
    </div>
  );
}
```

## Related Skills

- [wagmi](/skills/wagmi): wallet connection and React hooks
- [prisma](/skills/prisma): schema, migrations, typed client

## Next Steps

Add Compound and Curve readers behind the same position shape, chart `PortfolioSnapshot` with Recharts, and add other chains with their own RPC URL and contract addresses.
