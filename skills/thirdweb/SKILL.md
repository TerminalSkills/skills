---
name: thirdweb
description: >-
  thirdweb is a web3 development platform: a TypeScript and React SDK for
  connecting wallets, reading and writing smart contracts, deploying prebuilt
  ERC-20, ERC-721, ERC-1155 and marketplace contracts, in-app (email and social
  login) wallets, server wallets for backend transactions, and fiat-to-crypto
  purchase widgets. Use it when someone asks to add a wallet connect button,
  mint an NFT from a backend, deploy a token without writing Solidity, or
  onboard users without MetaMask.
license: Apache-2.0
compatibility: Node.js 18+, TypeScript 5+, React 18 or 19 for the UI components; a thirdweb project with a client ID (browser) or secret key (server)
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/thirdweb-dev/js
  tags: "web3, sdk, smart-contracts, nft, wallet"
---

# thirdweb

## Overview

thirdweb ships one npm package, `thirdweb` (v5, checked against 5.122.0), with subpath exports: `thirdweb` (client, contracts, transactions), `thirdweb/react` (provider, `ConnectButton`, hooks, `BuyWidget`), `thirdweb/wallets`, `thirdweb/chains`, `thirdweb/deploys`, `thirdweb/extensions/*` (typed ERC-721, ERC-20, marketplace calls), `thirdweb/storage` and `thirdweb/engine` (server wallets). Everything needs a `ThirdwebClient`: a public **client ID** in the browser, a **secret key** only on a server. Create both in a project at thirdweb.com/dashboard and restrict the client ID to your domains there.

The v4 packages (`@thirdweb-dev/sdk`, `@thirdweb-dev/react`) and the old `contractType`/`useContract` API are legacy; use v5 for anything new.

## Instructions

