---
name: external-dns
description: >-
  ExternalDNS automatically creates and updates DNS records for Kubernetes
  Services, Ingresses, Gateway API routes and Istio resources in providers such
  as Route 53, Cloud DNS and Cloudflare. Use when someone asks to "point a
  hostname at my Kubernetes service automatically", "install external-dns with
  Helm", "sync Ingress hosts to Route 53 or Cloudflare", or "fix external-dns
  deleting or not creating records".
license: Apache-2.0
compatibility: 'Kubernetes 1.25+, Helm 3, external-dns chart 1.23 (app v0.23)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/kubernetes-sigs/external-dns
  tags: "external-dns, dns, kubernetes, route53, cloudflare"
---

# ExternalDNS

## Overview

ExternalDNS runs as a controller in the cluster, reads hostnames from Services (type LoadBalancer), Ingresses, Gateway API routes, Istio Gateways and other sources, and creates matching records in your DNS provider. Ownership is tracked with TXT records (`--registry=txt` plus a unique `--txt-owner-id`), so it only touches records it created. Checked against Helm chart 1.23.0 (app v0.23.0; v0.24.0 was released on 2026-10-23).

Three changes from older guides matter:

- **Annotation prefix.** Since v0.22.0 the annotations use `external-dns.kubernetes.io/...` (hostname, ttl, target, `cloudflare-proxied`). The old `external-dns.alpha.kubernetes.io/...` keys are ignored by default (v0.22.0 had no fallback), and with `policy: sync` the controller can then delete records it no longer sees a source for. Migrate annotations first and run with `--dry-run`. While migrating, v0.23+ can read both prefixes with `--enable-legacy-annotation-prefix`; setting `--annotation-prefix=external-dns.alpha.kubernetes.io/` also works.
- **`--policy` is required** (`sync`, `upsert-only` or `create-only`). The Helm chart rejects values without `policy`.
- **Helm values.** The chart has first-class keys: `sources`, `domainFilters`, `policy`, `registry`, `txtOwnerId`. Do not repeat `--source` or `--domain-filter` in `extraArgs`, or the arguments are duplicated. The in-tree provider list is closed; new providers (Hetzner, DigitalOcean, Namecheap and others) are webhook providers installed as sidecars. Akamai, Plural and Transip in-tree support was removed in v0.22.

## Instructions

### Install with Helm

```bash
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/
helm repo update
helm install external-dns external-dns/external-dns \
  --namespace external-dns --create-namespace \
  --version 1.23.0 \
  --values values.yaml
```

Preview what a values file produces before installing: `helm template external-dns external-dns/external-dns --version 1.23.0 -f values.yaml | grep -- '- --'` lists the controller arguments.

### AWS Route 53

```yaml
# values-aws.yaml
provider:
  name: aws
env:
  - name: AWS_DEFAULT_REGION
    value: us-east-1
sources:
  - service
  - ingress
domainFilters:
  - shop.northwind-example.org
policy: upsert-only        # creates and updates, never deletes
registry: txt
txtOwnerId: prod-eks-1     # unique per cluster
extraArgs:
  - --aws-zone-type=public
serviceAccount:
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/external-dns
```

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["route53:ChangeResourceRecordSets", "route53:ListResourceRecordSets", "route53:ListTagsForResources"],
      "Resource": ["arn:aws:route53:::hostedzone/Z0123456789ABCDEFGHIJ"]
    },
    {
      "Effect": "Allow",
      "Action": ["route53:ListHostedZones"],
      "Resource": ["*"]
    }
  ]
}
```

Attach the policy to an IAM role trusted by the cluster's service account (IRSA or EKS Pod Identity).

### Google Cloud DNS

```yaml
# values-gcp.yaml
provider:
  name: google
sources: [service, ingress]
domainFilters: [shop.northwind-example.org]
policy: sync
registry: txt
txtOwnerId: prod-gke-1
extraArgs:
  - --google-project=northwind-prod
  - --google-zone-visibility=public
```

The pod needs DNS admin rights on the zone, normally through Workload Identity.

### Cloudflare

Create an API token with Zone `Read` and DNS `Edit` permissions, restricted to the zones you use (then also pass `--zone-id-filter`). Create the secret from the environment so the token never lands in a file:

```bash
kubectl create namespace external-dns
printf '%s' "$CLOUDFLARE_API_TOKEN" | kubectl -n external-dns create secret generic cloudflare-api-token --from-file=api-token=/dev/stdin
```

```yaml
# values-cloudflare.yaml
provider:
  name: cloudflare
