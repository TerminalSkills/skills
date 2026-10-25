---
name: azure-cli
description: >-
  The Azure CLI (`az`) manages Microsoft Azure resources from the terminal.
  Use when the user needs to sign in to Azure, create resource groups, VMs,
  storage accounts, Function apps, AKS clusters or virtual networks, query
  resources with JMESPath, or script Azure operations in CI.
license: Apache-2.0
compatibility: "linux, macos, windows; Azure CLI 2.91 (Python 3.10+ when installed with pip)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: "azure, cli, cloud, microsoft, devops"
  repository: https://github.com/Azure/azure-cli
---

# Azure CLI

## Overview

The Azure CLI (`az`) is Microsoft's command-line tool for Azure Resource Manager. Commands follow `az <group> <subcommand> [--options]`, output JSON by default (`-o table|tsv|yaml`), and filter with `--query` (JMESPath). Extensions (such as `ssh`) install on first use. This skill was checked against Azure CLI 2.91.0 (October 2026): every command below exists in that release, but nothing was run against a live subscription.

## Instructions

- Install with a package manager, never by piping a script into a shell: `brew install azure-cli`, `winget install -e --id Microsoft.AzureCLI`, the Microsoft apt/dnf repositories (the install page lists the steps per distribution), or `pip install azure-cli` inside a virtual environment. Check with `az version`.
- Sign in with `az login` (browser) or `az login --use-device-code` on a headless machine. For CI use a service principal with a federated (OIDC) credential or a managed identity (`az login --identity`) instead of a stored secret. Then pick the subscription: `az account set --subscription "Contoso Production"` and confirm with `az account show`.
- Set defaults once to shorten commands: `az configure --defaults location=westeurope group=rg-shop-prod`.
- Before any create or delete, run the matching `--help`, and add `--query` plus `-o table` or `-o tsv` when the result feeds a script. `az vm list` reports `powerState` only with `--show-details` (`-d`).
- Prefer Microsoft Entra authentication over account keys: `--auth-mode login` for storage commands (the signed-in identity needs a data role such as Storage Blob Data Contributor) and managed identities for apps.
- Create resources inside a resource group so a whole environment can be removed at once. Tag production resources.
- Use `--no-wait` for long operations and poll with `az <group> show`, `az group wait`, or `az deployment group wait`.
- For repeatable infrastructure use Bicep with `az deployment group create --resource-group rg-shop-prod --template-file main.bicep`; `az group export` is only a starting point for reverse-engineering.

## Examples

### Example 1: A web VM with an open HTTPS port

**User request:** "Create a small Ubuntu VM for the shop's web tier in West Europe and open port 443."

```bash
az group create --name rg-shop-prod --location westeurope --tags Environment=production
az vm create \
  --resource-group rg-shop-prod \
  --name vm-shop-web \
  --image Ubuntu2404 \
  --size Standard_B2s \
  --admin-username azureuser \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --vnet-name vnet-shop --subnet default \
  --nsg nsg-shop-web \
  --tags Environment=production Role=web
az vm open-port -g rg-shop-prod -n vm-shop-web --port 443 --priority 100
az vm list -g rg-shop-prod -d \
  --query "[].{Name:name,Size:hardwareProfile.vmSize,State:powerState,IP:publicIps}" -o table
```

**Result:** the VM and its network resources appear in the table with `VM running` and a public IP. `Ubuntu2204` and `Ubuntu2404` are valid image aliases (`az vm image list` shows the offline alias list). Connect with `az ssh vm -g rg-shop-prod -n vm-shop-web` (installs the `ssh` extension) or plain `ssh azureuser@<ip>`. Note that `az vm stop` leaves the VM allocated and billed; use `az vm deallocate` to stop charges for compute.

### Example 2: Private blob storage with a temporary download link

**User request:** "Upload report.json to Azure storage and give the auditor a link that works for 7 days."

