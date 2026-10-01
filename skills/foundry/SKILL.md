---
name: foundry
description: >-
  Foundry is a command-line toolkit for Ethereum smart-contract development:
  forge compiles, tests, fuzzes and deploys Solidity contracts, cast calls
  contracts and sends transactions, anvil runs a local node, and chisel is a
  Solidity REPL. Use when a user asks to set up a Foundry project, write
  Solidity unit or fuzz tests, fork mainnet in a test, deploy with forge
  script, verify a contract on Etherscan, track gas with forge snapshot, or
  read and write chain state with cast.
license: Apache-2.0
compatibility: 'Linux, macOS, or Windows via WSL/Git Bash; git for dependencies. Checked against Foundry v1.8.3.'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/foundry-rs/foundry
  tags:
    - solidity
    - ethereum
    - smart-contracts
    - testing
    - forge
---

# Foundry — Blazing Fast Ethereum Development Toolkit

## Overview

Foundry is a Rust toolkit for Ethereum development made of four binaries: `forge` (build, test, fuzz, script, verify), `cast` (RPC calls, transactions, ABI utilities, keystores), `anvil` (local node, mainnet forking) and `chisel` (Solidity REPL). Tests and deployment scripts are written in Solidity, dependencies are git submodules under `lib/`, and configuration lives in `foundry.toml`.

## Instructions

### Installation

```bash
# macOS / Linux with Homebrew
brew install foundry

# Or a release archive, verified against the published SHA-256 before extracting
FOUNDRY_VERSION=v1.8.3
ARCHIVE="foundry_${FOUNDRY_VERSION}_linux_amd64.tar.gz"   # also linux_arm64, darwin_arm64, darwin_amd64, alpine_amd64
curl -fsSLO "https://github.com/foundry-rs/foundry/releases/download/${FOUNDRY_VERSION}/${ARCHIVE}"
curl -fsSLO "https://github.com/foundry-rs/foundry/releases/download/${FOUNDRY_VERSION}/${ARCHIVE%.tar.gz}.sha256"
sha256sum -c "${ARCHIVE%.tar.gz}.sha256" \
  && mkdir -p "$HOME/.local/bin" \
  && tar -xzf "$ARCHIVE" -C "$HOME/.local/bin"            # forge, cast, anvil, chisel, solar
export PATH="$HOME/.local/bin:$PATH"                      # if it is not on PATH already
forge --version                                           # forge Version: 1.8.3

# Or Docker / a source build
docker pull ghcr.io/foundry-rs/foundry:v1.8.3
cargo install --git https://github.com/foundry-rs/foundry --profile release --locked forge cast chisel anvil solar
```

On macOS use `shasum -a 256 -c` in place of `sha256sum -c`. The project's own installer and version manager is `foundryup` (see https://getfoundry.sh/introduction/installation); it compares each binary's hash with the release attestation. Foundry no longer publishes npm packages. In GitHub Actions use `foundry-rs/foundry-toolchain@v1`.

### Project setup

```bash
forge init vault-demo && cd vault-demo
# src/ contracts · test/ *.t.sol · script/ *.s.sol · lib/ dependencies · foundry.toml
forge install OpenZeppelin/openzeppelin-contracts@v5.7.0   # pinned tag, recorded in foundry.lock
forge remappings   # includes @openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/ and forge-std/=lib/forge-std/src/
```

`forge install` adds a git submodule and does not commit unless `--commit` is passed. Commit `foundry.lock`. `forge update` moves only branch-based dependencies; a tag is changed explicitly, e.g. `forge update openzeppelin/openzeppelin-contracts@tag=v5.7.0`.

```toml
# foundry.toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
[rpc_endpoints]
mainnet = "${MAINNET_RPC_URL}"
sepolia = "${SEPOLIA_RPC_URL}"
[profile.ci]                 # FOUNDRY_PROFILE=ci forge test
fuzz = { runs = 10000 }
```

### Smart contract

