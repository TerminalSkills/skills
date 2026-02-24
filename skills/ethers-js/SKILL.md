---
name: ethers-js
description: >-
  Interact with Ethereum and EVM blockchains using ethers.js. Use when a user
  asks to connect to Ethereum, read blockchain data, send transactions, interact
  with smart contracts, or build a dApp frontend.
license: Apache-2.0
compatibility: 'Node.js, browsers'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - ethers
    - ethereum
    - web3
    - blockchain
    - smart-contracts
---

# ethers.js

## Overview

ethers.js is the most popular library for interacting with Ethereum and EVM-compatible blockchains (Polygon, Arbitrum, Base, BSC). It handles wallet connections, contract interactions, transaction signing, and blockchain queries.

## Instructions

### Step 1: Setup

```bash
npm install ethers
```

### Step 2: Read Blockchain Data

```typescript
// lib/ethereum.ts — Read-only blockchain access
import { ethers } from 'ethers'

// Connect to Ethereum (read-only)
const provider = new ethers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY')

// Get ETH balance
const balance = await provider.getBalance('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18')
console.log(ethers.formatEther(balance))    // "1.234"

// Get current block
const block = await provider.getBlockNumber()

// Get transaction
const tx = await provider.getTransaction('0x...')
```

### Step 3: Interact with Smart Contracts

```typescript
// Read from a contract (no wallet needed)
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
]

const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider)
const balance = await usdc.balanceOf('0x...')
const decimals = await usdc.decimals()
console.log(ethers.formatUnits(balance, decimals))    // "1000.00"
```

### Step 4: Send Transactions

```typescript
// Write to blockchain (needs wallet)
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
const usdcWithSigner = usdc.connect(wallet)

// Transfer USDC
const tx = await usdcWithSigner.transfer(
  '0xRecipient...',
  ethers.parseUnits('100', 6)    // 100 USDC (6 decimals)
)
await tx.wait()    // wait for confirmation
console.log('TX hash:', tx.hash)
```

### Step 5: Frontend (MetaMask)

```typescript
// Connect to user's MetaMask wallet
const provider = new ethers.BrowserProvider(window.ethereum)
const signer = await provider.getSigner()
const address = await signer.getAddress()
```

## Guidelines

- ethers.js v6 is current — v5 syntax is different (avoid mixing).
- Never expose private keys in frontend code — use MetaMask/WalletConnect for user wallets.
- Use Alchemy, Infura, or QuickNode as RPC providers — don't run your own node unless needed.
- Always `await tx.wait()` before confirming success — `tx.hash` alone doesn't mean it's mined.
