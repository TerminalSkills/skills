---
name: solana
description: >-
  You are an expert in Solana blockchain development. You help developers
  build on-chain programs (smart contracts) in Rust, interact with the Solana
  network using @solana/web3.js, create tokens (SPL), build NFT collections,
  and integrate with wallets — leveraging Solana's 400ms block times, parallel
  transaction processing, and sub-cent fees for high-throughput applications.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Blockchain & Web3
  tags:
    - blockchain
    - rust
    - smart-contracts
    - defi
    - nft
    - high-performance
    - web3
---

# Solana — High-Performance Blockchain Development

You are an expert in Solana blockchain development. You help developers build on-chain programs (smart contracts) in Rust, interact with the Solana network using @solana/web3.js, create tokens (SPL), build NFT collections, and integrate with wallets — leveraging Solana's 400ms block times, parallel transaction processing, and sub-cent fees for high-throughput applications.

## Core Capabilities

### On-Chain Program (Rust)

```rust
// programs/counter/src/lib.rs — Solana program with Anchor
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

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
        counter.count = counter.count.checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
        emit!(CounterIncremented {
            count: counter.count,
            authority: ctx.accounts.authority.key(),
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Counter::INIT_SPACE,
        seeds = [b"counter", authority.key().as_ref()],
        bump,
    )]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Increment<'info> {
    #[account(
        mut,
        seeds = [b"counter", authority.key().as_ref()],
        bump = counter.bump,
        has_one = authority,
    )]
    pub counter: Account<'info, Counter>,
    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
    pub bump: u8,
}

#[event]
pub struct CounterIncremented {
    pub count: u64,
    pub authority: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Counter overflow")]
    Overflow,
}
```

### Client SDK (TypeScript)

```typescript
import { Connection, PublicKey, Keypair, clusterApiUrl } from "@solana/web3.js";
import { Program, AnchorProvider, web3, BN } from "@coral-xyz/anchor";
import { IDL, Counter } from "./idl/counter";

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Read account data
async function getCounter(authority: PublicKey): Promise<{ count: number }> {
  const [counterPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), authority.toBuffer()],
    PROGRAM_ID,
  );

  const program = new Program<Counter>(IDL, PROGRAM_ID, provider);
  const account = await program.account.counter.fetch(counterPDA);
  return { count: account.count.toNumber() };
}

// Send transaction
async function increment(wallet: AnchorProvider): Promise<string> {
  const program = new Program<Counter>(IDL, PROGRAM_ID, wallet);
  const [counterPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), wallet.publicKey.toBuffer()],
    PROGRAM_ID,
  );

  const tx = await program.methods
    .increment()
    .accounts({ counter: counterPDA, authority: wallet.publicKey })
    .rpc();

  return tx;   // Transaction signature
}
```

### SPL Token Creation

```bash
# Create a new token
spl-token create-token --decimals 6
# Token: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

# Create token account and mint
spl-token create-account 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
spl-token mint 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 1000000

# Transfer
spl-token transfer 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 100 RECIPIENT_ADDRESS
```

## Installation

```bash
# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
solana config set --url devnet

# Anchor framework
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install latest && avm use latest

# New project
anchor init my-program
anchor build
anchor test
anchor deploy
```

## Best Practices

1. **Anchor framework** — Use Anchor for account validation, (de)serialization, and error handling; raw Solana is error-prone
2. **PDAs for program-owned accounts** — Use Program Derived Addresses with seeds; deterministic, no private key needed
3. **Account size planning** — Solana accounts must declare size at creation; use `#[derive(InitSpace)]` for automatic calculation
4. **Checked math** — Use `checked_add`, `checked_mul` to prevent overflow; Solana doesn't have SafeMath by default
5. **Rent exemption** — Accounts need minimum balance for rent exemption (~0.002 SOL); Anchor handles this automatically
6. **CPI for composability** — Use Cross-Program Invocations to call other programs (token transfers, DEX swaps)
7. **Events for indexing** — Emit events with `emit!`; indexers (Helius, Shyft) pick them up for off-chain data
8. **Test on devnet** — Use `solana airdrop 2` for free devnet SOL; test thoroughly before mainnet deployment
