---
name: apple-container
description: >-
  Runs Linux containers on a Mac, each one inside its own lightweight virtual machine, using Apple's open-source `container` CLI for Apple Silicon. Use when the user wants containers on macOS 26 without Docker Desktop, asks "run a container natively on my Mac", "container run", "container build", "push an image from a Mac without Docker", or wants isolated Linux dev environments (container machine) on an M-series laptop. Needs Apple Silicon and macOS 26.
license: Apache-2.0
compatibility: "Apple Silicon Mac, macOS 26 (other versions unsupported), administrator password for the installer package"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "containers, macos, apple-silicon, oci, linux-vm"
  repository: https://github.com/apple/container
---

# container — Linux containers as lightweight VMs on a Mac

## Overview

`container` is Apple's Swift tool for creating and running Linux containers on a Mac. Each container gets its own small VM (built on Apple's Containerization package and Virtualization.framework), has its own IP address on a vmnet network, and uses standard OCI images, so it pulls from and pushes to ordinary registries. Builds run through BuildKit and read a `Dockerfile` or `Containerfile`. The project is Apache-2.0, and this guide covers release 1.7.1 (November 2026). Release numbers are product versions, not semver, and features marked experimental (such as `cluster`) can change.

It is a native alternative to a Docker daemon on macOS, not a drop-in clone: the CLI is similar to Docker's (`run`, `build`, `exec`, `logs`, `image pull/push`) but there is no `docker compose` equivalent, and flags differ in places. For Dockerfile authoring and Compose files use the `docker-helper` skill; the Dockerfiles it produces build here too.

It requires Apple Silicon and macOS 26; the maintainers do not address problems that cannot be reproduced on macOS 26. Everything in this skill comes from the repository's `README.md`, `docs/command-reference.md` and topic guides at release 1.7.1; none of it was run on this Linux machine.

## Instructions

### Installation

Download `container-1.7.1-installer-signed.pkg` from `https://github.com/apple/container/releases`, verify it against the SHA-256 digest GitHub shows for the asset, and install it by double-clicking the package. It writes under `/usr/local` and asks for the administrator password.

```bash
shasum -a 256 ~/Downloads/container-1.7.1-installer-signed.pkg
```

Then start the services (this starts `container-apiserver` and background helpers, and offers to install a default Linux kernel):

```bash
container system start --enable-kernel-install    # answers the kernel prompt non-interactively
container system status
container system version
```

Stop with `container system stop`. Upgrade with `/usr/local/bin/update-container.sh` after stopping the service; `/usr/local/bin/uninstall-container.sh -k` removes the tool but keeps user data, `-d` removes data too.

### Run containers

```bash
container run --rm alpine echo hello                     # pull, run, remove
container run -it ubuntu:latest /bin/bash                # interactive shell
container run -d --name web -p 127.0.0.1:8080:80 nginx:latest
container run --rm -e NODE_ENV=production --cpus 2 --memory 1G node:22 node --version
```

Useful `run` options: `-d` detach, `--rm` remove on exit, `--name`, `-p [host-ip:]host-port:container-port[/protocol]`, `-e KEY=value` / `--env-file`, `-v host-path:container-path` or `--mount type=bind,source=...,target=...,readonly`, `--tmpfs`, `-w` working directory, `-c/--cpus`, `-m/--memory`, `--read-only`, `--platform` / `--arch` (`--rosetta` enables Rosetta in the container), `--ssh` (forward the host SSH agent), `--init`, `--network <name>`.

Every container is reachable from the Mac at its own IP (`container inspect web`), so publishing a port is only needed to reach it at `localhost` or from other machines. Bind published ports to `127.0.0.1` unless the service should be visible on the network.

### Manage containers

```bash
container list --all               # stopped ones too; --format json for scripts
container logs -f web              # --boot shows the VM boot log; -n 50 for the tail
container exec -it web sh
container cp ./nginx.conf web:/etc/nginx/nginx.conf
container stats --no-stream web
container stop web                 # SIGTERM, 5 s grace by default (-t to change)
container delete web               # --force for running ones; rm is the alias
```

`container stop --all` and `container delete --all` act on everything; without `--all` or an ID they do nothing.

### Build and publish images

