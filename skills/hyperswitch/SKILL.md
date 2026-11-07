---
name: hyperswitch
description: >-
  Hyperswitch is an open-source payments switch written in Rust that puts one API in front of many payment processors such as Stripe, Adyen and PayPal, with routing, retries and a dashboard. Use when a user asks to run Hyperswitch locally with Docker Compose, connect a test processor, create and confirm a test payment through the REST API, split traffic between two processors, set routing rules, or refund a payment. Test mode and dummy processors only.
license: Apache-2.0
compatibility: "Docker 24+ with Compose v2, about 8 GB RAM; ports 8080, 8081, 9000, 9050, 5432, 6379 free"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: "payments, hyperswitch, payment-orchestration, routing, rust"
  repository: https://github.com/juspay/hyperswitch
---

# Hyperswitch — one payments API in front of many processors

## Overview

Hyperswitch (by Juspay) is a payments switch: your backend calls its REST API once, and it routes each payment to a processor you have connected, applies routing rules or traffic splits, and can retry on another processor. The app server (Rust) listens on port 8080 and the Control Center dashboard on port 9000.

An agent's realistic jobs are: start the stack, read the API key from the dashboard, register processor accounts, create routing rules, create and confirm test payments, refund them, and read status. Everything here runs in test mode. Use the built-in dummy processor `stripe_test` (also listed in the API enum: `fauxpay`, `pretendpay`) and documented test cards. Never put real card numbers or live processor credentials into a local stack.

Details were checked against the repository (docker-compose.yml, scripts/setup.sh, the OpenAPI file `api-reference/v1/openapi_spec_v1.json`) and docs.hyperswitch.io; the stack itself was not started while writing this skill, because it binds fixed ports. Treat the first run as the verification step, and expect to adjust a field if a response rejects it.

## Instructions

### Start a local stack

`scripts/setup.sh` is interactive (it asks you to pick a profile by keypress), so for an agent the Compose route is simpler. It builds nothing: it pulls prebuilt images from `docker.juspay.io`.

```bash
git clone --depth 1 --branch latest https://github.com/juspay/hyperswitch.git
cd hyperswitch || exit 1
docker compose up -d hyperswitch-server
curl -s http://localhost:8080/health
```

`hyperswitch-server` depends on Postgres, Redis and the `migration_runner` service (which installs the diesel CLI and `just` inside a Debian container, so the first start needs internet access and takes minutes); Compose starts them in order. If a service name differs in your checkout, run `docker compose config --services`. To also get the dashboard, add `hyperswitch-control-center` and `create-default-user`; the one-click script (`scripts/setup.sh`) offers three profiles: Standard (server plus Control Center), Full (adds monitoring and schedulers) and Standalone App Server (API only). It prints a demo login for the dashboard (`demo@hyperswitch.com` / `Hyperswitch@123`, a public default, so use it on a local machine only and never on a reachable host) and these URLs: app server `http://localhost:8080`, Control Center `http://localhost:9000`, Superposition `http://localhost:8081`, Grafana `http://localhost:3000` on the Full profile.

Notes before you run it:
- The compose file publishes ports on all interfaces. On a shared machine, edit the `ports:` entries to `127.0.0.1:...`.
- The post-start hook sends an anonymous status ping to `hyperswitch.gateway.scarf.sh`; read `scripts/poststart_hook.sh` if that matters in your environment.
- The Docker config (`config/docker_compose.toml`) ships `admin_api_key = "test_admin"`, a placeholder `jwt_secret` and a sample `master_enc_key`. These are for local testing only; production needs its own values.
- Stop with `docker compose down`; add `-v` only if you want to delete the database volume.

### Get a merchant API key

Easiest path: sign in to the Control Center (`http://localhost:9000`), go to Settings, Developers, and create an API key. Keep it in an environment variable. Merchant endpoints authenticate with the `api-key` header.

```bash
export HYPERSWITCH_URL=http://localhost:8080
export HYPERSWITCH_API_KEY=...        # created in Control Center, Settings > Developers
export HYPERSWITCH_PROFILE_ID=...     # shown on the same page (starts with pro_)
```

