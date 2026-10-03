---
name: viem
description: >-
  Reads blockchain data, sends transactions and calls smart contracts from TypeScript with Viem, the type-safe Ethereum library that wagmi is built on. Use when a user asks to read a balance or ERC-20 token data, call or simulate a contract with an ABI, send ETH or tokens, watch or query contract events, resolve ENS names, batch reads with multicall, or replace ethers.js with viem.
license: Apache-2.0
compatibility: "Node.js 18 or newer, Bun, Deno or a browser; TypeScript 5.0.4 or newer for type inference. Needs a JSON-RPC endpoint (Alchemy, Infura, a public node or a local Anvil) for the chain used."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - ethereum
    - typescript
    - web3
    - smart-contracts
    - wagmi
  repository: https://github.com/wevm/viem
---

# Viem — Type-Safe Ethereum Interactions for TypeScript

## Overview

Viem (current release line 2.x) is a TypeScript interface to Ethereum and EVM chains. It is split into small, tree-shakeable modules and infers argument and return types from an ABI declared `as const` (or parsed with `parseAbi`). Everything numeric is a native `bigint`. Wagmi's React hooks are built on it, so the same calls work in a front end and in a Node script.

The model is *client + transport + chain*:

- **Public client** — reads: balances, blocks, contract calls, logs, gas estimates.
- **Wallet client** — writes: sends transactions and signs, with a local account (private key, mnemonic) or a browser wallet.
- **Transport** — `http(url)`, `webSocket(url)` or `custom(window.ethereum)`. `http()` with no URL falls back to the chain's public RPC, which is rate-limited; give it your own endpoint.
- **Chain** — an object from `viem/chains` (`mainnet`, `sepolia`, `base`, `arbitrum`, ...) or your own from `defineChain`.

## Instructions

### Install

```bash
npm install viem
```

### Clients

```typescript
import { createPublicClient, createWalletClient, http } from "viem";
import { mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const rpcUrl = process.env.MAINNET_RPC_URL!;     // e.g. an Alchemy or Infura https URL

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(rpcUrl),
  batch: { multicall: true },                    // aggregate parallel readContract calls
});

// Server-side only: the key comes from the environment, never from source code
const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`);
export const walletClient = createWalletClient({ account, chain: mainnet, transport: http(rpcUrl) });
```

In a browser use `createWalletClient({ chain: mainnet, transport: custom(window.ethereum) })` and `await walletClient.requestAddresses()`; pass `account` per call or set it on the client.

### Reads

```typescript
import { formatEther, formatUnits, parseAbi } from "viem";
import { normalize } from "viem/ens";

const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";   // USDC on Ethereum mainnet, 6 decimals

const eth = await publicClient.getBalance({ address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" });
console.log(formatEther(eth), "ETH");

const raw = await publicClient.readContract({
  address: USDC, abi: erc20Abi, functionName: "balanceOf",
  args: ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],       // result type is bigint
});
console.log(formatUnits(raw, 6), "USDC");

const [decimals, contractHeld] = await publicClient.multicall({  // one RPC round trip
  contracts: [
    { address: USDC, abi: erc20Abi, functionName: "decimals" },
    { address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [USDC] },
  ],
  allowFailure: false,                                         // return values directly, throw on failure
});

const ensAddress = await publicClient.getEnsAddress({ name: normalize("vitalik.eth") });
```

### Writes: simulate, send, wait

`writeContract` does not check that the call will succeed. Simulate first; `simulateContract` returns a ready-to-send `request` and throws the decoded revert reason.

```typescript
import { parseEther, parseUnits } from "viem";

const { request } = await publicClient.simulateContract({
  account, address: USDC, abi: erc20Abi, functionName: "transfer",
  args: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8", parseUnits("25", 6)],   // 25 USDC
});
const hash = await walletClient.writeContract(request);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`Transfer reverted in block ${receipt.blockNumber}`);

// Plain ETH transfer
const ethHash = await walletClient.sendTransaction({
  to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", value: parseEther("0.05"),
});
```

### Events

```typescript
// Live: polling over http, push over a webSocket transport
const unwatch = publicClient.watchContractEvent({
  address: USDC, abi: erc20Abi, eventName: "Transfer",
  onLogs: (logs) => logs.forEach((l) => console.log(l.args.from, "->", l.args.to, l.args.value)),
});
// call unwatch() to stop

