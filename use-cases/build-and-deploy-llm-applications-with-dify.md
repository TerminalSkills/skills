---
title: Build and Deploy LLM Applications with Dify
slug: build-and-deploy-llm-applications-with-dify
description: Move a Dify workflow from a laptop prototype to a self-hosted server with an API, a scripted knowledge base and versioned app definitions, for small platform teams.
skills:
  - dify
  - docker-helper
category: data-ai
tags:
  - dify
  - llm-apps
  - rag
  - self-hosted
  - docker-compose
---

## The Problem

Marta Kowalczyk is the platform engineer at Brightpath Logistics, a freight broker with 60 employees. The support lead built a "Support Triage" workflow in Dify on her own laptop: it reads an incoming ticket, looks up the returns and claims policies, and answers with a category, a priority and a suggested reply. It works well on the 30 tickets she tried by hand.

Now the helpdesk backend has to call it for roughly 900 tickets a day, and the laptop is not a server. Marta needs the same app on a company machine, with the three policy PDFs loaded the same way every time, the workflow definition stored in git next to the helpdesk code, and an upgrade routine that cannot lose the knowledge base. She does not want to click through the console for every one of those steps.

## The Solution

Use the **dify** skill to deploy Dify with Docker Compose, import the workflow from its DSL file with `difyctl`, load the knowledge base through the Service API and call the published workflow from the helpdesk backend. Use the **docker-helper** skill to check the Compose stack and resolve the port conflict on the shared server. Marta only does the three things that need a browser: creating the admin account, adding the model provider key, and creating API keys.

## Step-by-Step Walkthrough

### 1. Deploy the stack on the staging server

```text
Deploy the latest Dify release on this server. Port 80 is already used by our intranet, so publish Dify on 8080. Replace the default passwords and protect the install page.
```

```bash
git clone --branch "$(curl -s https://api.github.com/repos/langgenius/dify/releases/latest | jq -r .tag_name)" \
  https://github.com/langgenius/dify.git
cd dify/docker
cp .env.example .env
```

The agent generates the secrets and writes them into `docker/.env` before the first start, so the defaults from the template are never used. The Redis password also appears inside the Celery broker URL, and the install password may be at most 30 characters:

```bash
DB_PASS="$(openssl rand -hex 16)"
REDIS_PASS="$(openssl rand -hex 16)"
sed -i \
  -e "s|^EXPOSE_NGINX_PORT=.*|EXPOSE_NGINX_PORT=8080|" \
  -e "s|^NEXT_PUBLIC_SOCKET_URL=.*|NEXT_PUBLIC_SOCKET_URL=ws://staging.brightpath.internal:8080|" \
  -e "s|^INIT_PASSWORD=.*|INIT_PASSWORD=$(openssl rand -hex 15)|" \
  -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASS|" \
  -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASS|" \
  -e "s|^CELERY_BROKER_URL=.*|CELERY_BROKER_URL=redis://:$REDIS_PASS@redis:6379/1|" .env
printf 'OPENAPI_ENABLED=true\nENABLE_OAUTH_BEARER=true\n' >> .env

docker compose up -d
docker compose ps
```

All services report `Up` or `healthy`, and `init_permissions` shows `Exited`, which is expected. Marta opens `http://staging.brightpath.internal:8080/install`, enters the install password from `docker/.env`, creates the admin account and adds the model provider key.

### 2. Sign in with difyctl and import the workflow

```text
Install difyctl for this Dify version and import apps/support-triage.yaml from the helpdesk repository.
```

```bash
DIFY_VERSION=1.17.1
BASE="https://github.com/langgenius/dify/releases/download/$DIFY_VERSION"
curl -fsSLO "$BASE/difyctl-v$DIFY_VERSION-linux-x64"
curl -fsSLO "$BASE/difyctl-v$DIFY_VERSION-checksums.txt"
sha256sum --check --ignore-missing "difyctl-v$DIFY_VERSION-checksums.txt"
install -m 0755 "difyctl-v$DIFY_VERSION-linux-x64" "$HOME/.local/bin/difyctl"

difyctl auth login --host http://staging.brightpath.internal:8080 --insecure --no-browser
```

The command prints a one-time code and a URL. Marta approves the sign-in in her browser, and the agent continues:

```bash
difyctl import studio-app --from-file apps/support-triage.yaml --name "Support Triage"
difyctl get app --mode workflow
```

The import writes the workflow to the app's draft. Marta opens the app once, selects the model, publishes it and creates an app API key, which she stores as `DIFY_API_KEY` in the server's secret store.

### 3. Load the policy documents into a knowledge base

