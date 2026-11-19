---
title: "Share a Local App with One Approved Reviewer"
slug: share-local-app-approved-reviewer
description: "Let one approved reviewer try a running local app, without deploying a copy or opening a public inbound app port."
category: development
tags: [localhost, private-previews, identity-first, ai-agents]
---

# Share a Local App with One Approved Reviewer

## The Problem

A developer has a working local app and wants a client or teammate to try one change. The preview needs a selected audience, not anonymous access for anyone who finds its address. A deployment for every small review adds work, while a screenshot does not let the reviewer try the app.

## The Solution

Identity first, then connection. qURL uses OpenNHP for cryptographic invisibility: the private share admits an approved identity before it connects that reviewer to the app. The access-request page is public; the protected app has no public inbound port through this workflow.

The app stays on the developer's machine. Local publishing needs no qURL account or API key. Keep the machine and app running, preserve the app's own authentication, and check company policy before sharing. qURL does not close other public routes to an app.

Use the [qURL CLI](https://github.com/layervai/qurl-integrations/releases/tag/v4.4.4). This guide uses the browser approval flow; the reviewer needs a browser and a passkey. A separate [approved-device agent recipe](https://github.com/layervai/qurl-integrations/blob/main/docs/approval-first-demo/agent-review.md) covers CLI-enabled reviewers.

## Step-by-Step Walkthrough

### 1. Select the app and one review action

Give your coding agent this task:

> Help me share my running local app with one reviewer. Ask me to confirm the exact loopback address and one action the reviewer should try. Keep application login and Host/Origin checks. Get my approval before publishing. Do not share a project root, dashboard, database, credentials or another service.

For example, a developer can ask a reviewer to open an order-preview screen with invented order data and confirm that its filter changes the visible items. Use a non-sensitive candidate. Do not copy production data to make the demo work.

### 2. Publish a new private resource

First check `qurl version`. Use CLI 4.4.4 or later so a confirmed resource identity can be recovered if local setup fails.

After the developer approves the exact app, the agent can run this macOS/Linux example. Replace port 3000 with the confirmed app port. Choose a fresh local ID on every run and wait at least a second before repeating this command; on Windows, supply a fresh ID instead of the shell date expression.

```sh
qurl publish http://127.0.0.1:3000 --id "client-review-$(date +%s)" --name "Private app review" --allow-requests --foreground -o json
```

Keep this terminal running. Before sending the returned `resource_url`, check that `private` is `true`, `found_existing` is `false`, and `access_requests` is `true`. Stop if any check fails. Do not change or delete a resource borrowed from an earlier review.

If publishing fails, keep the first failure. A failure receipt is not a working share. Inspect any confirmed resource with `qurl status CRID` and let its owner choose recovery; do not delete by name or retry blindly.

### 3. Verify the reviewer, then approve

Send the private resource address to your intended reviewer. They choose **Request access**, save a passkey and give you the displayed code through a conversation you trust. A typed name on the request is not identity proof.

If the app has request logs, record the observation window before approval. Keep local browser checks and health checks separate. The access page or an HTTP 200 from it does not prove that the app loaded. If app requests arrive during this window, investigate rather than calling the result zero requests.

In another terminal, use the exact `crid` from the new publication and the code received from your reviewer:

```sh
qurl approve CRID CODE
```

The reviewer chooses **Open** and performs the agreed app action. Ask them to confirm that action through your normal conversation. Preserve any failure step. Do not weaken app authentication or Host/Origin rules to force a pass.

### 4. End the review and verify cleanup

Ask the owner before permanently deleting the exact new resource. Deletion cannot be undone.

```sh
qurl delete CRID
qurl get CRID --file -
```

The fetch should fail after successful deletion. If cleanup fails, record it as unresolved. Stop only the publisher process created for this review, and stop the app only if its owner wants that. Preserve unrelated shares and processes.

## Real-World Example

For a runnable example, use the [two-page approval demo](https://github.com/layervai/qurl-integrations/tree/main/docs/approval-first-demo). It serves only the included non-sensitive pages on loopback and shows each HTTP request in the app terminal.

1. Start its Python fixture and publish a fresh private resource.
2. Have the reviewer request access. Check the actual app log during the unapproved window.
3. Approve their trusted code, then ask them to open the app and choose **Confirm the review**.
4. Confirm the second page and the corresponding app requests. Delete the owned resource and verify that access fails.

This gives the reviewer an actual app action to confirm. Extra browser requests can occur; use the real log instead of assuming an exact total. For a real app, test its own cookies, redirects and WebSockets when those features matter.

[Try the first-share walkthrough](https://qurl.link/share-without-deploying/?utm_source=terminalskills&utm_medium=referral&utm_campaign=first-share-pilot). If you choose to report a result, give the referring guide and whether your reviewer completed the agreed action. Keep app content, access links, approval codes and device keys out of public replies.

## Related Skills

- [playwright-testing](../skills/playwright-testing/) — Define a concrete browser action and its expected app result.
- [browser-use](../skills/browser-use/) — Automate a permitted browser task after access is approved; do not bypass passkey or trust checks.

I work on qURL at LayerV. This guide was prepared with AI assistance.
