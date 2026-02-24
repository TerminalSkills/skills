---
name: solidity
description: >-
  Write smart contracts with Solidity for Ethereum. Use when a user asks to
  create a smart contract, build an ERC-20 token, deploy to Ethereum, write
  NFT contracts, or develop DeFi protocols.
license: Apache-2.0
compatibility: 'Ethereum, Polygon, Arbitrum, Base, BSC (any EVM chain)'
metadata:
  author: terminal-skills
  version: 1.0.0
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

Solidity is the primary language for Ethereum smart contracts. It compiles to EVM bytecode that runs on Ethereum and all EVM-compatible chains. This skill covers contract structure, common patterns (ERC-20, ERC-721), security, and deployment with Hardhat/Foundry.

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

### Step 3: Deploy with Hardhat

```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init
```

```typescript
// scripts/deploy.ts — Deploy contract
import { ethers } from 'hardhat'

async function main() {
  const Token = await ethers.getContractFactory('MyToken')
  const token = await Token.deploy()
  await token.waitForDeployment()
  console.log('Token deployed to:', await token.getAddress())
}
main()
```

```bash
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.ts --network sepolia
```

### Step 4: Foundry (Alternative)

```bash
forge init my-project
forge build
forge test
forge script script/Deploy.s.sol --rpc-url sepolia --broadcast
```

## Guidelines

- Always use OpenZeppelin contracts for standards (ERC-20, ERC-721) — battle-tested and audited.
- Common vulnerabilities: reentrancy, integer overflow (fixed in 0.8+), front-running, access control.
- Test thoroughly — deployed contracts are immutable. Use Hardhat or Foundry for testing.
- Foundry is faster for compilation/testing (Rust-based). Hardhat has a larger plugin ecosystem.