```text
Create a knowledge base called "Brightpath Policies" and index the three PDFs in docs/policies. Wait until indexing has finished.
```

Marta creates a knowledge base key under Knowledge → Service API and exports it as `DIFY_DATASET_KEY`.

```bash
export DIFY_API_URL="http://staging.brightpath.internal:8080/v1"

DATASET_ID=$(curl -s -X POST "$DIFY_API_URL/datasets" \
  -H "Authorization: Bearer $DIFY_DATASET_KEY" -H "Content-Type: application/json" \
  -d '{"name": "Brightpath Policies", "indexing_technique": "high_quality", "permission": "all_team_members"}' | jq -r .id)

for f in docs/policies/returns-policy.pdf docs/policies/claims-handbook.pdf docs/policies/carrier-sla.pdf; do
  BATCH=$(curl -s -X POST "$DIFY_API_URL/datasets/$DATASET_ID/document/create-by-file" \
    -H "Authorization: Bearer $DIFY_DATASET_KEY" \
    -F 'data={"indexing_technique":"high_quality","process_rule":{"mode":"automatic"}}' \
    -F "file=@$f" | jq -r .batch)
  until curl -s "$DIFY_API_URL/datasets/$DATASET_ID/documents/$BATCH/indexing-status" \
      -H "Authorization: Bearer $DIFY_DATASET_KEY" | jq -e '.data[0].indexing_status == "completed"' > /dev/null; do
    sleep 5
  done
  echo "indexed $f"
done
```

A retrieval test confirms the content is searchable before anyone relies on it:

```bash
curl -s -X POST "$DIFY_API_URL/datasets/$DATASET_ID/retrieve" \
  -H "Authorization: Bearer $DIFY_DATASET_KEY" -H "Content-Type: application/json" \
  -d '{"query": "deadline for filing a damage claim", "retrieval_model": {"search_method": "semantic_search", "reranking_enable": false, "top_k": 3, "score_threshold_enabled": false}}' \
  | jq '.records[] | {score, document: .segment.document.name}'
```

### 4. Call the workflow from the helpdesk backend

```text
Show me the request the helpdesk service should send, and test it with a real ticket.
```

```bash
curl -s "$DIFY_API_URL/parameters" -H "Authorization: Bearer $DIFY_API_KEY" | jq -c '.user_input_form'

curl -s -X POST "$DIFY_API_URL/workflows/run" \
  -H "Authorization: Bearer $DIFY_API_KEY" -H "Content-Type: application/json" \
  -d '{"inputs": {"ticket_text": "Pallet 3 of shipment BP-44817 arrived crushed. How do we file a claim?"},
       "user": "helpdesk-service", "response_mode": "blocking"}' | jq '.data | {status, outputs, elapsed_time}'
```

```json
{
  "status": "succeeded",
  "outputs": {"category": "damage-claim", "priority": "high", "reply": "Please file the claim within 7 days of delivery..."},
  "elapsed_time": 3.12
}
```

### 5. Put the definition in git and rehearse an upgrade

```text
Export the current workflow back to the repository, then back up the instance so we can upgrade safely next month.
```

```bash
difyctl export studio-app 7f3e9a2b-1c4d-4e8f-9a0b-2d5c8e1f4a7b --output apps/support-triage.yaml

cd dify/docker
docker compose exec -T db_postgres pg_dump -U postgres dify > "dify-db-$(date +%Y%m%d).sql"
docker compose down
docker run --rm -v "$PWD/volumes:/data:ro" -v "$PWD:/backup" alpine \
  tar czf "/backup/dify-volumes-$(date +%Y%m%d).tar.gz" -C /data .
docker compose up -d
```

## Real-World Example

Marta finishes the staging deployment in one afternoon. The three policy PDFs, 148 pages in total, are indexed in about four minutes, and the retrieval test returns the claims handbook as the top result for the damage-claim question. The helpdesk service goes live the following Monday and sends 912 tickets through the workflow on the first day, with a median response time of 3.4 seconds.

Two weeks later the support lead changes the prompt in the console. Marta asks the agent to export the app again, and the pull request shows a twelve-line diff in `apps/support-triage.yaml` that the team reviews like any other change. When the next Dify release appears, she restores the backup archive on a spare machine, reads the release's upgrade guide, runs the upgrade there first, and repeats it on the real server the next morning.

## Related Skills

- [dify](/skills/dify) — deploys the Compose stack, imports and exports the workflow DSL with difyctl, loads the knowledge base and calls the workflow API
- [docker-helper](/skills/docker-helper) — checks the Compose services, resolves the port conflict on the shared server and runs the volume backup container
