---
title: "Build a DeFi Yield Dashboard"
description: "Track your DeFi positions across Aave, Compound, Uniswap, and Curve in one place. Calculate total portfolio value, current APY, daily yield, impermanent loss, and get alerts when yield drops or liquidation risk rises."
skills: [wagmi, prisma]
difficulty: advanced
time_estimate: "7 hours"
tags: [defi, web3, ethereum, yield, aave, uniswap, portfolio, dashboard]
---

# Build a DeFi Yield Dashboard

$100k across 10 protocols. Six browser tabs. Three spreadsheets. **Never again.**

You need a single dashboard that pulls all your positions, calculates real APY, tracks impermanent loss, and warns you before you get liquidated.

## Who This Is For

A DeFi power user with significant capital deployed across multiple protocols. You're not a developer by trade but you can run TypeScript. You want data, not vibes.

## What You'll Build

- 📊 Position aggregator — Aave, Compound, Uniswap v3, Curve
- 💰 Portfolio value — total in USD, broken down by protocol
- 📈 APY calculator — current and 7-day average
- 🔄 Historical tracking — chart yield over time
- ⚠️ Risk metrics — liquidation health factor, impermanent loss
- 🚨 Alerts — yield drop below threshold, liquidation risk

## Prerequisites

- Alchemy API key (for on-chain reads)
- The Graph API key (for subgraph queries)
- PostgreSQL database
- Your wallet address(es)

---

## Step 1: Database Schema

```prisma
// schema.prisma
model WalletPosition {
  id           String    @id @default(cuid())
  walletAddr   String
  protocol     String    // "aave" | "compound" | "uniswap" | "curve"
  chain        String    // "ethereum" | "polygon" | "arbitrum"
  poolId       String?   // Uniswap NFT token ID or Curve pool address
  token0       String
  token1       String?
  valueUSD     Float
  apy          Float
  dailyYieldUSD Float   @default(0)
  healthFactor Float?   // Aave liquidation health
  ilPercent    Float?   // impermanent loss %
  snapshotAt   DateTime @default(now())
}

model PortfolioSnapshot {
  id          String   @id @default(cuid())
  walletAddr  String
  totalUSD    Float
  totalApy    Float    // weighted average
  dailyYield  Float
  takenAt     DateTime @default(now())
}

model Alert {
  id          String   @id @default(cuid())
  walletAddr  String
  type        String   // "yield_drop" | "liquidation_risk" | "il_threshold"
  protocol    String
  message     String
  threshold   Float
  currentVal  Float
  read        Boolean  @default(false)
  createdAt   DateTime @default(now())
}
```

```bash
npx prisma migrate dev --name init
```

---

## Step 2: Fetch Aave Positions

```typescript
// lib/protocols/aave.ts
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const AAVE_DATA_PROVIDER = '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3';
const DATA_PROVIDER_ABI = [/* abbreviated — use @aave/contract-helpers */] as const;

const client = createPublicClient({
  chain: mainnet,
  transport: http(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`)
});