```solidity
// src/Vault.sol — ERC-4626 vault with an owner-controlled rate
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Vault is ERC4626, Ownable {
    error RateTooHigh(uint256 rate);

    uint256 public totalDeposited;
    uint256 public yieldRate; // basis points per year, 500 = 5%

    constructor(IERC20 asset_, uint256 yieldRate_, address owner_)
        ERC4626(asset_)
        ERC20("Vault Share", "vSHARE")
        Ownable(owner_)
    {
        yieldRate = yieldRate_;
    }

    function deposit(uint256 assets, address receiver) public override returns (uint256 shares) {
        shares = super.deposit(assets, receiver);
        totalDeposited += assets;
    }

    function setYieldRate(uint256 newRate) external onlyOwner {
        if (newRate > 2000) revert RateTooHigh(newRate); // max 20%
        yieldRate = newRate;
    }
}
```

### Testing in Solidity

Test contracts inherit `Test` from forge-std; `setUp()` runs before every test. A test function with parameters is a fuzz test (256 runs by default).

```solidity
// test/Vault.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Vault} from "../src/Vault.sol";

contract MockUSDC is ERC20("USD Coin", "USDC") {
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract VaultTest is Test {
    Vault vault;
    MockUSDC token;
    address alice = makeAddr("alice");

    function setUp() public {
        token = new MockUSDC();
        vault = new Vault(token, 500, address(this));
        token.mint(alice, 10_000e6);
    }

    function test_Deposit() public {
        vm.startPrank(alice); // every call until stopPrank comes from alice
        token.approve(address(vault), 1_000e6);
        uint256 shares = vault.deposit(1_000e6, alice);
        vm.stopPrank();
        assertEq(vault.balanceOf(alice), shares);
        assertEq(vault.totalDeposited(), 1_000e6);
    }

    function test_RevertWhen_CallerIsNotOwner() public {
        vm.prank(alice); // next call only
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.setYieldRate(1000);
    }

    function testFuzz_Deposit(uint256 amount) public {
        amount = bound(amount, 1, 10_000e6); // prefer bound() over vm.assume()
        vm.startPrank(alice);
        token.approve(address(vault), amount);
        vault.deposit(amount, alice);
        vm.stopPrank();
        assertEq(vault.totalDeposited(), amount);
    }

    // Fork test: "mainnet" is the alias from [rpc_endpoints]
    function test_ForkMainnetUsdc() public {
        vm.createSelectFork("mainnet");
        IERC20 usdc = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
        assertGt(usdc.totalSupply(), 0);
    }
}
```

```bash
forge test                                   # all tests
forge test --match-test testFuzz_ -vvv       # filter by name; -vvv prints traces for failures
forge test --no-match-test Fork              # skip tests that need an RPC endpoint
forge test --gas-report                      # per-function gas table
forge snapshot && forge snapshot --check     # write .gas-snapshot, then fail on regressions
forge fmt --check && forge lint              # formatter and built-in linter
```

### Deployment script

```solidity
// script/Deploy.s.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Vault} from "../src/Vault.sol";

contract DeployScript is Script {
    function run() public {
        address asset = vm.envAddress("ASSET_ADDRESS");
        address owner = vm.envAddress("OWNER_ADDRESS");
        vm.startBroadcast(); // signer comes from --account, --ledger or --private-key
        Vault vault = new Vault(IERC20(asset), 500, owner);
        vm.stopBroadcast();
        console.log("Vault deployed at:", address(vault));
    }
}
```

```bash
cast wallet import deployer --interactive    # encrypted keystore in ~/.foundry/keystores
forge script script/Deploy.s.sol --rpc-url sepolia                       # simulate only
forge script script/Deploy.s.sol --rpc-url sepolia --account deployer \
  --broadcast --verify --etherscan-api-key "$ETHERSCAN_API_KEY"
# A broadcast interrupted halfway continues with the same command plus --resume
```

Without `--broadcast` nothing is sent. Receipts are written to `broadcast/Deploy.s.sol/11155111/run-latest.json` (the directory is the chain id).

## Examples

### Example 1: Run the test suite and read the result

**User request:** "Run the vault tests, including the mainnet fork test, and show me the result."

```bash
export MAINNET_RPC_URL="https://ethereum.reth.rs/rpc"
forge test --match-contract VaultTest        # plain `forge test` also runs the Counter suite that `forge init` generates
```