// Historical: keep the block range small
const latest = await publicClient.getBlockNumber();
const logs = await publicClient.getContractEvents({
  address: USDC, abi: erc20Abi, eventName: "Transfer",
  fromBlock: latest - 500n, toBlock: latest,
});
```

### Errors

```typescript
import { BaseError, ContractFunctionRevertedError } from "viem";

try {
  await publicClient.simulateContract({ /* ... */ });
} catch (err) {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) console.error(revert.reason ?? revert.data?.errorName);
    else console.error(err.shortMessage);
  }
}
```

### Other pieces worth knowing

- Local testing: `createTestClient` with `anvil` from `viem/chains` and `http("http://127.0.0.1:8545")` to mine blocks and set balances.
- Fees and gas: `estimateGas`, `estimateFeesPerGas`; viem fills EIP-1559 fees by default.
- Generating types from a Solidity project: use the Wagmi CLI or Foundry/Hardhat artifacts to get ABIs as `const` TypeScript.
- Smart accounts (ERC-4337) live under `viem/account-abstraction`; check the docs for the bundler client before relying on them.

## Examples

### Example 1: Show a wallet's USDC balance

Request: "Print the USDC balance of vitalik.eth with two decimals."

```typescript
// balance.ts  (run: MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/$ALCHEMY_KEY npx tsx balance.ts)
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

const client = createPublicClient({ chain: mainnet, transport: http(process.env.MAINNET_RPC_URL) });
const abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

const owner = await client.getEnsAddress({ name: normalize("vitalik.eth") });
if (!owner) throw new Error("vitalik.eth does not resolve");
const raw = await client.readContract({
  address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", abi, functionName: "balanceOf", args: [owner],
});
console.log(`${Number(formatUnits(raw, 6)).toFixed(2)} USDC`);
```

Result: one line such as `37.19 USDC`. Two RPC calls, both reads, no key or gas needed.

### Example 2: Send tokens on Sepolia with a safety check

Request: "Send 10 test tokens to 0x7099... on Sepolia and tell me when it is confirmed."

```typescript
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const transport = http(process.env.SEPOLIA_RPC_URL);
const account = privateKeyToAccount(process.env.TEST_WALLET_KEY as `0x${string}`);
const pub = createPublicClient({ chain: sepolia, transport });
const wallet = createWalletClient({ account, chain: sepolia, transport });
const abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);

const { request } = await pub.simulateContract({
  account, address: process.env.TOKEN_ADDRESS as `0x${string}`, abi, functionName: "transfer",
  args: ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8", parseUnits("10", 18)],
});
const hash = await wallet.writeContract(request);
const receipt = await pub.waitForTransactionReceipt({ hash, confirmations: 2 });
console.log(receipt.status, hash);
```

Result: `success 0x...` after two confirmations. If the balance is too low, `simulateContract` throws `ContractFunctionExecutionError` with the revert reason and nothing is broadcast.

## Guidelines

- Keep private keys in environment variables or a secrets manager, and use a throwaway key on testnets. Never log an account object or a key.
- Declare ABIs `as const` or with `parseAbi`; without that, types collapse to `unknown` and `functionName` is not checked.
- Amounts are `bigint`: use `parseEther`, `parseUnits`, `formatUnits` with the token's real `decimals` (USDC has 6, most others 18). Never mix `number` and `bigint`.
- Always simulate before writing and wait for the receipt; a transaction hash does not mean success. Check `receipt.status`.
- `getContractEvents`/`getLogs` over wide block ranges fail or need an archive node on many providers; page through ranges of a few thousand blocks and use an authenticated endpoint.
- `watchContractEvent` polls over HTTP (`pollingInterval`, default 4 seconds); use a `webSocket` transport for push delivery.
- Use `normalize` from `viem/ens` on user-typed ENS names so look-alike characters do not resolve to the wrong address.
- Set `chain` on the wallet client: viem uses it to check the connected wallet's network and to build the transaction.
- For a quick script that only reads, ethers.js and viem are equivalent; choose viem when you want typed ABIs, small bundles or wagmi compatibility.
