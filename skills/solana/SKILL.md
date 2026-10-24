---
name: solana
description: >-
  Solana is a high-throughput blockchain with 400 ms slots and sub-cent fees. Use this skill to
  write on-chain programs in Rust with the Anchor framework, talk to the network from TypeScript
  with @solana/kit, create SPL tokens with the Solana CLI, and test and deploy to devnet. Trigger
  words: solana, anchor, smart contract, spl token, program derived address, solana web3.js, devnet.
license: Apache-2.0
compatibility: "Rust (rustup), Solana CLI (Agave) 3.x or newer, Anchor 1.x, Node.js 20.18+ for the TypeScript SDKs"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - blockchain
    - rust
    - smart-contracts
    - anchor
    - web3
  repository: https://github.com/anza-xyz/agave
---

# Solana

## Overview

Solana programs are compiled Rust (usually written with Anchor) that run on validators and own no state themselves: state lives in separate accounts that each transaction lists up front, which is what allows parallel execution. Checked here (October 2026): Anchor 1.2.1 (`anchor-lang`, CLI `anchor-cli`, TypeScript client `@anchor-lang/core`), Agave validator and Solana CLI 4.3.2, `@solana/kit` 8.5.0, `@solana/web3.js` 3.1.1, `@solana/spl-token` 0.4.15.

JavaScript SDK choice: `@solana/kit` is the renamed 2.x rewrite of web3.js (functional, tree-shakable, `bigint` lamports). `@solana/web3.js` 3.x keeps the old class-based API (`Connection`, `PublicKey`) on top of Kit; the 1.x line gets critical fixes only. Use Kit for new code. The Anchor TypeScript client still depends on web3.js 1.x types.

## Instructions

### Install the toolchain

