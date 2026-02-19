---
name: azure-cli
description: >-
  Azure Command Line Interface for managing Microsoft Azure resources. Use when
  the user needs to create VMs, manage storage accounts, deploy functions,
  configure resource groups, and automate Azure operations from the terminal.
license: Apache-2.0
compatibility:
  - linux
  - macos
  - windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: cloud
  tags:
    - azure
    - cli
    - cloud
    - microsoft
    - devops
---

# Azure CLI

The Azure CLI (`az`) manages Azure resources and services from the terminal.

## Setup

```bash
# Install Azure CLI
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash

# Login and set subscription
az login
az account set --subscription "My Subscription"
az account show

# Configure defaults
az configure --defaults location=eastus group=my-resource-group
```

## Resource Groups

```bash
# Resource group management
az group create --name my-rg --location eastus --tags Environment=production
az group list --output table
az group delete --name my-rg --yes --no-wait
```

## Virtual Machines

```bash
# Create a VM
az vm create \
  --resource-group my-rg \
  --name web-vm \
  --image Ubuntu2204 \
  --size Standard_B2s \
  --admin-username azureuser \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --vnet-name my-vnet --subnet default \
  --nsg my-nsg \
  --tags Environment=production Role=web

# List VMs
az vm list -g my-rg \
  --query "[].{Name:name,Size:hardwareProfile.vmSize,State:powerState}" -o table

# Manage VM state
az vm stop -g my-rg -n web-vm
az vm start -g my-rg -n web-vm
az vm deallocate -g my-rg -n web-vm
az vm delete -g my-rg -n web-vm --yes

# Open port
az vm open-port -g my-rg -n web-vm --port 443 --priority 100

# SSH into VM
az ssh vm -g my-rg -n web-vm
```

## Storage

```bash
# Create storage account and container
az storage account create \
  --name mystorageacct \
  --resource-group my-rg \
  --location eastus \
  --sku Standard_LRS \
  --encryption-services blob \
  --min-tls-version TLS1_2

az storage container create \
  --name mycontainer \
  --account-name mystorageacct \
  --auth-mode login

# Upload and download
az storage blob upload \
  --account-name mystorageacct \
  --container-name mycontainer \
  --file ./data.json --name data.json

az storage blob download \
  --account-name mystorageacct \
  --container-name mycontainer \
  --name data.json --file ./downloaded.json

# List blobs
az storage blob list \
  --account-name mystorageacct \
  --container-name mycontainer -o table

# Generate SAS token
az storage blob generate-sas \
  --account-name mystorageacct \
  --container-name mycontainer \
  --name data.json \
  --permissions r --expiry 2024-12-31
```

## Azure Functions

```bash
# Create Function App
az functionapp create \
  --resource-group my-rg \
  --name my-func-app \
  --consumption-plan-location eastus \
  --runtime python --runtime-version 3.11 \
  --functions-version 4 \
  --storage-account mystorageacct \
  --os-type Linux

# Deploy function code
func azure functionapp publish my-func-app

# App settings
az functionapp config appsettings set \
  --name my-func-app -g my-rg \
  --settings "DB_HOST=mydb.postgres.database.azure.com" "ENV=production"

# View logs
az functionapp log tail --name my-func-app -g my-rg
```

## AKS (Kubernetes)

```bash
# Create AKS cluster
az aks create \
  --resource-group my-rg \
  --name my-aks \
  --node-count 3 \
  --node-vm-size Standard_DS2_v2 \
  --enable-managed-identity \
  --generate-ssh-keys

# Get credentials
az aks get-credentials -g my-rg -n my-aks

# Scale node pool
az aks scale -g my-rg -n my-aks --node-count 5

# Enable autoscaler
az aks update -g my-rg -n my-aks \
  --enable-cluster-autoscaler --min-count 1 --max-count 10
```

## Networking

```bash
# Create VNet and subnet
az network vnet create \
  --resource-group my-rg \
  --name my-vnet \
  --address-prefix 10.0.0.0/16 \
  --subnet-name default --subnet-prefix 10.0.1.0/24

# Network Security Group
az network nsg create -g my-rg -n my-nsg
az network nsg rule create -g my-rg --nsg-name my-nsg \
  -n allow-https --priority 100 \
  --destination-port-ranges 443 --access Allow --protocol Tcp
```

## Useful Patterns

```bash
# Query with JMESPath
az vm list -g my-rg --query "[?powerState=='VM running'].name" -o tsv

# Export ARM template from existing resources
az group export -g my-rg > template.json

# Cost analysis
az consumption usage list --start-date 2024-01-01 --end-date 2024-01-31

# Monitor and alerts
az monitor metrics list --resource /subscriptions/.../my-vm \
  --metric "Percentage CPU" --interval PT1H
```