env:
  - name: CF_API_TOKEN
    valueFrom:
      secretKeyRef:
        name: cloudflare-api-token
        key: api-token
sources: [service, ingress]
domainFilters: [shop.northwind-example.org]
policy: sync
txtOwnerId: prod-k3s-1
extraArgs:
  - --cloudflare-proxied      # orange-cloud every record; override per resource with the annotation
  # proxied records: leave the ttl annotation unset or set it to 1 (automatic)
```

Do not set `CF_API_KEY` or `CF_API_EMAIL` together with `CF_API_TOKEN`.

### Service and Ingress annotations

```yaml
# service-lb.yaml
apiVersion: v1
kind: Service
metadata:
  name: web-app
  annotations:
    external-dns.kubernetes.io/hostname: app.shop.northwind-example.org
    external-dns.kubernetes.io/ttl: "300"
spec:
  type: LoadBalancer
  selector:
    app: web-app
  ports:
    - port: 80
      targetPort: 8080
```

Several hostnames: `external-dns.kubernetes.io/hostname: "api.shop.northwind-example.org,api-v2.shop.northwind-example.org"`. Per-record Cloudflare proxying: `external-dns.kubernetes.io/cloudflare-proxied: "true"`. A fixed target instead of the load balancer address: `external-dns.kubernetes.io/target`.

An Ingress needs no hostname annotation: hosts in `spec.rules[].host` are used, and the target comes from the Ingress load balancer status.

```yaml
# ingress-dns.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-app
  annotations:
    external-dns.kubernetes.io/ttl: "120"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.shop.northwind-example.org
      secretName: app-tls
  rules:
    - host: app.shop.northwind-example.org
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-app
                port:
                  number: 80
```

### Other sources

Set `sources` to what you run: `istio-gateway`, `istio-virtualservice`, `gateway-httproute` (Gateway API; annotation placement differs by route type, see the annotations doc), `crd`, `node`, `pod`. The chart creates the matching RBAC rules for the sources you list.

```yaml
# values-istio.yaml
provider:
  name: aws
sources: [istio-gateway, istio-virtualservice]
domainFilters: [shop.northwind-example.org]
policy: sync
txtOwnerId: prod-eks-1
```

### Operate and debug

```bash
kubectl -n external-dns logs deploy/external-dns -f      # "All records are already up to date" when in sync
dig +short app.shop.northwind-example.org
dig +short TXT app.shop.northwind-example.org            # ownership TXT records (heritage=external-dns,...)
```

Add `--dry-run` to `extraArgs` to log planned changes without applying them.

## Examples

### Example 1: Publish a shop on Route 53 without deleting anything
**User:** "Install external-dns on our EKS cluster so app.shop.northwind-example.org points at the ingress, and make sure it never deletes records."

Create the IAM role and `values-aws.yaml` above (`policy: upsert-only`), then `helm install ... --version 1.23.0 -f values-aws.yaml`. Logs show `Desired change: CREATE app.shop.northwind-example.org A` followed by a matching TXT record; `dig +short app.shop.northwind-example.org` returns the load balancer addresses after the TTL.

### Example 2: Records stopped appearing after an upgrade
**User:** "After upgrading external-dns, none of my annotated services get DNS records and some old ones vanished."

The annotations still use `external-dns.alpha.kubernetes.io/`. Switch them to `external-dns.kubernetes.io/` (`hostname`, `ttl`, `target`, `cloudflare-proxied`), or temporarily add `--enable-legacy-annotation-prefix` to `extraArgs` (reads both prefixes; v0.23+). Set `policy: upsert-only` and `--dry-run` while checking logs, then restore the real policy.

## Guidelines

- Use `upsert-only` or `create-only` until the first run looks right; `sync` deletes records owned by the same `txtOwnerId` when the source disappears.
- Give every cluster its own `txtOwnerId`, and restrict zones with `domainFilters` so two clusters never fight over a name.
- Pin the chart version; read the release notes ("Action required before upgrade") before bumping, and test with `--dry-run`.
- Scope credentials to one zone (IAM resource ARN, Cloudflare zone, GCP zone) and give the pod no other permissions.
- Records that have no ownership TXT record from your `txtOwnerId` are left alone; delete a hand-made record if you want ExternalDNS to take it over.
- Hostnames must fall under a zone matched by `domainFilters`, or the controller silently skips them.
- Proxied Cloudflare records carry only HTTP(S) traffic; leave `--cloudflare-proxied` off for other protocols.
