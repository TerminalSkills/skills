---
name: ethers-js
description: >-
  ethers.js is a JavaScript/TypeScript library for reading Ethereum and EVM chains, signing and sending transactions, and calling smart contracts. Use when a user
  asks to connect to Ethereum, read blockchain data, send transactions, interact
  with smart contracts, or build a dApp frontend.
license: Apache-2.0
compatibility: 'ethers v6 (6.17), Node.js 14+ or a modern browser; ESM or CommonJS'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/ethers-io/ethers.js
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

ethers v6 is the current major version. It uses native `bigint` (no `BigNumber`), and the v5 `ethers.providers.*` and `ethers.utils.*` namespaces are gone: write `ethers.JsonRpcProvider`, `ethers.parseEther`, `ethers.formatUnits`.

### Step 2: Read blockchain data

```typescript
// lib/ethereum.ts: read-only access
import { ethers } from 'ethers'

const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL!) // e.g. an Alchemy or Infura mainnet URL

const balance = await provider.getBalance('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
console.log(ethers.formatEther(balance))      // "12.5" (a string; balance itself is a bigint)

const blockNumber = await provider.getBlockNumber()
const tx = await provider.getTransaction(txHash)   // null if the hash is unknown
```

Addresses with mixed case must have a valid EIP-55 checksum or ethers throws "bad address checksum"; use `ethers.getAddress(addr)` to validate or normalize, and all-lowercase input is accepted.

### Step 3: Interact with smart contracts

```typescript
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' // USDC on Ethereum mainnet
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]

const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider)
const raw = await usdc.balanceOf('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
const decimals = await usdc.decimals()           // bigint 6n
console.log(ethers.formatUnits(raw, decimals))    // "1000.0"

// past events (most RPC providers cap the block range per call)
const logs = await usdc.queryFilter(usdc.filters.Transfer(), 21_000_000, 21_000_100)
```

### Step 4: Send transactions

```typescript
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
const usdcWithSigner = usdc.connect(wallet) as ethers.Contract

const tx = await usdcWithSigner.transfer(
  '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
  ethers.parseUnits('100', 6)    // 100 USDC (6 decimals)
)
const receipt = await tx.wait()  // resolves when mined; receipt.status === 1 means success
console.log('TX hash:', tx.hash, 'block', receipt?.blockNumber)
```

Simulate first when in doubt: `await usdcWithSigner.transfer.staticCall(to, amount)` throws the revert reason without spending gas, and `await usdcWithSigner.transfer.estimateGas(to, amount)` returns the gas as a `bigint`. To send plain ETH use `wallet.sendTransaction({ to, value: ethers.parseEther('0.01') })`.

### Step 5: Frontend (MetaMask)

```typescript
const provider = new ethers.BrowserProvider(window.ethereum)
const signer = await provider.getSigner()        // prompts the user to connect
const address = await signer.getAddress()
const signature = await signer.signMessage('Sign in to Example DEX')   // verify server-side with ethers.verifyMessage(message, signature)
```

## Examples

### Example 1: Check a wallet's ETH and USDC balance

**User request:** "Show the ETH and USDC balance of vitalik.eth"

```typescript
const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL!)
const address = await provider.resolveName('vitalik.eth')   // ENS lookup, mainnet only
const eth = await provider.getBalance(address!)
const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider)
console.log(ethers.formatEther(eth), 'ETH')
console.log(ethers.formatUnits(await usdc.balanceOf(address), 6), 'USDC')
```

**Result:** two lines such as `12.5 ETH` and `1000.0 USDC`; values are read-only and need no key.

### Example 2: Watch incoming USDC transfers

**User request:** "Log every USDC transfer to my deposit address as it happens"

```typescript
const ws = new ethers.WebSocketProvider(process.env.ETH_WS_URL!)
const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, ws)
await usdc.on(usdc.filters.Transfer(null, '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B'), (from, to, value, event) => {
  console.log(`${from} sent ${ethers.formatUnits(value, 6)} USDC in tx ${event.log.transactionHash}`)
})
```

**Result:** one log line per incoming transfer. Wait for several confirmations before crediting a deposit, because recent blocks can reorganize.

## Guidelines

- Use v6 syntax only; do not mix in v5 snippets (`BigNumber`, `ethers.utils`, `Web3Provider`).
- Money amounts are `bigint`: never convert with `Number()`; use `parseUnits`/`formatUnits` with the token's real decimals.
- Keep private keys in environment variables or a secrets manager, never in frontend code or git; in browsers use `BrowserProvider` so the user's wallet signs.
- Use a hosted RPC provider (Alchemy, Infura, QuickNode) and keep its URL in an environment variable; free tiers rate-limit `getLogs` ranges.
- Always `await tx.wait()` before reporting success, and check `receipt.status`; `tx.hash` only means the node accepted the transaction.
- Test on a testnet (Sepolia) or a local fork before mainnet, and simulate with `staticCall` before sending value.