```bash
az storage account create --name stshopreports01 --resource-group rg-shop-prod \
  --location westeurope --sku Standard_LRS --min-tls-version TLS1_2 \
  --allow-blob-public-access false
az storage container create --name reports --account-name stshopreports01 --auth-mode login
az storage blob upload --account-name stshopreports01 --container-name reports \
  --name report.json --file ./report.json --auth-mode login
az storage blob generate-sas --account-name stshopreports01 --container-name reports \
  --name report.json --permissions r --https-only --as-user --auth-mode login \
  --full-uri --expiry "$(date -u -d '+7 days' '+%Y-%m-%dT%H:%MZ')"
```

**Result:** the last command prints a full HTTPS URL with a user-delegation SAS valid for seven days. Storage account names are 3 to 24 lowercase letters and digits, globally unique. A user-delegation SAS cannot outlive the delegation key (at most 7 days).

### Example 3: A Python Function app and an AKS cluster

**User request:** "Set up a serverless Python function and a small Kubernetes cluster."

```bash
az functionapp list-flexconsumption-locations --query "sort_by(@, &name)[].name" -o tsv | head -3
az storage account create --name stshopfunc01 --resource-group rg-shop-prod \
  --location westeurope --sku Standard_LRS --allow-blob-public-access false
az functionapp create --resource-group rg-shop-prod --name func-shop-orders \
  --storage-account stshopfunc01 --flexconsumption-location westeurope \
  --runtime python --runtime-version 3.13
az functionapp config appsettings set -g rg-shop-prod -n func-shop-orders \
  --settings "ORDERS_DB_HOST=orders.postgres.database.azure.com" "APP_ENV=production"
func azure functionapp publish func-shop-orders      # Azure Functions Core Tools, installed separately
func azure functionapp logstream func-shop-orders

az aks create -g rg-shop-prod -n aks-shop --node-count 3 \
  --enable-managed-identity --generate-ssh-keys
az aks get-credentials -g rg-shop-prod -n aks-shop
az aks update -g rg-shop-prod -n aks-shop \
  --enable-cluster-autoscaler --min-count 1 --max-count 10
```

**Result:** the function app is created on the Flex Consumption plan, `func publish` uploads the code, and `kubectl get nodes` shows the cluster nodes. The Consumption plan (`--consumption-plan-location`) is a legacy plan (Linux Consumption retires on 30 September 2028 per Microsoft Learn); use `--flexconsumption-location` for new apps. There is no `az functionapp log tail`; stream logs with the Core Tools command shown above.

### Example 4: Networking and queries

This uses new names (`vnet-shop-data`, `nsg-shop-data`) because Example 1 already created `vnet-shop` and `nsg-shop-web`, and `az vm open-port --priority 100` took priority 100 on that group.

```bash
az network vnet create -g rg-shop-prod -n vnet-shop-data --address-prefix 10.1.0.0/16 \
  --subnet-name default --subnet-prefix 10.1.1.0/24
az network nsg create -g rg-shop-prod -n nsg-shop-data
az network nsg rule create -g rg-shop-prod --nsg-name nsg-shop-data -n allow-https \
  --priority 100 --destination-port-ranges 443 --access Allow --protocol Tcp
az vm list -g rg-shop-prod -d --query "[?powerState=='VM running'].name" -o tsv
az monitor metrics list --resource "$(az vm show -g rg-shop-prod -n vm-shop-web --query id -o tsv)" \
  --metric "Percentage CPU" --interval PT1H
az group export -g rg-shop-prod > template.json
```

## Guidelines

- `az group delete --name rg-shop-prod --yes --no-wait` removes every resource in the group without recovery: confirm the group name and subscription (`az account show`) first, and never add `--yes` to a command you have not read.
- Keep secrets out of commands and history: read them from environment variables or Key Vault (`az keyvault secret show`), and avoid `--admin-password` in shared scripts.
- The `consumption`/cost commands are in preview; use Cost Management in the portal for billing questions.
- Regional capacity and VM sizes vary: if a size is rejected, list sizes with `az vm list-sizes --location westeurope`.
- Use `az rest` only for APIs that have no dedicated command, and `az upgrade` to update the CLI itself when it was installed in a way that supports it.
