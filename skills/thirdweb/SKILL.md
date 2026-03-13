---
name: thirdweb
category: Blockchain & Web3
tags: [web3, sdk, smart-contracts, nft, wallet, multi-chain, typescript]
version: 1.0.0
author: terminal-skills
---

# thirdweb — Full-Stack Web3 Development Platform

You are an expert in thirdweb, the complete web3 development platform that provides SDKs, pre-built smart contracts, wallet infrastructure, and payment solutions. You help developers build dApps using thirdweb's React hooks, contract deployment (ERC-20, ERC-721, ERC-1155, marketplace), embedded wallets, fiat-to-crypto onramps, and multi-chain support — from prototype to production without deep blockchain expertise.

## Core Capabilities

### React SDK

```tsx
// src/app/providers.tsx — thirdweb setup
import { ThirdwebProvider } from "thirdweb/react";
import { createThirdwebClient } from "thirdweb";

const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
});

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThirdwebProvider>{children}</ThirdwebProvider>;
}
```

```tsx
// src/components/ConnectWallet.tsx
import { ConnectButton } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";

const wallets = [
  inAppWallet({                           // Email/social login (no extension)
    auth: { options: ["email", "google", "apple"] },
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("io.rabby"),
];

export function ConnectWallet() {
  return (
    <ConnectButton
      client={client}
      wallets={wallets}
      theme="dark"
      connectModal={{ size: "compact" }}
    />
  );
}
```

### Smart Contract Interaction

```tsx
// src/components/NFTMint.tsx
import { useReadContract, useSendTransaction } from "thirdweb/react";
import { getContract, prepareContractCall } from "thirdweb";
import { ethereum } from "thirdweb/chains";

const nftContract = getContract({
  client,
  chain: ethereum,
  address: "0x...",
});

export function NFTMint() {
  // Read contract data
  const { data: totalSupply } = useReadContract({
    contract: nftContract,
    method: "function totalSupply() view returns (uint256)",
  });

  const { data: price } = useReadContract({
    contract: nftContract,
    method: "function mintPrice() view returns (uint256)",
  });

  // Write transaction
  const { mutate: sendTx, isPending } = useSendTransaction();

  function handleMint() {
    const tx = prepareContractCall({
      contract: nftContract,
      method: "function mint(uint256 quantity)",
      params: [1n],
      value: price,
    });
    sendTx(tx);
  }

  return (
    <div>
      <p>Minted: {totalSupply?.toString()} / 10,000</p>
      <button onClick={handleMint} disabled={isPending}>
        {isPending ? "Minting..." : `Mint (${formatEther(price || 0n)} ETH)`}
      </button>
    </div>
  );
}
```

### Deploy Contracts (No Solidity Required)

```typescript
// scripts/deploy.ts — Deploy pre-built contracts
import { deployPublishedContract } from "thirdweb/deploys";

// Deploy ERC-721 NFT collection
const nftAddress = await deployPublishedContract({
  client,
  chain: ethereum,
  account: wallet,
  contractId: "NFTCollection",
  contractParams: {
    name: "My Collection",
    symbol: "MC",
    royaltyBps: 500n,                     // 5% royalties
    royaltyRecipient: wallet.address,
  },
});

// Deploy ERC-20 token
const tokenAddress = await deployPublishedContract({
  client,
  chain: ethereum,
  account: wallet,
  contractId: "TokenERC20",
  contractParams: {
    name: "My Token",
    symbol: "MTK",
    initialSupply: parseEther("1000000"),
  },
});

// Deploy marketplace
const marketplaceAddress = await deployPublishedContract({
  client,
  chain: ethereum,
  account: wallet,
  contractId: "Marketplace",
  contractParams: { platformFeeBps: 250n },  // 2.5% fee
});
```

### Engine (Backend API)

```typescript
// thirdweb Engine — managed backend for web3
// Self-hosted or cloud: handles wallets, transactions, webhooks

// Mint NFT via REST API (no frontend wallet needed)
const response = await fetch(`${ENGINE_URL}/contract/${chain}/${address}/erc721/mint-to`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${ENGINE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    "x-backend-wallet-address": BACKEND_WALLET,
  },
  body: JSON.stringify({
    receiver: userAddress,
    metadata: { name: "NFT #1", image: "ipfs://...", attributes: [] },
  }),
});
```

## Installation

```bash
npx thirdweb create app                   # Scaffold new app
npm install thirdweb                      # Add to existing project
npx thirdweb deploy                       # Deploy custom contracts
npx thirdweb publish                      # Publish to thirdweb registry
```

## Best Practices

1. **In-app wallets for onboarding** — Use email/social login wallets; users don't need MetaMask to start
2. **Pre-built contracts** — Deploy ERC-20, ERC-721, ERC-1155, marketplace without writing Solidity
3. **React hooks** — `useReadContract` for reads, `useSendTransaction` for writes; type-safe from ABI
4. **Engine for backends** — Use thirdweb Engine for server-side minting, gasless transactions, and webhooks
5. **Multi-chain** — Same code works across Ethereum, Polygon, Base, Arbitrum, Solana — just change the chain
6. **Pay for onramps** — Integrate fiat-to-crypto payments; users buy with credit card, receive tokens
7. **IPFS storage** — Use thirdweb Storage for decentralized file hosting (NFT metadata, images)
8. **Account abstraction** — Enable gasless transactions with ERC-4337; sponsor gas for better UX
