---
title: Build and Deploy DeFi Smart Contracts with Foundry
slug: build-and-deploy-defi-smart-contracts
description: Build a DeFi yield vault using Foundry for development and testing, Viem for frontend integration, and OpenZeppelin for battle-tested contract primitives — with fuzz testing, fork testing against mainnet, and gas-optimized deployment to Ethereum.
skills: [foundry, viem]
category: development
tags: [defi, smart-contracts, ethereum, solidity, testing, web3]
---

# Build and Deploy DeFi Smart Contracts with Foundry

Sana is a Solidity developer building a yield aggregator vault — users deposit USDC, the vault deploys capital across lending protocols (Aave, Compound), and rebalances for optimal yield. The contract will hold millions in user funds, so every line must be tested rigorously: fuzz testing for edge cases and fork testing against mainnet state.

## Step 1: Set Up the Project and Write the Contract

```bash
forge init yield-vault && cd yield-vault
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0   # pinned tag, recorded in foundry.lock
export MAINNET_RPC_URL="https://your-provider.example/v2/$RPC_KEY"   # any mainnet archive-capable RPC endpoint
```

Fork tests find the `mainnet` alias through `foundry.toml`:

```toml
# foundry.toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
[rpc_endpoints]
mainnet = "${MAINNET_RPC_URL}"
sepolia = "${SEPOLIA_RPC_URL}"
```

The vault needs only two Aave v3 calls, so it declares a minimal interface instead of pulling in the whole Aave package:

```solidity
// src/interfaces/IPool.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}
```

```solidity
// src/YieldVault.sol — ERC-4626 yield aggregator
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPool} from "./interfaces/IPool.sol";

contract YieldVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPool public immutable aavePool;
    IERC20 public immutable aToken;        // Aave interest-bearing token

    uint256 public constant MAX_DEPOSIT = 10_000_000e6;  // $10M cap
    uint256 public totalStrategyDeposits;

    event Rebalanced(uint256 aaveAmount, uint256 timestamp);
    event EmergencyWithdraw(address indexed caller, uint256 amount);

    constructor(
        IERC20 usdc_,
        IPool aavePool_,
        IERC20 aToken_
    )
        ERC4626(usdc_)
        ERC20("Yield Vault USDC", "yvUSDC")
        Ownable(msg.sender)
    {
        aavePool = aavePool_;
        aToken = aToken_;
        usdc_.approve(address(aavePool_), type(uint256).max);
    }

    function totalAssets() public view override returns (uint256) {
        // Idle assets + deployed assets (with earned interest)
        return IERC20(asset()).balanceOf(address(this)) + aToken.balanceOf(address(this));
    }

    function deposit(uint256 assets, address receiver)
        public override nonReentrant returns (uint256)
    {
        require(totalAssets() + assets <= MAX_DEPOSIT, "Deposit cap reached");
        return super.deposit(assets, receiver);
    }

    /// @dev Pay withdrawals from idle USDC first and pull the rest back from Aave,
    ///      because totalAssets() counts aTokens that the vault does not hold as USDC.
    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal override
    {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle < assets) {
            aavePool.withdraw(asset(), assets - idle, address(this));
        }
        super._withdraw(caller, receiver, owner_, assets, shares);
    }

    /// @notice Deploy idle assets to Aave for yield
    function rebalance() external onlyOwner {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle > 0) {
            aavePool.supply(asset(), idle, address(this), 0);
            totalStrategyDeposits += idle;
        }
        emit Rebalanced(idle, block.timestamp);
    }

    /// @notice Emergency: withdraw all from strategies
    function emergencyWithdraw() external onlyOwner {
        uint256 aaveBalance = aToken.balanceOf(address(this));
        if (aaveBalance > 0) {
            aavePool.withdraw(asset(), aaveBalance, address(this));
        }
        totalStrategyDeposits = 0;
        emit EmergencyWithdraw(msg.sender, aaveBalance);
    }
}
```

## Step 2: Fuzz and Fork Testing

