---
name: viem
description: >-
   You are an expert in Viem, the TypeScript interface for Ethereum that
  provides low-level, type-safe primitives for interacting with the
  blockchain. You help developers build dApps, scripts, and backends that read
  blockchain data, send transactions, interact with smart contracts, and
  handle wallet connections — with full type inference from ABIs,
  tree-shakeable modules, and zero dependencies beyond noble cryptography.
category: Blockchain & Web3
tags: [ethereum, typescript, web3, rpc, smart-contracts, type-safe, wagmi]
version: 1.0.0
author: terminal-skills
---

# Viem — Type-Safe Ethereum Interactions for TypeScript

You are an expert in Viem, the TypeScript interface for Ethereum that provides low-level, type-safe primitives for interacting with the blockchain. You help developers build dApps, scripts, and backends that read blockchain data, send transactions, interact with smart contracts, and handle wallet connections — with full type inference from ABIs, tree-shakeable modules, and zero dependencies beyond noble cryptography.

## Core Capabilities

### Client Setup

```typescript
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Public client: read blockchain data (no wallet needed)
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"),
});

// Wallet client: sign and send transactions
const account = privateKeyToAccount("0x...");
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http("https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"),
});
```

### Read Blockchain Data

```typescript
// Get ETH balance
const balance = await publicClient.getBalance({
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",  // vitalik.eth
});
console.log(`Balance: ${formatEther(balance)} ETH`);

// Get block
const block = await publicClient.getBlock({ blockTag: "latest" });
console.log(`Block #${block.number}: ${block.transactions.length} txs`);

// Read contract (type-safe from ABI)
const erc20Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

const usdcBalance = await publicClient.readContract({
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  abi: erc20Abi,
  functionName: "balanceOf",              // Autocompleted from ABI
  args: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
});
// Return type automatically inferred as bigint
```

### Write Transactions

```typescript
// Send ETH
const hash = await walletClient.sendTransaction({
  to: "0x...",
  value: parseEther("0.1"),
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });

// Write to contract
const hash = await walletClient.writeContract({
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  abi: erc20Abi,
  functionName: "transfer",
  args: ["0xrecipient...", 1000000n],     // 1 USDC (6 decimals)
});
```

### Event Watching

```typescript
// Watch for ERC-20 Transfer events in real-time
const unwatch = publicClient.watchContractEvent({
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  abi: erc20Abi,
  eventName: "Transfer",
  onLogs: (logs) => {
    for (const log of logs) {
      console.log(`Transfer: ${log.args.from} → ${log.args.to}: ${log.args.value}`);
    }
  },
});

// Get historical events
const transferLogs = await publicClient.getContractEvents({
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  abi: erc20Abi,
  eventName: "Transfer",
  fromBlock: 18000000n,
  toBlock: 18001000n,
});
```

### ENS Resolution

```typescript
// ENS name → address
const address = await publicClient.getEnsAddress({ name: "vitalik.eth" });

// Address → ENS name
const name = await publicClient.getEnsName({
  address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
});
```

## Installation

```bash
npm install viem
```

## Best Practices

1. **ABI as const** — Declare ABIs with `as const` for full type inference on function names, args, and return types
2. **Separate clients** — Use `publicClient` for reads (free), `walletClient` for writes (costs gas)
3. **waitForTransactionReceipt** — Always wait for receipt after sending; don't assume success from hash alone
4. **parseEther/formatEther** — Use viem's utilities for ETH conversions; never do manual decimal math with bigint
5. **Chain configuration** — Import chains from `viem/chains`; includes RPC URLs, block explorer, native currency
6. **Error handling** — Viem throws typed errors; catch `ContractFunctionRevertedError` for contract reverts
7. **Batch requests** — Use `multicall` to batch multiple contract reads into one RPC call; reduces latency
8. **Works with wagmi** — Viem is the core of wagmi (React hooks for Ethereum); same patterns, same types
