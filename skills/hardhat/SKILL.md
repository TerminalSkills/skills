---
name: hardhat
description: >-
  Develop and test Ethereum smart contracts with Hardhat. Use when a user asks
  to set up a Solidity development environment, test smart contracts, deploy
  to testnets, or debug Ethereum transactions.
license: Apache-2.0
compatibility: 'Node.js 18+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - hardhat
    - ethereum
    - solidity
    - testing
    - deployment
---

# Hardhat

## Overview

Hardhat is the most popular Ethereum development environment. It provides local blockchain (Hardhat Network), Solidity compilation, testing framework, deployment scripts, and debugging tools. Extensible with plugins for verification, gas reporting, and coverage.

## Instructions

### Step 1: Setup

```bash
mkdir my-contract && cd my-contract
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init    # choose TypeScript project
```

### Step 2: Write Tests

```typescript
// test/Token.test.ts — Smart contract tests
import { expect } from 'chai'
import { ethers } from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers'

describe('MyToken', function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners()
    const Token = await ethers.getContractFactory('MyToken')
    const token = await Token.deploy()
    return { token, owner, user1, user2 }
  }

  it('Should assign total supply to owner', async function () {
    const { token, owner } = await loadFixture(deployFixture)
    const total = await token.totalSupply()
    expect(await token.balanceOf(owner.address)).to.equal(total)
  })

  it('Should transfer tokens', async function () {
    const { token, owner, user1 } = await loadFixture(deployFixture)
    const amount = ethers.parseEther('100')
    await token.transfer(user1.address, amount)
    expect(await token.balanceOf(user1.address)).to.equal(amount)
  })

  it('Should fail if sender has insufficient balance', async function () {
    const { token, user1, user2 } = await loadFixture(deployFixture)
    await expect(token.connect(user1).transfer(user2.address, 1))
      .to.be.revertedWithCustomError(token, 'ERC20InsufficientBalance')
  })
})
```

### Step 3: Configure Networks

```typescript
// hardhat.config.ts — Network configuration
import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'

const config: HardhatUserConfig = {
  solidity: '0.8.24',
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: [process.env.PRIVATE_KEY!],
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL,
      accounts: [process.env.PRIVATE_KEY!],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
}
export default config
```

### Step 4: Deploy and Verify

```bash
npx hardhat compile
npx hardhat test
npx hardhat test --gas-report     # show gas costs
npx hardhat coverage              # test coverage

# Deploy to testnet
npx hardhat run scripts/deploy.ts --network sepolia

# Verify on Etherscan
npx hardhat verify --network sepolia CONTRACT_ADDRESS
```

## Guidelines

- Hardhat Network forks mainnet — test with real state without spending real ETH.
- Use `loadFixture` for fast test setup — it snapshots and reverts between tests.
- Always verify contracts on Etherscan after deployment — builds trust.
- For faster compilation and testing, consider Foundry (Rust-based alternative).