export async function getAavePositions(walletAddr: string) {
  // Use Aave subgraph for richer data
  const query = `{
    user(id: "${walletAddr.toLowerCase()}") {
      reserves {
        currentATokenBalance
        currentVariableDebt
        currentStableDebt
        reserve {
          symbol
          underlyingAsset
          liquidityRate
          variableBorrowRate
          price { priceInEth }
        }
      }
      healthFactor
    }
  }`;

  const res = await fetch('https://api.thegraph.com/subgraphs/name/aave/protocol-v3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });

  const { data } = await res.json();
  const user = data?.user;
  if (!user) return [];

  const ethPrice = await getETHPrice();
  const healthFactor = parseFloat(user.healthFactor) / 1e18;

  return user.reserves
    .filter((r: any) => parseFloat(r.currentATokenBalance) > 0)
    .map((r: any) => ({
      protocol: 'aave',
      token0: r.reserve.symbol,
      valueUSD: parseFloat(r.currentATokenBalance) * parseFloat(r.reserve.price.priceInEth) * ethPrice / 1e18,
      apy: parseFloat(r.reserve.liquidityRate) / 1e25, // ray to percentage
      healthFactor,
    }));
}

async function getETHPrice(): Promise<number> {
  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
  const { ethereum } = await res.json();
  return ethereum.usd;
}
```

---

## Step 3: Fetch Uniswap v3 Positions + Impermanent Loss

```typescript
// lib/protocols/uniswap.ts

export async function getUniswapPositions(walletAddr: string) {
  const query = `{
    positions(where: { owner: "${walletAddr.toLowerCase()}", liquidity_gt: "0" }) {
      id
      pool { token0 { symbol } token1 { symbol } feeTier sqrtPrice }
      liquidity
      depositedToken0
      depositedToken1
      withdrawnToken0
      withdrawnToken1
      collectedFeesToken0
      collectedFeesToken1
      token0 { symbol decimals }
      token1 { symbol decimals }
      tickLower { tickIdx }
      tickUpper { tickIdx }
    }
  }`;

  const res = await fetch('https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });

  const { data } = await res.json();

  return (data?.positions ?? []).map((pos: any) => {
    const deposited0 = parseFloat(pos.depositedToken0);
    const deposited1 = parseFloat(pos.depositedToken1);
    const current0 = parseFloat(pos.withdrawnToken0) + parseFloat(pos.collectedFeesToken0);
    const current1 = parseFloat(pos.withdrawnToken1) + parseFloat(pos.collectedFeesToken1);

    // Simplified IL estimate
    const ratio = deposited1 > 0 ? deposited0 / deposited1 : 1;
    const currentRatio = current1 > 0 ? current0 / current1 : ratio;
    const priceDelta = currentRatio / ratio;
    const ilPercent = (2 * Math.sqrt(priceDelta) / (1 + priceDelta) - 1) * 100;

    return {
      protocol: 'uniswap',
      poolId: pos.id,
      token0: pos.token0.symbol,
      token1: pos.token1.symbol,
      valueUSD: 0, // Would calculate from sqrtPrice + liquidity
      apy: 0,      // Would estimate from fee tier + volume
      ilPercent: Math.abs(ilPercent),
    };
  });
}
```

---

## Step 4: Aggregate and Store Snapshot

```typescript
// lib/aggregator.ts
import { prisma } from './prisma';
import { getAavePositions } from './protocols/aave';
import { getUniswapPositions } from './protocols/uniswap';

export async function snapshotPortfolio(walletAddr: string) {
  const [aavePositions, uniPositions] = await Promise.all([
    getAavePositions(walletAddr),
    getUniswapPositions(walletAddr),
  ]);

  const allPositions = [...aavePositions, ...uniPositions];

  // Persist positions
  for (const pos of allPositions) {
    await prisma.walletPosition.create({
      data: {
        walletAddr,
        protocol: pos.protocol,
        chain: 'ethereum',
        poolId: pos.poolId,
        token0: pos.token0,
        token1: pos.token1 ?? '',
        valueUSD: pos.valueUSD,
        apy: pos.apy,
        dailyYieldUSD: pos.valueUSD * pos.apy / 365,
        healthFactor: pos.healthFactor,
        ilPercent: pos.ilPercent,
      }
    });
  }

  const totalUSD = allPositions.reduce((sum, p) => sum + p.valueUSD, 0);
  const totalDailyYield = allPositions.reduce((sum, p) => sum + p.valueUSD * p.apy / 365, 0);
  const weightedApy = totalUSD > 0
    ? allPositions.reduce((sum, p) => sum + p.apy * p.valueUSD, 0) / totalUSD
    : 0;

  await prisma.portfolioSnapshot.create({
    data: { walletAddr, totalUSD, totalApy: weightedApy, dailyYield: totalDailyYield }
  });

  return { totalUSD, totalApy: weightedApy, totalDailyYield, positions: allPositions };
}
```

---

## Step 5: Alert Engine

```typescript
// lib/alerts.ts
import { prisma } from './prisma';

export async function checkRiskAlerts(walletAddr: string) {
  const positions = await prisma.walletPosition.findMany({
    where: { walletAddr },
    orderBy: { snapshotAt: 'desc' },
    distinct: ['protocol', 'token0'],
    take: 20,
  });

  for (const pos of positions) {
    // Liquidation risk: Aave health factor < 1.2
    if (pos.healthFactor && pos.healthFactor < 1.2) {
      await prisma.alert.create({
        data: {
          walletAddr, type: 'liquidation_risk', protocol: pos.protocol,
          message: `⚠️ Aave health factor is ${pos.healthFactor.toFixed(2)} — you may get liquidated below 1.0!`,
          threshold: 1.2, currentVal: pos.healthFactor,
        }
      });
    }

    // High IL: > 5%
    if (pos.ilPercent && pos.ilPercent > 5) {
      await prisma.alert.create({
        data: {
          walletAddr, type: 'il_threshold', protocol: pos.protocol,
          message: `Uniswap ${pos.token0}/${pos.token1} IL is ${pos.ilPercent.toFixed(1)}%`,
          threshold: 5, currentVal: pos.ilPercent,
        }
      });
    }
  }
}
```

---

## Dashboard UI (React/wagmi)

```typescript
// components/YieldDashboard.tsx
import { useAccount } from 'wagmi';
import { useEffect, useState } from 'react';

export function YieldDashboard() {
  const { address } = useAccount();
  const [portfolio, setPortfolio] = useState<any>(null);

  useEffect(() => {
    if (address) fetch(`/api/portfolio?wallet=${address}`).then(r => r.json()).then(setPortfolio);
  }, [address]);

  if (!portfolio) return <p>Loading positions...</p>;

  return (
    <div>
      <h2>Total: ${portfolio.totalUSD.toLocaleString()}</h2>
      <p>Weighted APY: {(portfolio.totalApy * 100).toFixed(2)}%</p>
      <p>Daily Yield: ${portfolio.totalDailyYield.toFixed(2)}</p>
      {portfolio.positions.map((pos: any) => (
        <div key={`${pos.protocol}-${pos.token0}`}>
          <strong>{pos.protocol.toUpperCase()}</strong> — {pos.token0}{pos.token1 ? `/${pos.token1}` : ''}
          <span> ${pos.valueUSD.toFixed(0)} @ {(pos.apy * 100).toFixed(2)}% APY</span>
          {pos.healthFactor && <span style={{ color: pos.healthFactor < 1.5 ? 'red' : 'green' }}> HF: {pos.healthFactor.toFixed(2)}</span>}
          {pos.ilPercent && <span> IL: {pos.ilPercent.toFixed(1)}%</span>}
        </div>
      ))}
    </div>
  );
}
```

---

## Next Steps

- Add Curve and Convex position tracking
- Implement historical yield charts with Recharts or Tremor
- Schedule hourly snapshots with cron and visualize APY trends
- Add Telegram/Discord alerts for critical risk events
- Support Arbitrum, Optimism, and Base chains
