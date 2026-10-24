---
name: hardhat
description: >-
  Hardhat 3 is a development environment for Ethereum smart contracts: it
  compiles Solidity, runs tests on a built-in simulated chain, deploys with
  Ignition and verifies on block explorers. Use when a user asks to set up a
  Solidity project, test or deploy smart contracts, fork mainnet, or check gas
  and coverage.
license: Apache-2.0
compatibility: 'Node.js 22.13+, Hardhat 3'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/NomicFoundation/hardhat
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

Hardhat 3 (current: 3.21) is an ESM-only TypeScript toolchain for Solidity. It compiles contracts, runs an in-process simulated chain (EDR), tests in TypeScript (Mocha + ethers, or the Node test runner + viem) and in Solidity, deploys with Hardhat Ignition, and verifies on Etherscan, Blockscout and Sourcify. Hardhat 3 differs from 2 in ways that break old snippets: no `hardhat-toolbox`, no global `ethers` import, no `etherscan` config key, `network.create()` instead of implicit networks. Hardhat 2 (`hardhat@hh2`) is end of life; a 2.x project keeps working until migrated.

## Instructions

### Step 1: Set up a project

Needs Node.js 22.13 or later. The init command is interactive (it needs a terminal):

```bash
mkdir token-sale && cd token-sale
npm init -y
npm install --save-dev hardhat
npx hardhat --init        # pick a template: mocha-ethers, node-test-runner-viem or minimal
```

The `mocha-ethers` template installs `@nomicfoundation/hardhat-toolbox-mocha-ethers` plus `ethers`, `mocha` and `chai`, and sets `"type": "module"` in `package.json`. Keep that: Hardhat 3 does not load CommonJS configs. Add contract libraries with `npm install @openzeppelin/contracts`.

### Step 2: Write a contract and tests

```solidity
// contracts/MyToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MyToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("MyToken", "MTK") {
        _mint(msg.sender, initialSupply);
    }
}
```

In Hardhat 3 the connection is created in the test file with `network.create()`; `ethers` and `networkHelpers` come from that connection, not from `import { ethers } from "hardhat"`.

```typescript
// test/MyToken.ts
import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

describe("MyToken", function () {
  async function deployFixture() {
    const [owner, user1, user2] = await ethers.getSigners();
    const token = await ethers.deployContract("MyToken", [ethers.parseEther("1000000")]);
    return { token, owner, user1, user2 };
  }

  it("assigns the total supply to the deployer", async function () {
    const { token, owner } = await networkHelpers.loadFixture(deployFixture);
    expect(await token.balanceOf(owner.address)).to.equal(await token.totalSupply());
  });

  it("transfers tokens", async function () {
    const { token, user1 } = await networkHelpers.loadFixture(deployFixture);
    const amount = ethers.parseEther("100");
    await expect(token.transfer(user1.address, amount)).to.changeTokenBalance(ethers, token, user1, amount);
  });

  it("reverts when the sender has no balance", async function () {
    const { token, user1, user2 } = await networkHelpers.loadFixture(deployFixture);
    await expect(token.connect(user1).transfer(user2.address, 1n))
      .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
  });
});
```

Solidity tests (`*.t.sol` files using `forge-std`) also run under `npx hardhat test`; `npx hardhat test mocha` and `npx hardhat test solidity` run one kind.

### Step 3: Configure networks and secrets

`configVariable("NAME")` is read lazily from an environment variable or the encrypted keystore, so the config never holds a secret.

```typescript
// hardhat.config.ts
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: { version: "0.8.34" },
  networks: {
    mainnetFork: {
      type: "edr-simulated",
      chainType: "l1",
      forking: { url: configVariable("MAINNET_RPC_URL"), blockNumber: 21000000 },
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
  verify: { etherscan: { apiKey: configVariable("ETHERSCAN_API_KEY") } },
});
```

Store values in the keystore instead of a `.env` file: `npx hardhat keystore set SEPOLIA_PRIVATE_KEY` prompts for the value (`keystore list`, `get`, `delete`, `change-password` also exist; `--dev` targets a separate development keystore for throwaway keys). Every network must have a `type`: `edr-simulated` for local or forked, `http` for a remote RPC. Use a funded throwaway testnet key, never a mainnet key.

### Step 4: Build, test, deploy, verify

```bash
npx hardhat build                            # compile (replaces `hardhat compile`)
npx hardhat test                             # all tests
npx hardhat test --gas-stats                 # per-function gas table
npx hardhat test --coverage                  # line and statement coverage
npx hardhat test --network mainnetFork       # run tests on the fork
```

Deploy with an Ignition module instead of a script:

```typescript
// ignition/modules/MyToken.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MyTokenModule", (m) => {
  const supply = m.getParameter("initialSupply", 1_000_000n * 10n ** 18n);
  const token = m.contract("MyToken", [supply]);
  return { token };
});
```

```bash
npx hardhat ignition deploy ignition/modules/MyToken.ts                                 # in-memory chain, a dry run
npx hardhat ignition deploy ignition/modules/MyToken.ts --network sepolia --verify      # deploy and verify
npx hardhat verify etherscan --network sepolia 0x5FbDB2315678afecb367f032d93F642f64180aa3 1000000000000000000000000
```

Constructor arguments follow the address, or use `--constructor-args-path` with a module that exports them. Other verifiers: `verify blockscout`, `verify sourcify`.

## Examples

### Example 1: "Set up Hardhat and test my ERC-20"

Run Step 1, copy the contract and test above, then:

```console
$ npx hardhat test
Running Mocha tests
  MyToken
    ✔ assigns the total supply to the deployer
    ✔ transfers tokens
    ✔ reverts when the sender has no balance
  3 passing
```

Add `--gas-stats` to see `transfer` costing about 52,000 gas and the deployment about 942,000.

### Example 2: "Deploy to Sepolia and verify on Etherscan"

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat keystore set ETHERSCAN_API_KEY
npx hardhat ignition deploy ignition/modules/MyToken.ts --network sepolia --verify
```

Ignition prints `MyTokenModule#MyToken - 0x...` when the deployment succeeds. Rerunning the same command resumes or skips finished steps; `--reset` wipes the saved state.

### Example 3: "Test against mainnet state"

Define `mainnetFork` as in Step 3, then `npx hardhat test --network mainnetFork`. In a test, `network.create("mainnetFork")` gives a connection to the fork, and `networkHelpers.impersonateAccount(address)` lets you act as an existing holder.

## Guidelines

- Do not paste Hardhat 2 code: `import { ethers } from "hardhat"`, `@nomicfoundation/hardhat-toolbox`, `hardhat compile`, `etherscan: { apiKey }` and `scripts/deploy.ts` flows are gone or replaced in 3.
- Use `networkHelpers.loadFixture` for setup: it snapshots the chain and reverts between tests, which keeps suites fast.
- A forked network needs an archive-capable RPC for old blocks; pin `blockNumber` so the tests are repeatable and the RPC can cache.
- Never commit `.env` files or private keys; prefer the keystore or CI environment variables.
- When a task needs a Hardhat 2 plugin that has no Hardhat 3 release, say so rather than guessing a package name; check the plugin's npm page.
- Foundry (`forge`) is an alternative for Solidity-only workflows; Hardhat 3 can also run `forge-std` Solidity tests.
