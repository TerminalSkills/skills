---
name: wagmi
description: >-
  Build React dApps with wagmi and viem. Use when a user asks to connect
  wallets in React, read blockchain data in components, send transactions from
  a frontend, or build a Web3 user interface.
license: Apache-2.0
compatibility: 'React 18+, Next.js'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - wagmi
    - viem
    - react
    - wallet
    - dapp
---

# wagmi

## Overview

wagmi provides React hooks for Ethereum — wallet connection, contract reads/writes, transaction signing, and chain switching. Built on viem (TypeScript Ethereum library). The standard for building React dApp frontends.

## Instructions

### Step 1: Setup

```bash
npm install wagmi viem @tanstack/react-query
npm install @rainbow-me/rainbowkit    # optional: beautiful wallet modal
```

```typescript
// lib/wagmi.ts — wagmi configuration
import { createConfig, http } from 'wagmi'
import { mainnet, polygon, arbitrum } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

export const config = createConfig({
  chains: [mainnet, polygon, arbitrum],
  connectors: [
    injected(),    // MetaMask, Coinbase Wallet, etc.
    walletConnect({ projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID! }),
  ],
  transports: {
    [mainnet.id]: http('https://eth-mainnet.g.alchemy.com/v2/KEY'),
    [polygon.id]: http('https://polygon-mainnet.g.alchemy.com/v2/KEY'),
    [arbitrum.id]: http('https://arb-mainnet.g.alchemy.com/v2/KEY'),
  },
})
```

### Step 2: Provider Setup

```tsx
// app/providers.tsx — Wrap app with wagmi providers
'use client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/lib/wagmi'

const queryClient = new QueryClient()

export function Providers({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

### Step 3: Connect Wallet

```tsx
// components/ConnectButton.tsx — Wallet connection
import { useAccount, useConnect, useDisconnect } from 'wagmi'

export function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected) {
    return (
      <div>
        <p>{address?.slice(0, 6)}...{address?.slice(-4)}</p>
        <button onClick={() => disconnect()}>Disconnect</button>
      </div>
    )
  }

  return (
    <div>
      {connectors.map(connector => (
        <button key={connector.id} onClick={() => connect({ connector })}>
          Connect {connector.name}
        </button>
      ))}
    </div>
  )
}
```

### Step 4: Read and Write Contracts

```tsx
// components/TokenBalance.tsx — Read contract data
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, parseUnits } from 'viem'

function TokenBalance({ tokenAddress, userAddress }) {
  const { data: balance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [userAddress],
  })
  return <p>Balance: {balance?.toString()}</p>
}

function TransferButton({ tokenAddress, to, amount }) {
  const { writeContract, data: hash } = useWriteContract()
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash })

  return (
    <button
      onClick={() => writeContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, parseUnits(amount, 6)],
      })}
      disabled={isLoading}
    >
      {isLoading ? 'Confirming...' : isSuccess ? 'Sent!' : 'Transfer'}
    </button>
  )
}
```

## Guidelines

- wagmi v2 uses TanStack Query under the hood — same caching and refetching patterns.
- Use RainbowKit for a polished wallet connection UI with minimal code.
- Always handle chain switching — users might be on the wrong network.
- viem is wagmi's low-level library — use it for server-side Ethereum interactions.
