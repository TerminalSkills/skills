---
name: wagmi
description: >-
  wagmi is a set of React hooks for Ethereum, built on viem, for connecting
  wallets, reading contracts, sending transactions and switching chains. Use it
  when a user asks to connect wallets in React, read blockchain data in
  components, send transactions from a frontend, upgrade wagmi v2 to v3, or
  build a Web3 user interface in React or Next.js.
license: Apache-2.0
compatibility: 'wagmi 3 needs React 18+, viem 2.x, @tanstack/react-query 5 and TypeScript 5.9.3+'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/wevm/wagmi
  tags:
    - wagmi
    - viem
    - react
    - wallet
    - dapp
---

# wagmi

## Overview

wagmi provides React hooks for Ethereum: wallet connection, contract reads and writes, transaction signing and chain switching. It is built on viem (the TypeScript Ethereum library) and TanStack Query, so every read hook returns query state (`data`, `isLoading`, `refetch`) and every write hook is a mutation.

Version checked: wagmi 3.7 (peer deps: `viem` 2.x, `react` >= 18, `@tanstack/react-query` >= 5, `typescript` >= 5.9.3). If a project is on wagmi 2, `useAccount`, `connect`, `writeContract` and `useConnect().connectors` still work there; v3 renames them (see Guidelines) and keeps the old names as deprecated aliases for now.

## Instructions

### Step 1: Install and configure

```bash
npm install wagmi viem@2.x @tanstack/react-query
npm install @walletconnect/ethereum-provider   # only if you use the walletConnect connector
```

In wagmi 3, connector SDKs are optional peer dependencies: install the one your connector needs (`walletConnect` needs `@walletconnect/ethereum-provider`, `coinbaseWallet` needs `@coinbase/wallet-sdk`, `metaMask` needs `@metamask/connect-evm`, `safe` needs the Safe apps packages). `injected()` needs nothing.

```typescript
// lib/wagmi.ts
import { createConfig, http, cookieStorage, createStorage } from 'wagmi'
import { mainnet, base, arbitrum } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

export const config = createConfig({
  chains: [mainnet, base, arbitrum],
  connectors: [
    injected(),
    walletConnect({ projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID! }),
  ],
  ssr: true,                                   // Next.js: avoid hydration mismatch
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL),
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
    [arbitrum.id]: http(process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL),
  },
})

declare module 'wagmi' {
  interface Register { config: typeof config }  // makes hooks infer your chains
}
```

`http()` with no URL uses the chain's public RPC, which is rate limited; put a provider URL in an env var for production. The WalletConnect project id comes from the Reown dashboard.

### Step 2: Providers

```tsx
// app/providers.tsx
'use client'
import { useState, type ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/lib/wagmi'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
```

### Step 3: Connect a wallet

```tsx
'use client'
import { useConnection, useConnect, useConnectors, useDisconnect } from 'wagmi'

export function ConnectButton() {
  const { address, isConnected } = useConnection()   // v2: useAccount()
  const { mutate: connect } = useConnect()           // v2: const { connect } = useConnect()
  const connectors = useConnectors()                 // v2: useConnect().connectors
  const { mutate: disconnect } = useDisconnect()

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
      {connectors.map((connector) => (
        <button key={connector.uid} onClick={() => connect({ connector })}>
          Connect {connector.name}
        </button>
      ))}
    </div>
  )
}
```

### Step 4: Read and write contracts

```tsx
'use client'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, parseUnits, formatUnits, type Address } from 'viem'

const USDC_BASE: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

export function UsdcBalance({ owner }: { owner: Address }) {
  const { data: balance, isLoading } = useReadContract({
    address: USDC_BASE,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
    chainId: 8453,
  })
  if (isLoading) return <p>Loading…</p>
  return <p>USDC: {balance !== undefined ? formatUnits(balance, 6) : '—'}</p>
}

export function SendUsdc({ to, amount }: { to: Address; amount: string }) {
  const { mutate: writeContract, data: hash, isPending, error } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  return (
    <>
      <button
        disabled={isPending || confirming}
        onClick={() =>
          writeContract({
            address: USDC_BASE,
            abi: erc20Abi,
            functionName: 'transfer',
            args: [to, parseUnits(amount, 6)],
            chainId: 8453,
          })
        }
      >
        {isPending ? 'Confirm in wallet…' : confirming ? 'Confirming…' : isSuccess ? 'Sent' : 'Send USDC'}
      </button>
      {error && <p role="alert">{error.message}</p>}
    </>
  )
}
```

`useSimulateContract` before `writeContract` catches reverts before the wallet prompt. Use `useWatchContractEvent` for live logs and `useSwitchChain` to move the wallet to the right network.

## Examples

### Example 1: Add wallet login to a Next.js app

**User request:** "Add a Connect Wallet button to my Next.js 15 app with MetaMask and WalletConnect, and show the ETH balance."

Install the packages from Step 1, create `lib/wagmi.ts` and `app/providers.tsx`, wrap `app/layout.tsx` children in `<Providers>`, and render `ConnectButton`. For the balance, `const { address } = useConnection(); const { data } = useBalance({ address })` then show `data?.formatted`-style output with `formatUnits(data.value, data.decimals)`. Result: the button lists "Connect Injected" and "Connect WalletConnect"; after connecting it shows `0x71C7…976F` and the balance, with no hydration warning thanks to `ssr: true` and cookie storage.

### Example 2: Upgrade a wagmi 2 project to 3

**User request:** "We are on wagmi 2.x, bump it to 3 and fix the build."

Run `npm install wagmi@3 viem@2 @tanstack/react-query@5` and raise `typescript` to 5.9.3 or newer. Install the connector SDKs your config uses. Rename `useAccount` to `useConnection`, `useAccountEffect` to `useConnectionEffect`, `useSwitchAccount` to `useSwitchConnection`; change `const { connect } = useConnect()` to `const { mutate: connect } = useConnect()` (same for `writeContract`, `disconnect`, `switchChain`), and replace `useConnect().connectors` with `useConnectors()` and `useSwitchChain().chains` with `useChains()`. Run `npx tsc --noEmit`; deprecated names still compile but are flagged.

## Guidelines

- Always handle the wrong-network case: pass `chainId` to hooks, and offer `useSwitchChain` when the wallet is on another chain.
- Never hard-code RPC keys in client code; use env vars and a provider allowlist, because `NEXT_PUBLIC_*` values are public.
- Amounts are `bigint` in token units: use `parseUnits` and `formatUnits` with the token's decimals (USDC has 6, not 18).
- Contract hooks are only fully typed when the ABI is declared `as const` (or comes from `viem`'s exported ABIs or `@wagmi/cli` codegen).
- Import `type Address` from viem and type addresses as `0x${string}`.
- Use viem directly (`createPublicClient`) for server-side reads; hooks need a client component.
- Add RainbowKit, ConnectKit or Reown AppKit if you need a ready-made wallet modal; they track wagmi's major versions, so check compatibility before upgrading.