```solidity
// test/YieldVault.t.sol — Fuzz + Fork + Invariant testing
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {YieldVault} from "../src/YieldVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPool} from "../src/interfaces/IPool.sol";

contract YieldVaultTest is Test {
    YieldVault vault;

    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant AAVE_POOL = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address constant aUSDC = 0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c;

    address alice = makeAddr("alice");

    function setUp() public {
        vm.createSelectFork("mainnet", 19_000_000);

        vault = new YieldVault(
            IERC20(USDC),
            IPool(AAVE_POOL),
            IERC20(aUSDC)
        );

        // Fund the test user with USDC by writing its balance slot (no whale needed)
        deal(USDC, alice, 100_000e6);
    }

    function test_DepositAndWithdraw() public {
        vm.startPrank(alice);
        IERC20(USDC).approve(address(vault), 10_000e6);
        uint256 shares = vault.deposit(10_000e6, alice);
        assertGt(shares, 0);

        // Withdraw
        uint256 assets = vault.redeem(shares, alice, alice);
        assertEq(assets, 10_000e6);       // No yield yet, 1:1
        vm.stopPrank();
    }

    function test_RebalanceToAave() public {
        // Alice deposits
        vm.startPrank(alice);
        IERC20(USDC).approve(address(vault), 50_000e6);
        vault.deposit(50_000e6, alice);
        vm.stopPrank();

        // Owner rebalances to Aave
        vault.rebalance();

        // Vault now has aUSDC instead of USDC
        assertGt(IERC20(aUSDC).balanceOf(address(vault)), 0);

        // Fast forward 30 days — yield accrues
        vm.warp(block.timestamp + 30 days);

        // Total assets should be more than deposited (interest earned)
        assertGt(vault.totalAssets(), 50_000e6);
    }

    // Fuzz test: any deposit amount should work within bounds
    function testFuzz_Deposit(uint256 amount) public {
        amount = bound(amount, 1e6, 10_000_000e6);  // $1 to $10M

        // Ensure alice has enough
        deal(USDC, alice, amount);

        vm.startPrank(alice);
        IERC20(USDC).approve(address(vault), amount);
        uint256 shares = vault.deposit(amount, alice);
        vm.stopPrank();

        assertGt(shares, 0);
        assertEq(vault.totalAssets(), amount);
    }
}
```

Run the suite with `forge test --match-contract YieldVaultTest -vvv`. The fork block is pinned, so results are reproducible and the RPC responses are cached. `forge test --gas-report` prints the cost of each function and `forge snapshot --check` fails CI when gas regresses.

## Step 3: Deploy with a Script

```solidity
// script/Deploy.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {YieldVault} from "../src/YieldVault.sol";
import {IPool} from "../src/interfaces/IPool.sol";

contract DeployScript is Script {
    function run() public {
        vm.startBroadcast(); // signer comes from --account, never from a key in the repo
        YieldVault vault = new YieldVault(
            IERC20(vm.envAddress("USDC")), IPool(vm.envAddress("AAVE_POOL")), IERC20(vm.envAddress("AUSDC"))
        );
        vm.stopBroadcast();
        console.log("YieldVault deployed at:", address(vault));
    }
}
```

```bash
cast wallet import deployer --interactive      # encrypted keystore, the key never touches the shell history
forge script script/Deploy.s.sol --rpc-url sepolia        # simulation only, nothing is sent
forge script script/Deploy.s.sol --rpc-url sepolia --account deployer \
  --broadcast --verify --etherscan-api-key "$ETHERSCAN_API_KEY"
```

Set `USDC`, `AAVE_POOL` and `AUSDC` to the addresses of the network you deploy to (the Sepolia Aave deployment uses its own test USDC, not the mainnet addresses above). If a broadcast is interrupted, rerun the same command with `--resume`. Since Foundry v1.9.0, `--resume` stops when a recorded transaction reverted: fix the cause, then run `--broadcast --start-fresh` to archive the old run and send everything again. Keep the `broadcast/` and `cache/` directories until the deployment is complete.

## Step 4: Frontend Integration with Viem

```typescript
// src/lib/vault.ts — Type-safe contract interactions
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { vaultAbi } from "./abis/vault"; // forge inspect YieldVault abi --json, saved as a typed `as const` export

const VAULT_ADDRESS = "0x..." as const;
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

export async function getVaultStats() {
  const [totalAssets, totalSupply, maxDeposit] = await publicClient.multicall({
    contracts: [
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: "totalAssets" },
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: "totalSupply" },
      { address: VAULT_ADDRESS, abi: vaultAbi, functionName: "MAX_DEPOSIT" },
    ],
  });

  const sharePrice = totalSupply.result! > 0n
    ? Number(totalAssets.result!) / Number(totalSupply.result!)
    : 1;

  return {
    tvl: formatUnits(totalAssets.result!, 6),
    sharePrice: sharePrice.toFixed(6),
    utilizationPercent: (Number(totalAssets.result!) / Number(maxDeposit.result!) * 100).toFixed(1),
  };
}
```

## Results

Sana measures the vault instead of guessing, with Foundry's own commands:

- **Tests**: unit, fuzz and fork tests run on every pull request (`forge test`).
- **Gas**: `forge test --gas-report` shows the cost of `deposit()`, and `forge snapshot --check` blocks a pull request that makes it more expensive.
- **Before mainnet**: an external audit and a testnet dry run with the deploy script, since a clean test suite does not replace a review of a contract that holds user funds.

## Related Skills

- **foundry**: project setup, fuzz and fork tests, gas reports and the deployment script with `--account`, `--resume` and `--start-fresh`
- **viem**: type-safe reads of the deployed vault from the frontend