Admin-only endpoints (`POST /accounts` to create a merchant, `POST /api_keys/{merchant_id}` to mint a key) use the admin key from the server config. The OpenAPI file declares it as an `Authorization: admin-api-key=<key>` header, and the server source parses that format, for example `-H "Authorization: admin-api-key=$HYPERSWITCH_ADMIN_KEY"` with the value of `admin_api_key` from `config/docker_compose.toml`. If one of those calls answers 401, compare the header format against the OpenAPI file for your checkout before changing anything else.

### Connect a test processor

Register a processor account (a "merchant connector account", MCA). The `stripe_test` test connector takes a `HeaderKey` auth block with one `api_key` field (per the repository's connector config); use a placeholder value here. Create two with different labels if you want to split traffic:

```bash
curl -s -X POST "$HYPERSWITCH_URL/account/$HYPERSWITCH_MERCHANT_ID/connectors" \
  -H "api-key: $HYPERSWITCH_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "connector_type": "payment_processor",
    "connector_name": "stripe_test",
    "connector_label": "primary_test",
    "profile_id": "'"$HYPERSWITCH_PROFILE_ID"'",
    "connector_account_details": {"auth_type": "HeaderKey", "api_key": "dummy_key_primary"},
    "test_mode": true,
    "payment_methods_enabled": [{
      "payment_method": "card",
      "payment_method_types": [{"payment_method_type": "credit"}, {"payment_method_type": "debit"}]
    }]
  }'
```

The response contains `merchant_connector_id` (starts with `mca_`); save it. Repeat with `"connector_label": "backup_test"`. List them with `GET /account/{merchant_id}/connectors`. For a real processor the body is the same shape, with `connector_name` such as `adyen` and the credentials from that processor's guide in the docs; do that only with sandbox credentials.

### Create, confirm and retrieve a payment

Amounts are in minor units (6540 means 65.40). Create without confirming to get a `client_secret` for the front end, or create and confirm in one call from a server with a test card.

```bash
curl -s -X POST "$HYPERSWITCH_URL/payments" \
  -H "api-key: $HYPERSWITCH_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "amount": 6540, "currency": "USD", "confirm": true,
    "payment_id": "order_10482",
    "customer_id": "cus_maria_ortega",
    "description": "Annual plan, Northwind Supply",
    "authentication_type": "no_three_ds",
    "payment_method": "card",
    "payment_method_data": {"card": {
      "card_number": "4242424242424242", "card_exp_month": "10", "card_exp_year": "30",
      "card_holder_name": "Maria Ortega", "card_cvc": "123"}},
    "billing": {"address": {"country": "US", "zip": "94122", "first_name": "Maria", "last_name": "Ortega"}}
  }'
curl -s "$HYPERSWITCH_URL/payments/order_10482" -H "api-key: $HYPERSWITCH_API_KEY"
curl -s "$HYPERSWITCH_URL/payments/list?limit=10" -H "api-key: $HYPERSWITCH_API_KEY"
```

Look at `status` in the response: `succeeded`, `failed`, `processing`, `requires_customer_action` (3DS or redirect), `requires_capture` (manual capture) and `requires_payment_method` are the common ones. Also read `connector`, `connector_label` and `merchant_connector_id` (which processor account handled it) and `error_code`/`error_message` on failures. Without `confirm: true`, call `POST /payments/{payment_id}/confirm` later. For authorize-then-capture, create with `"capture_method": "manual"`, then `POST /payments/{payment_id}/capture` with `{"amount_to_capture": 6540}`; cancel with `POST /payments/{payment_id}/cancel`.

### Route traffic between processors

Routing configs are created, then activated per profile. A 70/30 volume split:

```bash
curl -s -X POST "$HYPERSWITCH_URL/routing" \
  -H "api-key: $HYPERSWITCH_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "name": "split-70-30", "description": "Canary the backup processor",
    "profile_id": "'"$HYPERSWITCH_PROFILE_ID"'", "transaction_type": "payment",
    "algorithm": {"type": "volume_split", "data": [
      {"connector": {"connector": "stripe_test", "merchant_connector_id": "'"$MCA_PRIMARY"'"}, "split": 70},
      {"connector": {"connector": "stripe_test", "merchant_connector_id": "'"$MCA_BACKUP"'"}, "split": 30}]}
  }'
# response has "id": the routing algorithm id
curl -s -X POST "$HYPERSWITCH_URL/routing/$ROUTING_ID/activate" -H "api-key: $HYPERSWITCH_API_KEY"
curl -s "$HYPERSWITCH_URL/routing/active?profile_id=$HYPERSWITCH_PROFILE_ID" -H "api-key: $HYPERSWITCH_API_KEY"
```

Other `algorithm.type` values are `single`, `priority` (an ordered fallback list), `advanced` (rule-based on amount, currency, country, payment method) and `three_ds_decision_rule`. Fallback order when no rule matches is set with `POST /routing/default`. Percentages are probabilities across many payments, not exact counts. Dynamic routing (success-rate based, elimination) is configured under `/account/{id}/business_profile/{profile_id}/dynamic_routing/...`, needs extra services, and is out of scope for a first local run.

### Refund

```bash
curl -s -X POST "$HYPERSWITCH_URL/refunds" \
  -H "api-key: $HYPERSWITCH_API_KEY" -H "Content-Type: application/json" \
  -d '{"payment_id": "order_10482", "amount": 1500, "reason": "Customer returned seat add-on", "refund_type": "instant"}'
curl -s "$HYPERSWITCH_URL/refunds/list" -X POST -H "api-key: $HYPERSWITCH_API_KEY" \
  -H "Content-Type: application/json" -d '{"payment_id": "order_10482"}'
```

Omit `amount` to refund the whole payment. Retrieve one refund with `GET /refunds/{refund_id}`.

## Examples

### Example 1: Smoke-test a fresh local stack

Request: "Start Hyperswitch locally and prove a test payment goes through the dummy processor."

Run the `docker compose up` and `/health` commands from the setup section, sign in at `http://localhost:9000` with the demo login the setup prints, create an API key under Settings, Developers, register `stripe_test` as shown, then send the create-and-confirm payment for 6540 USD.

Expected result (not yet run by the skill's authors): `/health` answers with a healthy message, the connector call returns an `mca_...` id, and the payment response shows a `status` (ideally `succeeded`) with `connector` set to `stripe_test`. If the status is `failed`, read `error_message` before changing anything.

### Example 2: Canary a second processor with a 70/30 split

Request: "We want 30% of card payments to go through the backup processor for a week, then check how they did."

Create two `stripe_test` accounts labelled `primary_test` and `backup_test`, save both `mca_` ids, `POST /routing` with the `volume_split` body, activate it, then send 20 payments with distinct `payment_id` values and count the `merchant_connector_id` per payment.

```bash
for i in $(seq 1 20); do
  curl -s -X POST "$HYPERSWITCH_URL/payments" -H "api-key: $HYPERSWITCH_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"amount":2500,"currency":"USD","confirm":true,"payment_id":"canary_'"$i"'","authentication_type":"no_three_ds","payment_method":"card","payment_method_data":{"card":{"card_number":"4242424242424242","card_exp_month":"10","card_exp_year":"30","card_holder_name":"Test Buyer","card_cvc":"123"}}}' \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['payment_id'],d['status'],d.get('merchant_connector_id'))"
done
```

Expected result: twenty lines of `canary_N <status> mca_...` with the ids spread roughly 70/30 between the two accounts, varying run to run. Two accounts of the same connector are not tested by the skill's authors; if routing ignores the split, check `GET /routing/active` first.

## Guidelines

- Test mode only. Never send real card numbers to a local or sandbox stack, and never commit API keys; read them from `HYPERSWITCH_API_KEY`-style environment variables. Real card data belongs behind Hyperswitch's SDK or vault, not in your own server logs.
- The card 4242424242424242 appears in the OpenAPI examples; whether a given connector accepts it is not guaranteed. A real processor's sandbox has its own test cards, so use its docs.
- Before any non-local use, replace `admin_api_key`, `jwt_secret`, `master_enc_key` and the demo dashboard login.
- Merchant key (`api-key`) for payments, connectors and routing; admin key for creating merchants and keys; publishable key only in the browser SDK. Do not mix them up.
- Make `payment_id` your own order reference when you can: re-sending the same `payment_id` is how you avoid double charges.
- Webhooks: set `webhook_details` on the merchant account or per connector so your server hears about asynchronous outcomes; verify the signature header before trusting a webhook.
- The compose stack is for development. For production use the Helm charts in the docs, your own secrets and keys, TLS, and network rules in front of both ports.
- Not the tool for a single-processor shop with no routing needs: the extra service is operational overhead. For plain Stripe billing see the stripe-billing skill.