```bash
container build -t inventory-api:1.4.0 .
container build -f docker/Dockerfile.prod --build-arg NODE_VERSION=22 --target production -t inventory-api:prod .
container build --arch arm64 --arch amd64 -t ghcr.io/shopops/inventory-api:1.4.0 .
```

The first build starts a BuildKit builder container (2 CPUs, 2048 MB by default). Resize it with `container builder start --cpus 4 --memory 8G`, check it with `container builder status`, stop it with `container builder stop`. Other build flags: `--no-cache`, `--pull`, `--secret id=npmrc,src=.npmrc`, `--ssh default`, `-o type=tar,dest=...`.

```bash
container registry login --username shopops-ci --password-stdin ghcr.io < ~/.secrets/registry-token
container image push ghcr.io/shopops/inventory-api:1.4.0
container image pull alpine:3.22
container image list
container image tag inventory-api:1.4.0 ghcr.io/shopops/inventory-api:1.4.0
container image delete inventory-api:prod
```

`image save` and `image load` move images as tar archives. For a registry on plain HTTP add `--scheme http`.

### Volumes, networks and names

```bash
container volume create --opt size=10g pgdata
container run -d --name db -v pgdata:/var/lib/postgresql/data -e PGDATA=/var/lib/postgresql/data/pgdata -e POSTGRES_PASSWORD="$DB_PASSWORD" postgres:17
container network create backend            # macOS 26 only; then --network backend
```

For `db.test`-style names, set `[dns] domain = "test"` in `~/.config/container/config.toml`, restart with `container system stop` and `container system start`, then run `sudo container system dns create test` once so macOS resolves the domain.

### Container machines

`container machine create alpine:3.22 --name dev` boots a persistent Linux environment from an OCI image with your macOS home directory mounted read-write at the same path. `container machine run -n dev` opens a shell; `container machine list`, `stop` and `delete` manage it. The project warns that a machine trades away most of the isolation of a regular container (home directory mounted read-write, SSH agent forwarded, all capabilities, passwordless sudo): use it for your own trusted images only, never for untrusted code.

## Examples

### Example 1: Build and smoke-test a service image before pushing

Request: "Build this Node API as an image on my M3 MacBook, run it, and check the health endpoint. No Docker Desktop."

```bash
container system start --enable-kernel-install
container build -t inventory-api:1.4.0 .
container run -d --rm --name inventory-api -p 127.0.0.1:3000:3000 -e NODE_ENV=production inventory-api:1.4.0
curl -fsS http://127.0.0.1:3000/healthz
container logs -n 20 inventory-api
container stop inventory-api
```

Result: the image appears in `container image list`, `curl` returns the health payload, and `--rm` removes the container when it stops.

### Example 2: Throwaway Postgres for a test run

Request: "Give me a Postgres 17 I can wipe afterwards."

```bash
container volume create --opt size=5g pgtest
container run -d --name pgtest -p 127.0.0.1:5433:5432 -v pgtest:/var/lib/postgresql/data -e PGDATA=/var/lib/postgresql/data/pgdata -e POSTGRES_PASSWORD="$PGTEST_PASSWORD" postgres:17
container exec pgtest pg_isready -U postgres
# ... run the tests against 127.0.0.1:5433 ...
container delete --force pgtest
container volume delete pgtest
```

`PGDATA` points at a subdirectory because a freshly formatted volume may contain a `lost+found` directory, which the Postgres image refuses to initialise over.

Result: `pg_isready` reports that the server accepts connections; the last two commands remove the container and its data.

## Guidelines

- macOS 26 on Apple Silicon only. Do not suggest it for Intel Macs, older macOS, Linux or Windows hosts.
- `container system start` must have run before any other command works.
- Containers are VMs, so each one costs real memory; `-m` and `-c` set limits per container, and `container system df` shows disk use.
- Do not promise Docker Compose, a Docker socket or Docker-API tools (Testcontainers, IDE Docker plugins): they expect a Docker daemon. Use `docker-helper` where a Docker daemon is required.
- Pass secrets with `--env-file`, `--secret` or `--password-stdin`, never on the command line, and bind published ports to `127.0.0.1`.
- Pin image tags and the `container` release in your notes: release numbers are product versions, not semver, and experimental features such as `cluster` can change between releases.
- Delete-style commands (`delete --all`, `prune`, `container image prune`) remove data; list first.
- Download the installer only from the project's GitHub releases and check its digest; do not pipe scripts into a shell.
