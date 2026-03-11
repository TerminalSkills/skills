---
name: foundry
category: Blockchain & Web3
tags: [solidity, ethereum, smart-contracts, testing, deployment, forge, cast]
version: 1.0.0
author: terminal-skills
---

# Foundry — Blazing Fast Ethereum Development Toolkit

You are an expert in Foundry, the blazing-fast Ethereum development toolkit written in Rust. You help developers write, test, deploy, and debug Solidity smart contracts using Forge (testing), Cast (CLI interactions), Anvil (local node), and Chisel (Solidity REPL) — with native Solidity testing (no JavaScript), fuzz testing, gas optimization, and fork testing against mainnet state.

## Core Capabilities

### Project Setup

```bash
# Create new project
forge init my-project
cd my-project

# Structure:
# src/          — Solidity contracts
# test/         — Solidity tests
# script/       — Deployment scripts
# lib/          — Dependencies (git submodules)
# foundry.toml  — Configuration

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts
forge install transmissions11/solmate
```

### Smart Contract

```solidity
// src/Vault.sol — ERC-4626 yield vault
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Vault is ERC4626, Ownable {
    uint256 public totalDeposited;
    uint256 public yieldRate;              // Basis points per year (e.g., 500 = 5%)
    mapping(address => uint256) public depositTimestamp;

    constructor(IERC20 asset_, uint256 yieldRate_)
        ERC4626(asset_)
        ERC20("Vault Share", "vSHARE")
        Ownable(msg.sender)
    {
        yieldRate = yieldRate_;
    }

    function deposit(uint256 assets, address receiver)
        public override returns (uint256 shares)
    {
        shares = super.deposit(assets, receiver);
        totalDeposited += assets;
        depositTimestamp[receiver] = block.timestamp;
        return shares;
    }

    function setYieldRate(uint256 newRate) external onlyOwner {
        require(newRate <= 2000, "Rate too high");  // Max 20%
        yieldRate = newRate;
    }
}
```

### Testing in Solidity

```solidity
// test/Vault.t.sol — Native Solidity tests
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {Vault} from "../src/Vault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract VaultTest is Test {
    Vault vault;
    MockERC20 token;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        token = new MockERC20("USDC", "USDC", 6);
        vault = new Vault(token, 500);     // 5% yield

        // Fund test accounts
        token.mint(alice, 10_000e6);
        token.mint(bob, 5_000e6);
    }

    function test_Deposit() public {
        vm.startPrank(alice);              // Impersonate alice
        token.approve(address(vault), 1_000e6);
        uint256 shares = vault.deposit(1_000e6, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), shares);
        assertEq(vault.totalDeposited(), 1_000e6);
        assertEq(token.balanceOf(address(vault)), 1_000e6);
    }

    function test_OnlyOwnerCanSetRate() public {
        vm.prank(alice);                   // Not owner
        vm.expectRevert();
        vault.setYieldRate(1000);
    }

    function test_RateCannotExceed20Percent() public {
        vm.expectRevert("Rate too high");
        vault.setYieldRate(2001);
    }

    // Fuzz testing: Foundry generates random inputs
    function testFuzz_Deposit(uint256 amount) public {
        amount = bound(amount, 1, 10_000e6);  // Constrain range

        vm.startPrank(alice);
        token.approve(address(vault), amount);
        vault.deposit(amount, alice);
        vm.stopPrank();

        assertEq(vault.totalDeposited(), amount);
    }

    // Fork testing: test against mainnet state
    function test_ForkMainnet() public {
        vm.createSelectFork("mainnet");    // Requires RPC URL in foundry.toml
        // Now interacting with real mainnet contracts
        IERC20 usdc = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
        assertGt(usdc.totalSupply(), 0);
    }
}
```

### Deployment Scripts

```solidity
// script/Deploy.s.sol
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {Vault} from "../src/Vault.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast(deployerKey);
        Vault vault = new Vault(IERC20(usdc), 500);
        vm.stopBroadcast();

        console.log("Vault deployed at:", address(vault));
    }
}
```

```bash
# Deploy
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify

# Cast: interact with contracts from CLI
cast call $VAULT "totalDeposited()" --rpc-url $RPC_URL
cast send $VAULT "setYieldRate(uint256)" 800 --private-key $KEY --rpc-url $RPC_URL
cast balance $ADDRESS --rpc-url $RPC_URL

# Anvil: local node
anvil                                      # Starts at localhost:8545
anvil --fork-url $MAINNET_RPC             # Fork mainnet locally
```

## Installation

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup                                 # Install/update forge, cast, anvil, chisel
```

## Best Practices

1. **Test in Solidity** — Write tests in Solidity, not JavaScript; faster execution, better type safety, same language as contracts
2. **Fuzz testing** — Use `testFuzz_` prefix; Foundry generates 256 random inputs by default, catches edge cases
3. **Fork testing** — Test against real mainnet state with `vm.createSelectFork`; verify integrations with live contracts
4. **Gas snapshots** — Run `forge snapshot` to track gas usage; commit `.gas-snapshot` to detect regressions
5. **Cheatcodes** — `vm.prank()`, `vm.warp()`, `vm.roll()`, `vm.expectRevert()` for comprehensive testing
6. **Invariant testing** — Define invariants that must always hold; Foundry tries to break them with random sequences
7. **Deployment scripts** — Use Forge scripts instead of raw transactions; reproducible, verified deployments
8. **Cast for debugging** — `cast calldata-decode`, `cast abi-encode`, `cast tx` for on-chain debugging
