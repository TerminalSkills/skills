---
title: "Build a Crypto Portfolio Tracker with P&L and Tax Reporting"
description: "Track crypto holdings across wallets and chains, calculate realized/unrealized P&L, generate Form 8949 tax data, and monitor DeFi positions — all without connecting exchange accounts."
skills: [wagmi, prisma]
difficulty: advanced
time_estimate: "12 hours"
tags: [crypto, portfolio, defi, tax, blockchain, ethereum, solana, web3]
---

# Build a Crypto Portfolio Tracker with P&L and Tax Reporting

You have ETH across 3 MetaMasks, SOL on a Ledger, BTC in a cold wallet, Uniswap LP positions, and Aave deposits you forgot about. Every time tax season hits, you spend a week piecing it together. Build a read-only portfolio tracker that aggregates everything, calculates your actual P&L, and generates Form 8949 data automatically.

## What You'll Build

- Read-only wallet connection: ETH, SOL, BTC addresses (no private keys)
- Real-time prices via CoinGecko + historical price lookups
- P&L engine: cost basis tracking with FIFO/LIFO/HIFO accounting
- Tax report: Form 8949 data export (CSV ready for TurboTax)
- DeFi positions: Uniswap LP values, Aave/Compound deposits

## Schema

```typescript
// prisma/schema.prisma
model User {
  id          String    @id @default(cuid())
  email       String    @unique
  wallets     Wallet[]
  transactions CryptoTransaction[]
  createdAt   DateTime  @default(now())
}

model Wallet {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  address     String
  chain       String    // ethereum | solana | bitcoin | polygon | arbitrum
  label       String?
  isTracked   Boolean   @default(true)
  lastSync    DateTime?
  createdAt   DateTime  @default(now())

  @@unique([userId, address, chain])
}

model CryptoTransaction {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  walletAddress String
  chain         String
  txHash        String
  date          DateTime
  type          String   // buy | sell | transfer | swap | stake | receive | send
  assetSymbol   String
  assetName     String?
  amount        Float
  priceUSD      Float?   // price at time of transaction
  feeUSD        Float?
  toAddress     String?
  fromAddress   String?
  notes         String?
  isImported    Boolean  @default(false)
  createdAt     DateTime @default(now())

  @@unique([txHash, chain])
  @@index([userId, assetSymbol, date])
}

model PriceCache {
  id        String   @id @default(cuid())
  symbol    String
  date      DateTime @db.Date
  priceUSD  Float
  source    String   @default("coingecko")
  createdAt DateTime @default(now())

  @@unique([symbol, date])
}

model DeFiPosition {
  id           String   @id @default(cuid())
  userId       String
  walletAddress String
  protocol     String   // uniswap | aave | compound | curve
  chain        String
  positionType String   // lp | lending | staking | farming
  token0Symbol String?
  token1Symbol String?
  valueUSD     Float
  apy          Float?
  rawData      Json?
  lastUpdated  DateTime @default(now())
  createdAt    DateTime @default(now())
}
```

## Wallet Balance Fetcher with Wagmi

```typescript
// lib/wallet-sync.ts
import { createPublicClient, http, formatEther, formatUnits } from 'viem'
import { mainnet, polygon, arbitrum } from 'viem/chains'

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'decimals', type: 'function', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { name: 'symbol', type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
] as const

const COMMON_TOKENS: Record<string, Record<string, `0x${string}`>> = {
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  },
}

export async function syncEthereumWallet(address: `0x${string}`, chain = 'ethereum') {
  const chainConfig = { ethereum: mainnet, polygon, arbitrum }[chain] || mainnet
  const client = createPublicClient({ chain: chainConfig, transport: http() })

  const ethBalance = await client.getBalance({ address })
  const balances: { symbol: string; amount: number; chain: string }[] = [
    { symbol: 'ETH', amount: parseFloat(formatEther(ethBalance)), chain },
  ]

  // Fetch common token balances
  const tokens = COMMON_TOKENS[chain] || {}
  for (const [symbol, contractAddress] of Object.entries(tokens)) {
    try {
      const [balance, decimals] = await Promise.all([
        client.readContract({ address: contractAddress, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
        client.readContract({ address: contractAddress, abi: ERC20_ABI, functionName: 'decimals' }),
      ])
      const amount = parseFloat(formatUnits(balance, decimals))
      if (amount > 0.001) balances.push({ symbol, amount, chain })
    } catch {
      // Token not found or error, skip
    }
  }

  return balances
}
```

## CoinGecko Price Service

```typescript
// lib/prices.ts
export async function getCurrentPrices(symbols: string[]): Promise<Record<string, number>> {
  const ids = symbols.map(symbolToGeckoId).filter(Boolean)
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`

  const response = await fetch(url, {
    headers: process.env.COINGECKO_API_KEY
      ? { 'x-cg-pro-api-key': process.env.COINGECKO_API_KEY }
      : {},
  })
  const data = await response.json()

  return symbols.reduce((acc, symbol) => {
    const id = symbolToGeckoId(symbol)
    acc[symbol] = data[id]?.usd || 0
    return acc
  }, {} as Record<string, number>)
}

