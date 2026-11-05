---
title: Route Payments Across Processors with Hyperswitch
slug: route-payments-across-processors-with-hyperswitch
description: Stand up an open-source payments switch, rehearse a 70/30 traffic split between two processors in test mode, and see which processor handled each payment before touching production.
skills:
  - hyperswitch
  - stripe-billing
category: business
tags:
  - payments
  - payment-routing
  - failover
  - processors
  - test-mode
---

# Route Payments Across Processors with Hyperswitch

Tomás Herrera runs engineering at Northwind Supply, an online store taking about 2,400 card payments a month through a single processor. Twice this quarter that processor had an outage during a sale and checkout failed for 40 minutes each time. The business wants a second processor in place, with a small share of traffic on it to prove it works, and an automatic way to prefer one over the other. Tomás wants to rehearse all of it without touching live payments.

## The Problem

Every payment call in the store goes straight to one processor's API. Adding a second one means writing a second integration, deciding per request which to call, handling two sets of error codes and reconciling two dashboards. Nobody wants to do that in the middle of a quarter, and nobody wants to test a routing change on real customers. Without a switch layer, "send 30% to the backup" is a code change plus a deploy, and rolling it back is another.

## The Solution

Put Hyperswitch between the store and the processors. The store makes one payments API call; Hyperswitch holds the processor accounts and a routing rule, and the rule can change without a deploy. The agent starts the stack locally with Docker Compose, registers two dummy processor accounts, creates a 70/30 volume-split rule, and sends a batch of test payments to see the split. The existing Stripe integration stays a reference for the per-payment fields the store already sends, so the **stripe-billing** skill covers the processor side while **hyperswitch** covers the switch.

## Step-by-Step Walkthrough

### 1. Start the stack locally

Prompt to the agent: "Start Hyperswitch locally from the official repo and tell me when the health check passes. Bind nothing to a public interface."

```bash
git clone --depth 1 --branch latest https://github.com/juspay/hyperswitch.git
cd hyperswitch || exit 1
docker compose up -d hyperswitch-server hyperswitch-control-center
curl -s http://localhost:8080/health
```

The agent first edits the `ports:` entries in the compose file to `127.0.0.1:...`, waits for the migration service to finish (the first start takes several minutes), then reports the health response and the Control Center URL, `http://localhost:9000`.

### 2. Create an API key and register two test processors

Prompt: "In the Control Center I made an API key. It is in HYPERSWITCH_API_KEY and the profile id is in HYPERSWITCH_PROFILE_ID. Add two dummy processor accounts, one labelled primary_test and one backup_test."

```bash
for label in primary_test backup_test; do
  curl -s -X POST "$HYPERSWITCH_URL/account/$HYPERSWITCH_MERCHANT_ID/connectors" \
    -H "api-key: $HYPERSWITCH_API_KEY" -H "Content-Type: application/json" \
    -d '{"connector_type":"payment_processor","connector_name":"stripe_test","connector_label":"'"$label"'","profile_id":"'"$HYPERSWITCH_PROFILE_ID"'","connector_account_details":{"auth_type":"HeaderKey","api_key":"dummy_'"$label"'"},"test_mode":true,"payment_methods_enabled":[{"payment_method":"card","payment_method_types":[{"payment_method_type":"credit"},{"payment_method_type":"debit"}]}]}'
done
```

Each response includes a `merchant_connector_id` starting with `mca_`. The agent stores them as `MCA_PRIMARY` and `MCA_BACKUP`.

### 3. Create and activate the 70/30 rule

Prompt: "Create a volume split with 70 on primary and 30 on backup, then activate it for this profile."

```bash
curl -s -X POST "$HYPERSWITCH_URL/routing" \
  -H "api-key: $HYPERSWITCH_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"split-70-30","description":"Canary the backup processor","profile_id":"'"$HYPERSWITCH_PROFILE_ID"'","transaction_type":"payment","algorithm":{"type":"volume_split","data":[{"connector":{"connector":"stripe_test","merchant_connector_id":"'"$MCA_PRIMARY"'"},"split":70},{"connector":{"connector":"stripe_test","merchant_connector_id":"'"$MCA_BACKUP"'"},"split":30}]}}'
curl -s -X POST "$HYPERSWITCH_URL/routing/$ROUTING_ID/activate" -H "api-key: $HYPERSWITCH_API_KEY"
curl -s "$HYPERSWITCH_URL/routing/active?profile_id=$HYPERSWITCH_PROFILE_ID" -H "api-key: $HYPERSWITCH_API_KEY"
```

The last call confirms which rule is live.

### 4. Send a batch of test payments and count the split

Prompt: "Send 40 test payments of 25.00 USD with the test card from the Hyperswitch API examples, and give me a count per processor account."

```bash
for i in $(seq 1 40); do
  curl -s -X POST "$HYPERSWITCH_URL/payments" -H "api-key: $HYPERSWITCH_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"amount":2500,"currency":"USD","confirm":true,"payment_id":"rehearsal_'"$i"'","authentication_type":"no_three_ds","payment_method":"card","payment_method_data":{"card":{"card_number":"4242424242424242","card_exp_month":"10","card_exp_year":"30","card_holder_name":"Test Buyer","card_cvc":"123"}}}' \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['status'],d.get('merchant_connector_id'))"
done | sort | uniq -c
```

The agent reports the counts and flags any status other than `succeeded`.

### 5. Practice the refund and the rollback

Prompt: "Refund rehearsal_7 in full, then switch routing back to primary only."

The agent calls `POST /refunds` with `{"payment_id":"rehearsal_7","refund_type":"instant"}`, then creates and activates a `single` routing rule pointing at `MCA_PRIMARY`. Both steps are one API call each, with no code deploy.

## Real-World Example

On a Thursday afternoon, Tomás's agent runs the rehearsal. The stack starts, both dummy accounts register, and the 40-payment batch should print counts per processor account near 28 and 12 (the split is probabilistic, so exact counts vary), and any status other than `succeeded` is flagged for a look. The refund of `rehearsal_7` succeeds, and the switch back to a single-processor rule takes one call.

Tomás takes three things to the team: the routing change needs no store deploy, the per-payment result tells you which processor account handled it, and a rollback is a single rule change. The next step is to repeat the rehearsal with the second processor's sandbox credentials, then decide the production split. The local stack's default secrets stay in the local environment only.

## Related Skills

- [hyperswitch](/skills/hyperswitch) — runs the local stack, registers processor accounts, creates routing rules, and sends test payments and refunds
- [stripe-billing](/skills/stripe-billing) — covers the existing Stripe-side setup whose payment fields the store keeps sending through the switch