```text
Ran 4 tests for test/Vault.t.sol:VaultTest
[PASS] testFuzz_Deposit(uint256) (runs: 256, μ: 200059, ~: 199478)
[PASS] test_Deposit() (gas: 207745)
[PASS] test_ForkMainnetUsdc() (gas: 16165)
[PASS] test_RevertWhen_CallerIsNotOwner() (gas: 36107)
Suite result: ok. 4 passed; 0 failed; 0 skipped
```

With `MAINNET_RPC_URL` unset the fork test fails with "vm.createSelectFork: environment variable `MAINNET_RPC_URL` not found"; `forge test --rerun` then retries only the failed tests.

### Example 2: Deploy to a local Anvil node and interact with cast

**User request:** "Deploy the vault locally and change the yield rate to 8%."

```bash
anvil                                        # terminal 1: chain id 31337 on http://127.0.0.1:8545, 10 funded accounts

# terminal 2 — account (0) printed by anvil; this key is public, never fund it on a real network
export RPC_URL=http://127.0.0.1:8545
export ANVIL_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export OWNER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

forge create test/Vault.t.sol:MockUSDC --rpc-url $RPC_URL --private-key $ANVIL_KEY --broadcast
# Deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
export ASSET_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $ANVIL_KEY --broadcast
#   Vault deployed at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
# ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
export VAULT=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

cast call $VAULT "yieldRate()(uint256)" --rpc-url $RPC_URL                 # 500
cast send $VAULT "setYieldRate(uint256)" 800 --rpc-url $RPC_URL --private-key $ANVIL_KEY
# status               1 (success)
cast call $VAULT "yieldRate()(uint256)" --rpc-url $RPC_URL                 # 800
cast send $VAULT "setYieldRate(uint256)" 2500 --rpc-url $RPC_URL --private-key $ANVIL_KEY
# Error: Failed to estimate gas: ... execution reverted ... RateTooHigh(2500)
cast balance $OWNER_ADDRESS --ether --rpc-url $RPC_URL                     # 9999.99...
```

`anvil --fork-url "$MAINNET_RPC_URL" --fork-block-number 21000000` starts the same node on top of mainnet state at a fixed block.

## Guidelines

1. **Keys stay out of the shell and the repo** — on real networks sign with `--account` (keystore from `cast wallet import`) or `--ledger`. `--private-key` and `vm.envUint("PRIVATE_KEY")` are for Anvil's public test keys only; keep `.env` out of version control.
2. **Simulate before broadcasting** — run `forge script` without `--broadcast` first. `--chain` only sets `block.chainid`; the network is chosen by `--rpc-url` (a URL or an `[rpc_endpoints]` alias).
3. **`testFail*` is gone** — such tests now fail with "`testFail*` has been removed". Name them `test_RevertWhen_...` and use `vm.expectRevert()`, matching custom errors by selector.
4. **Fuzzing** — constrain inputs with `bound()`; `vm.assume()` discards inputs and slows the run. Raise `fuzz.runs` in a CI profile (`FOUNDRY_PROFILE=ci`). Stateful properties go in `invariant_*` functions.
5. **Fork tests need an RPC endpoint** — pin a block (`vm.createSelectFork("mainnet", 21_000_000)`) so results are reproducible and cached, and keep them out of the default run with `--no-match-test` when no endpoint is configured.
6. **Gas tracking** — commit `.gas-snapshot` and run `forge snapshot --check` in CI; `forge snapshot --diff` shows the change per test.
7. **Dependencies** — pin tags with `forge install owner/repo@tag`, commit `foundry.lock` and `.gitmodules`, and clone with submodules (`actions/checkout` with `submodules: recursive`). Libraries from npm work with `libs = ["lib", "node_modules"]`, but submodules are the supported path.
8. **Verify what you install** — check release archives against the `.sha256` asset before extracting; for signed build provenance the docs use `gh attestation verify` with `--repo foundry-rs/foundry`.
9. **Debugging** — `cast decode-calldata`, `cast decode-error`, `cast 4byte`, `cast tx` and `forge test -vvvv` (full traces) explain most failures. Foundry targets the EVM and Solidity/Vyper; it is not a frontend or indexing framework.
