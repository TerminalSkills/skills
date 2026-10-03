---
name: solidity
description: >-
  Solidity is the programming language for smart contracts on Ethereum and other EVM chains. This skill covers contracts, ERC-20 tokens, Hardhat and Foundry. Use when a user asks to
  create a smart contract, build an ERC-20 token, deploy to Ethereum, write
  NFT contracts, or develop DeFi protocols.
license: Apache-2.0
compatibility: 'Ethereum, Polygon, Arbitrum, Base, BSC (any EVM chain)'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/argotorg/solidity
  category: development
  tags:
    - solidity
    - smart-contracts
    - ethereum
    - erc20
    - nft
---

# Solidity

## Overview

Solidity is the primary language for Ethereum smart contracts. It compiles to EVM bytecode that runs on Ethereum and all EVM-compatible chains. This skill covers contract structure, common patterns (ERC-20, ERC-721), security, and deployment with Hardhat 3 or Foundry. Examples were built and deployed on Hardhat 3.18 with solc 0.8.34 and OpenZeppelin 5.

## Instructions

### Step 1: Basic Contract

```solidity
// contracts/SimpleStorage.sol — Basic smart contract
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SimpleStorage {
    uint256 private value;
    address public owner;

    event ValueChanged(uint256 newValue, address changedBy);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(uint256 initialValue) {
        owner = msg.sender;
        value = initialValue;
    }

    function setValue(uint256 newValue) external onlyOwner {
        value = newValue;
        emit ValueChanged(newValue, msg.sender);
    }

    function getValue() external view returns (uint256) {
        return value;
    }
}
```

### Step 2: ERC-20 Token

```solidity
// contracts/MyToken.sol — Standard ERC-20 token
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, Ownable {
    constructor() ERC20("My Token", "MTK") Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());    // 1M tokens
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
```

### Step 3: Build, test and deploy with Hardhat 3

Hardhat 3 needs Node.js 22.13+ and is ESM (`"type": "module"`). Create a project in an empty directory:

```bash
npm init -y
npm install --save-dev hardhat
npx hardhat --init                       # interactive; pick the Mocha + ethers template
# non-interactive: npx hardhat --init --template mocha-ethers --install
npm install @openzeppelin/contracts      # OpenZeppelin 5.x, used by MyToken above
```

Put the contracts in `contracts/`, then:

```bash
npx hardhat build      # `compile` is an alias; writes artifacts
npx hardhat test
```

Deploy with a Hardhat Ignition module (the recommended way, resumable if a transaction fails):

```typescript
// ignition/modules/MyToken.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MyTokenModule", (m) => {
  const token = m.contract("MyToken");
  return { token };
});
```

```bash
npx hardhat ignition deploy ignition/modules/MyToken.ts                  # in-process test network
npx hardhat keystore set SEPOLIA_PRIVATE_KEY                             # encrypted keystore, not a .env file
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat ignition deploy ignition/modules/MyToken.ts --network sepolia
```

The template's `hardhat.config.ts` already defines a `sepolia` network that reads both values with `configVariable("SEPOLIA_RPC_URL")` and `configVariable("SEPOLIA_PRIVATE_KEY")`. A plain script also works:

```typescript
// scripts/deploy-token.ts — run with: npx hardhat run scripts/deploy-token.ts
import { network } from "hardhat";

const { ethers } = await network.create();   // network.connect() is deprecated
const token = await ethers.deployContract("MyToken");
await token.waitForDeployment();
console.log("Token deployed to:", await token.getAddress());
```

Running it prints `Token deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3` on the in-process network. Verify a deployed contract with `npx hardhat verify etherscan 0x5FbDB2315678afecb367f032d93F642f64180aa3`.

### Step 4: Foundry (Alternative)

```bash
forge init token-vault
cd token-vault
forge install OpenZeppelin/openzeppelin-contracts
forge build
forge test
```

Map the import in `foundry.toml` (`remappings = ["@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/"]`) and add an RPC alias:

```toml
[rpc_endpoints]
sepolia = "${SEPOLIA_RPC_URL}"
```

```bash
forge script script/Deploy.s.sol                                          # simulation only
forge script script/Deploy.s.sol --rpc-url sepolia --account deployer --broadcast
```

`--broadcast` is what sends transactions, and `--account deployer` uses a keystore created with `cast wallet import deployer --interactive`. `--chain` only sets `block.chainid`; it does not pick the network, so always pass `--rpc-url`. Add `--verify --etherscan-api-key $ETHERSCAN_API_KEY` to verify while deploying.

## Examples

**Request:** "Create an ERC-20 token with a fixed initial supply that I can deploy to Sepolia."
Use `MyToken` from Step 2, build with `npx hardhat build` (output `Compiled 1 Solidity file with solc 0.8.34`), and deploy with the Ignition module; the last lines are `MyTokenModule#MyToken - 0x5FbD...0aa3` on the local network.

**Request:** "Write a contract that only I can update, and test it."
Use `SimpleStorage` from Step 1, add a Mocha test (or a Solidity `.t.sol` test with Foundry) that calls `setValue` from a second account and expects the revert `Not owner`, then run `npx hardhat test`.

## Guidelines

- Use the latest released compiler for deployments (0.8.37 at the time of writing) and pin it in the config; `pragma solidity ^0.8.20` in a file only sets the minimum.
- Always use OpenZeppelin contracts for standards (ERC-20, ERC-721); v5 constructors take the initial owner explicitly (`Ownable(msg.sender)`).
- Prefer custom errors (`error NotOwner();` and `revert NotOwner();`) to `require` strings: cheaper to deploy and call.
- Common vulnerabilities: reentrancy (checks-effects-interactions, `ReentrancyGuard`), access control mistakes, front-running, unchecked external calls, `tx.origin` auth. Overflow reverts by default since 0.8, except inside `unchecked` blocks.
- Deployed contracts are immutable: test on a testnet first, get an audit before holding real funds, and plan upgradeability up front if you need it.
- Never commit private keys or RPC keys; use the Hardhat keystore, a Foundry keystore or a hardware wallet.
- Foundry is faster and tests in Solidity; Hardhat 3 has the larger plugin ecosystem and also runs Solidity tests (`npx hardhat test solidity`).