Follow the official installation page (https://solana.com/docs/intro/installation): Rust through rustup, the Solana CLI through Anza's installer, then Anchor through AVM. Do not pipe a downloaded script into a shell on the user's behalf; download the installer, read it, then run it, or use a system that already has the tools. Linux needs `build-essential pkg-config libudev-dev llvm libclang-dev protobuf-compiler libssl-dev`.

```bash
cargo install --git https://github.com/otter-sec/anchor avm --force
avm install 1.2.1 && avm use 1.2.1
anchor --version                  # anchor-cli 1.2.1
solana config set --url devnet    # also -ul localhost, -um mainnet-beta
solana-keygen new                 # writes ~/.config/solana/id.json, never commit it
solana airdrop 2 && solana balance
```

### Anchor project

```bash
anchor init counter               # Rust tests with LiteSVM by default; --test-template mocha for TypeScript tests
cd counter
anchor keys sync                  # make declare_id! and Anchor.toml match the program keypair
anchor build                      # outputs target/deploy/*.so and target/idl, target/types
anchor test
anchor deploy                     # to the cluster set in Anchor.toml
```

`anchor init` generates a modular layout by default (separate instruction, state and error files); `--template single` gives one `lib.rs`. The program below is written as a single file. The generated test targets the template program, so replace or delete it (in `programs/counter/tests/`, or `tests/` with `--test-template mocha`) before `anchor test` on this program:

```rust
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"); // replaced by `anchor keys sync`

#[program]
pub mod counter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = 0;
        counter.authority = ctx.accounts.authority.key();
        counter.bump = ctx.bumps.counter;
        Ok(())
    }

    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = counter.count.checked_add(1).ok_or(ErrorCode::Overflow)?;
        emit!(CounterIncremented { count: counter.count, authority: ctx.accounts.authority.key() });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + Counter::INIT_SPACE,
              seeds = [b"counter", authority.key().as_ref()], bump)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(mut, seeds = [b"counter", authority.key().as_ref()], bump = counter.bump, has_one = authority)]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Counter { pub count: u64, pub authority: Pubkey, pub bump: u8 }

#[event]
pub struct CounterIncremented { pub count: u64, pub authority: Pubkey }

#[error_code]
pub enum ErrorCode { #[msg("Counter overflow")] Overflow }
```

### Client with @solana/kit

```bash
npm install @solana/kit @solana-program/system @solana-program/token
```

```typescript
import {
  address, appendTransactionMessageInstruction, assertIsTransactionWithBlockhashLifetime, createSolanaRpc, createSolanaRpcSubscriptions,
  createTransactionMessage, generateKeyPairSigner, getSignatureFromTransaction, lamports, pipe,
  sendAndConfirmTransactionFactory, setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";

const rpc = createSolanaRpc("https://api.devnet.solana.com");
const rpcSubscriptions = createSolanaRpcSubscriptions("wss://api.devnet.solana.com");
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

const payer = await generateKeyPairSigner();           // load a real signer from a file in production
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
const message = pipe(
  createTransactionMessage({ version: 0 }),
  (m) => setTransactionMessageFeePayerSigner(payer, m),
  (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
  (m) => appendTransactionMessageInstruction(
    getTransferSolInstruction({
      source: payer,
      destination: address("8dBTPrjnkXyuQK3KDt9wrZBfizEZijmmUQXVHpFbVwGT"),
      amount: lamports(1_000_000n),
    }), m),
);
const signed = await signTransactionMessageWithSigners(message);
assertIsTransactionWithBlockhashLifetime(signed);       // narrows the lifetime type that sendAndConfirm requires
await sendAndConfirm(signed, { commitment: "confirmed" });  // needs a funded payer
console.log(getSignatureFromTransaction(signed));
```

Reading is simpler: `await rpc.getBalance(address("...")).send()` returns `{ value: bigint }`. If a library still needs the class API, `new Connection(url, "confirmed")` from `@solana/web3.js@3` works the same as before.

### Calling an Anchor program from TypeScript

```bash
npm install @anchor-lang/core
```

```typescript
import { AnchorProvider, Program } from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import idl from "../target/idl/counter.json";
import type { Counter } from "../target/types/counter";

const provider = AnchorProvider.env();            // reads ANCHOR_PROVIDER_URL and ANCHOR_WALLET
const program = new Program<Counter>(idl as Counter, provider);   // program id comes from idl.address

const [counterPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("counter"), provider.wallet.publicKey.toBuffer()], program.programId);

await program.methods.increment().accountsPartial({ counter: counterPda, authority: provider.wallet.publicKey }).rpc();
const account = await program.account.counter.fetch(counterPda);
console.log(account.count.toString());
```

Since Anchor 0.30 the program id is read from the IDL (`new Program(idl, provider)`), and `accounts` resolves PDAs and well-known accounts automatically; `accountsPartial` lets you override some, `accountsStrict` requires all.

### SPL tokens

```bash
spl-token create-token --decimals 6                      # prints the new mint address
spl-token create-account 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
spl-token mint 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 1000000
spl-token transfer 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 100 4Nd1mYQv7K3Y8dX6pTqK2sH9uEoLw3bRZfCjV5aMxN1t
```

In TypeScript use `@solana-program/token` with Kit (or `@solana/spl-token` with web3.js). For mints with extensions, use the Token-2022 program and its `--program-id` option in the CLI.

## Examples

### Example 1: Ship the counter program to devnet

**User request:** "Create an Anchor counter program, test it and deploy it to devnet."

```bash
solana config set --url devnet && solana airdrop 2
anchor init counter --template single && cd counter
# paste the program above into programs/counter/src/lib.rs and replace the generated test
anchor keys sync && anchor build
anchor deploy --provider.cluster devnet
```

The build prints the program id and the deploy ends with `Deploy success`; check it with `solana program show` followed by that program id.

### Example 2: Send 0.001 SOL from a script

**User request:** "Write a Node script that sends 0.001 SOL on devnet."

Use the Kit snippet above; load the payer with `createKeyPairSignerFromBytes` from a keypair file read at runtime, run `solana airdrop 1 <address> --url devnet` first. The script prints the transaction signature, which `solana confirm <signature> -ud` verifies.

## Guidelines

- Use Anchor for account validation and (de)serialisation; derive `InitSpace` and add 8 bytes for the discriminator.
- Derive state addresses as PDAs; store the bump and pass `bump = account.bump` to avoid recomputation.
- Use `checked_*` arithmetic instead of relying on overflow panics.
- Check that every account's owner, signer status and relationship (`has_one`, `constraint`) is validated; missing checks are the main source of Solana exploits.
- Rent exemption is paid at account creation (`init` handles it); closing an account returns the lamports.
- Test on devnet or a local validator (`solana-test-validator`); devnet airdrops are rate-limited and tokens have no value. Never put a mainnet keypair in a repository or send a real private key to a script you did not write.
- Deploying to mainnet needs SOL for the program account rent; review `Anchor.toml` cluster and upgrade authority first.