1. Install: `npm install thirdweb`. Put the client ID in `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` (or your framework's public prefix) and the secret key in `THIRDWEB_SECRET_KEY`, server only.
2. Create one client module, wrap the app in `ThirdwebProvider` (it takes no `client` prop), and pass `client` to every component and function.
3. Read with `useReadContract` (a human-readable ABI string as `method`), write with `prepareContractCall` plus `useSendTransaction`. Values are `bigint`; convert with `toEther`, `toWei`, `toTokens`.
4. Prefer the typed extension functions (`mintTo`, `claimTo`, `transfer`, ...) for standard contracts instead of hand-written ABI strings.
5. Deploy prebuilt contracts from code with `deployERC721Contract`, `deployERC20Contract`, `deployERC1155Contract`, `deployMarketplaceContract` (`thirdweb/deploys`), or deploy any published contract with `deployPublishedContract({ contractId, contractParams })`. The deployer is an `Account`, for example `privateKeyToAccount`.
6. For backends use `Engine.serverWallet` from `thirdweb`: it signs through a managed server wallet, queues transactions and retries stuck ones, so no private key lives in your app.
7. CLI: `npx thirdweb generate <chainId>/<contractAddress>` generates typed bindings locally (no key needed); `deploy`, `publish` and `upload` are forwarded to `@thirdweb-dev/cli@latest` and exit unless you pass `-k $THIRDWEB_SECRET_KEY`. `npx thirdweb create` is deprecated and exits with an error: start from a framework template and `npm install thirdweb`.

## Examples

### Example 1: connect button with email, social and external wallets

Request: "Add login to my Next.js app so people without MetaMask can sign in."

```tsx
// src/lib/thirdweb.ts
import { createThirdwebClient } from "thirdweb";

export const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID!,
});
```

```tsx
// src/app/providers.tsx
"use client";
import { ThirdwebProvider } from "thirdweb/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThirdwebProvider>{children}</ThirdwebProvider>;
}
```

```tsx
// src/components/Login.tsx
"use client";
import { ConnectButton } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import { base } from "thirdweb/chains";
import { client } from "@/lib/thirdweb";

const wallets = [
  inAppWallet({ auth: { options: ["email", "google", "apple"] } }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
];

export function Login() {
  return <ConnectButton client={client} wallets={wallets} chain={base} theme="dark" />;
}
```

Result: a button that opens a modal with email, Google, Apple and two browser wallets; an in-app wallet is created on first sign-in.

### Example 2: read supply and mint from a component

Request: "Show how many are minted and let the user mint one."

```tsx
"use client";
import { useReadContract, useSendTransaction } from "thirdweb/react";
import { getContract, prepareContractCall, toEther } from "thirdweb";
import { base } from "thirdweb/chains";
import { client } from "@/lib/thirdweb";

const nft = getContract({
  client,
  chain: base,
  address: "0x5B2f1c7A9e4D3b8a6C0d1E2F3a4B5c6D7e8F9a0b",
});

export function MintCard() {
  const { data: supply } = useReadContract({
    contract: nft,
    method: "function totalSupply() view returns (uint256)",
  });
  const { data: price } = useReadContract({
    contract: nft,
    method: "function mintPrice() view returns (uint256)",
  });
  const { mutate: send, isPending } = useSendTransaction();

  function mint() {
    if (price === undefined) return;
    send(
      prepareContractCall({
        contract: nft,
        method: "function mint(uint256 quantity)",
        params: [1n],
        value: price,
      }),
    );
  }

  return (
    <button onClick={mint} disabled={isPending || price === undefined}>
      {isPending ? "Minting..." : `Mint ${supply?.toString() ?? "?"} so far, ${toEther(price ?? 0n)} ETH`}
    </button>
  );
}
```

The `mintPrice` and `mint` signatures belong to your own contract; replace them with its real ABI or use the extension functions for thirdweb prebuilts.

### Example 3: deploy an NFT collection and mint from the server

Request: "Deploy a collection on Base and mint the first NFT from my backend."

```typescript
// scripts/deploy.ts
import { createThirdwebClient, getContract, Engine } from "thirdweb";
import { base } from "thirdweb/chains";
import { privateKeyToAccount } from "thirdweb/wallets";
import { deployERC721Contract } from "thirdweb/deploys";
import { mintTo } from "thirdweb/extensions/erc721";

const client = createThirdwebClient({ secretKey: process.env.THIRDWEB_SECRET_KEY! });
const deployer = privateKeyToAccount({ client, privateKey: process.env.DEPLOYER_PRIVATE_KEY! });

const address = await deployERC721Contract({
  client,
  chain: base,
  account: deployer,
  type: "TokenERC721",
  params: {
    name: "Harbor Cats",
    symbol: "HCAT",
    defaultAdmin: process.env.SERVER_WALLET_ADDRESS!, // receives the minter role so the server wallet can mint
    royaltyRecipient: deployer.address,
    royaltyBps: 500n, // 5%
  },
});

const serverWallet = Engine.serverWallet({
  client,
  address: process.env.SERVER_WALLET_ADDRESS!,
  vaultAccessToken: process.env.THIRDWEB_VAULT_ACCESS_TOKEN,
});

const { transactionId } = await serverWallet.enqueueTransaction({
  transaction: mintTo({
    contract: getContract({ client, chain: base, address }),
    to: "0x9C1a2B3d4E5f60718293a4B5c6D7e8F90a1B2c3D",
    nft: { name: "Harbor Cat #1", description: "First of the colony" },
  }),
});
const { transactionHash } = await Engine.waitForTransactionHash({ client, transactionId });
console.log(address, transactionHash);
```

Result: the collection address, then the hash of the mint once the server wallet has sent it. Create the server wallet in the dashboard (Transactions) first; `deployMarketplaceContract` takes `params: { name, platformFeeBps: 250, platformFeeRecipient }` (a number, unlike the ERC-721/20 `bigint` fees).

## Guidelines

- The secret key and any private key stay on the server. Never put them in `NEXT_PUBLIC_*` variables; the client ID is the only credential meant for the browser.
- Fund a wallet with a purchase flow using `BuyWidget` from `thirdweb/react` (card or crypto to a token on a chain), instead of linking users to an exchange.
- Gasless UX: pass `accountAbstraction: { chain, sponsorGas: true }` to `ConnectButton` or `inAppWallet({ executionMode: { mode: "EIP4337", smartAccount: { chain, sponsorGas: true } } })` to use ERC-4337 smart accounts with sponsored gas.
- Engine was renamed: the hosted product is now "Transactions" (server wallets), and the self-hosted Engine v2 REST API (`/contract/<chain>/<address>/erc721/mint-to`) is the older line. Prefer `Engine.serverWallet` from the SDK for new code.
- Deploy on a testnet such as `baseSepolia` first; deployment and mints are irreversible and cost real gas on mainnets.
- Chains are plain objects from `thirdweb/chains` (`ethereum`, `polygon`, `base`, `arbitrum`, `optimism`, ...); use `defineChain(id)` for others.