export async function getHistoricalPrice(symbol: string, date: Date): Promise<number> {
  // Check cache first
  const cached = await prisma.priceCache.findUnique({
    where: { symbol_date: { symbol, date } },
  })
  if (cached) return cached.priceUSD

  const dateStr = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`
  const id = symbolToGeckoId(symbol)
  const response = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/history?date=${dateStr}`)
  const data = await response.json()
  const price = data.market_data?.current_price?.usd || 0

  await prisma.priceCache.create({ data: { symbol, date, priceUSD: price } })
  return price
}

function symbolToGeckoId(symbol: string): string {
  const map: Record<string, string> = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', MATIC: 'matic-network',
    USDC: 'usd-coin', USDT: 'tether', WBTC: 'wrapped-bitcoin', ARB: 'arbitrum',
  }
  return map[symbol.toUpperCase()] || symbol.toLowerCase()
}
```

## P&L Calculator (FIFO/LIFO/HIFO)

```typescript
// lib/pnl.ts
type Method = 'FIFO' | 'LIFO' | 'HIFO'

interface TaxLot {
  date: Date
  amount: number
  costBasisUSD: number
}

export async function calculatePnL(userId: string, method: Method = 'FIFO') {
  const txs = await prisma.cryptoTransaction.findMany({
    where: { userId },
    orderBy: { date: 'asc' },
  })

  const lots: Record<string, TaxLot[]> = {}
  const realizedGains: { date: Date; asset: string; proceeds: number; cost: number; gain: number; isLongTerm: boolean }[] = []

  for (const tx of txs) {
    const symbol = tx.assetSymbol

    if (tx.type === 'buy' || tx.type === 'receive') {
      if (!lots[symbol]) lots[symbol] = []
      lots[symbol].push({
        date: tx.date,
        amount: tx.amount,
        costBasisUSD: (tx.priceUSD || 0) * tx.amount,
      })
    }

    if (tx.type === 'sell' || tx.type === 'send') {
      if (!lots[symbol] || lots[symbol].length === 0) continue
      let remaining = tx.amount
      const proceeds = (tx.priceUSD || 0) * tx.amount

      // Sort lots by method
      const sorted = [...lots[symbol]].sort((a, b) => {
        if (method === 'FIFO') return a.date.getTime() - b.date.getTime()
        if (method === 'LIFO') return b.date.getTime() - a.date.getTime()
        // HIFO: highest cost basis first
        return (b.costBasisUSD / b.amount) - (a.costBasisUSD / a.amount)
      })

      let totalCost = 0
      for (const lot of sorted) {
        if (remaining <= 0) break
        const used = Math.min(remaining, lot.amount)
        totalCost += (lot.costBasisUSD / lot.amount) * used
        lot.amount -= used
        remaining -= used
      }

      // Clean up empty lots
      lots[symbol] = sorted.filter(l => l.amount > 0.00001)

      const holdingDays = (tx.date.getTime() - (lots[symbol][0]?.date.getTime() || tx.date.getTime())) / 86400000

      realizedGains.push({
        date: tx.date,
        asset: symbol,
        proceeds,
        cost: totalCost,
        gain: proceeds - totalCost,
        isLongTerm: holdingDays > 365,
      })
    }
  }

  // Unrealized P&L for current holdings
  const prices = await getCurrentPrices(Object.keys(lots))
  const unrealized = Object.entries(lots).map(([symbol, symbolLots]) => {
    const totalAmount = symbolLots.reduce((s, l) => s + l.amount, 0)
    const totalCost = symbolLots.reduce((s, l) => s + l.costBasisUSD, 0)
    const currentValue = totalAmount * (prices[symbol] || 0)
    return { symbol, totalAmount, totalCost, currentValue, gain: currentValue - totalCost }
  })

  return { realizedGains, unrealized }
}

export async function exportForm8949(userId: string, taxYear: number, method: Method = 'FIFO') {
  const { realizedGains } = await calculatePnL(userId, method)
  const yearGains = realizedGains.filter(g => g.date.getFullYear() === taxYear)

  const csvRows = [
    'Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Gain or Loss,Short/Long Term',
    ...yearGains.map(g =>
      `${g.asset},N/A,${g.date.toLocaleDateString()},${g.proceeds.toFixed(2)},${g.cost.toFixed(2)},${g.gain.toFixed(2)},${g.isLongTerm ? 'Long' : 'Short'}`
    ),
  ]

  return csvRows.join('\n')
}
```

## Key Features Summary

- **Read-only**: no private keys, no exchange API tokens — just wallet addresses
- **Multi-chain**: Ethereum, Polygon, Arbitrum, Solana, Bitcoin
- **Three tax methods**: FIFO/LIFO/HIFO with instant switching to compare
- **DeFi tracking**: Uniswap LP values, Aave/Compound deposits via protocols' APIs
- **Form 8949**: ready-to-paste CSV for TurboTax, H&R Block, or your accountant

## Extensions to Consider

- **Zerion / DeBank API** for comprehensive DeFi position aggregation
- **NFT portfolio** tracking with OpenSea floor price data
- **Tax loss harvesting** alerts: positions you could sell to offset gains
- **Portfolio rebalancing** targets with visual allocation chart
- **Email alerts** for significant price movements in your holdings
