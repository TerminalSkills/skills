---
name: golang
description: >-
  Go is Google's open-source programming language whose toolchain compiles
  programs into single static binaries and ships with built-in modules,
  testing, fuzzing, race detection and cross-compilation. Use when a user
  asks to set up a Go project, add or upgrade Go dependencies, run go test,
  go vet or benchmarks, fix a data race, write generic Go code, work across
  several modules with go.work, or build release binaries for Linux, macOS
  and Windows. Phrases: "init a go module", "go mod tidy", "cross-compile my
  Go CLI", "why is my go test cached", "build a static Go binary for Docker".
license: Apache-2.0
compatibility: "Go 1.27+ (go.dev/dl); Linux, macOS or Windows; Docker optional for container builds"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["go", "golang", "go-modules", "cross-compilation", "testing"]
  repository: https://github.com/golang/go
---
# Go — Toolchain for Modules, Tests and Static Binaries

## Overview

Go is a compiled, garbage-collected language with a single `go` command that handles everything a project needs: dependency management (modules), building, testing, benchmarking, fuzzing, static analysis (`go vet`), code rewrites (`go fix`) and cross-compilation. A build produces one self-contained executable, so a Go program ships as one file with no runtime to install on the target.

This skill covers the language toolchain itself. For HTTP frameworks use the `gin`, `go-echo` or `go-fiber` skills; for CLI command trees use `cobra`. The current stable release is Go 1.27 (August 2026); Go supports the two most recent major releases (1.27 and 1.26).

## Instructions

### Install Go

Package managers first:

```bash
brew install go            # macOS
winget install GoLang.Go   # Windows (PowerShell)
```

On Linux, download the archive from go.dev, check it against the SHA-256 listed on https://go.dev/dl/, then extract it to `/usr/local`. If an older Go already lives in `/usr/local/go`, remove that directory first: the docs warn that extracting over an old tree produces a broken install.

```bash
curl -LO https://go.dev/dl/go1.27.1.linux-amd64.tar.gz
sha256sum go1.27.1.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.27.1.linux-amd64.tar.gz
```

Add the toolchain and installed tools to `PATH` (in `~/.profile`, `~/.bashrc` or `~/.zshrc`), open a new shell and verify:

```bash
export PATH=$PATH:/usr/local/go/bin
export PATH="$PATH:$(go env GOPATH)/bin"
go version
```

### Start a module

A module is a directory tree with a `go.mod` at its root. The module path is normally the repository URL.

```bash
mkdir -p ratelimit/cmd/rlcheck && cd ratelimit
go mod init github.com/northwind-labs/ratelimit
```

`go.mod` records the module path and the minimum Go version (`go 1.27.1`). Library code sits at the root; each executable gets its own `package main` directory under `cmd/` (here `cmd/rlcheck/`).

### Build, run and format

```bash
go run ./cmd/rlcheck -burst 5      # compile and run in one step
go build -o bin/rlcheck ./cmd/rlcheck
gofmt -l . && gofmt -w .           # list, then fix, unformatted files
go vet ./...                       # ./... = every package below here; flags printf misuse, copied locks
```

### Manage dependencies

```bash
go get golang.org/x/sync@latest      # add or upgrade one module
go get golang.org/x/sync@v0.23.0     # pin an exact version
go mod tidy                          # add missing, drop unused requirements
go list -m -u all                    # show modules with newer versions in [brackets]
go mod why golang.org/x/sync/errgroup  # which import pulls this in
```

`go.sum` holds checksums for every downloaded module; commit it together with `go.mod`. For private repositories, set `GOPRIVATE=github.com/northwind-labs/*` so the go command fetches them directly instead of through the public proxy and checksum database.

### Tool dependencies (Go 1.24+)

Pin developer tools in `go.mod` instead of installing them globally, so every contributor and CI job runs the same version:

```bash
go get -tool golang.org/x/vuln/cmd/govulncheck@latest
go tool govulncheck ./...
```

This adds a `tool golang.org/x/vuln/cmd/govulncheck` line to `go.mod`. To install a program on your machine instead, use `go install golang.org/x/tools/gopls@latest`; binaries land in `$(go env GOPATH)/bin` (or `$GOBIN`).

### Test, benchmark, fuzz

Tests live in `*_test.go` files next to the code. A table-driven test with subtests:

```go
func TestAllow(t *testing.T) {
	tests := []struct {
		name  string
		burst int
		calls int
		want  int
	}{
		{"within burst", 5, 3, 3},
		{"exceeds burst", 5, 8, 5},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := New(tt.burst, 1)
			got := 0
			for range tt.calls {
				if l.Allow() {
					got++
				}
			}
			if got != tt.want {
				t.Errorf("allowed %d, want %d", got, tt.want)
			}
		})
	}
}

func BenchmarkAllow(b *testing.B) {
	l := New(1_000_000, 1_000_000)
	for b.Loop() {
		l.Allow()
	}
}
```

```bash
go test ./...                              # all packages; results are cached
go test -count=1 ./...                     # bypass the test cache
go test -run 'TestAllow/exceeds' -v .      # one subtest (spaces become _)
go test -race ./...                        # data race detector
go test -coverprofile=cover.out ./... && go tool cover -func=cover.out
go test -bench=Allow -benchmem -run='^$' . # benchmarks only
go test -fuzz=FuzzMax -fuzztime=30s .      # fuzz one target
```

A fuzz target starts with `Fuzz`, seeds inputs with `f.Add` and checks a property in `f.Fuzz`. Failing inputs are saved under `testdata/fuzz/` and replayed by every later `go test`.

### Generics

Type parameters work on functions and types; `cmp.Ordered` and `comparable` cover most constraints.

```go
// imports: cmp, slices
func TopN[T cmp.Ordered](xs []T, n int) []T {
	s := slices.Clone(xs)
	slices.SortFunc(s, func(a, b T) int { return cmp.Compare(b, a) })
	return s[:min(n, len(s))]
}

type Set[K comparable] map[K]struct{}

func (s Set[K]) Add(k K)      { s[k] = struct{}{} }
func (s Set[K]) Has(k K) bool { _, ok := s[k]; return ok }
```

Go 1.27 also allows methods to declare their own type parameters (`func (b Box) Scale[T int | float64](f T) T`); such code needs `go 1.27` in `go.mod`.

### Multi-module workspaces

When a service and a library live in separate modules and you change both at once:

```bash
go work init ./gateway ./ratelimit
go work use ./billing        # add another module later
go run ./gateway
```

`go.work` makes the local copies win over the versions in each `go.mod`, so there is no `replace` directive to forget. Usually keep it out of the repository.

### Cross-compile release binaries

Set `GOOS`/`GOARCH` to build for another platform; `go tool dist list` shows every supported pair. `CGO_ENABLED=0` gives a fully static binary with no libc dependency.

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath \
  -ldflags "-s -w -X main.version=v1.4.0" -o dist/rlcheck-linux-arm64 ./cmd/rlcheck
```

- `-trimpath` strips local file paths from the binary.
- `-ldflags "-s -w"` drops symbol and debug tables (smaller file).
- `-X main.version=v1.4.0` sets a package-level `var version string` at link time.
- `go version -m dist/rlcheck-linux-arm64` prints the Go version, module versions and build settings embedded in any Go binary.

## Examples

### Example 1: Ship a CLI to four platforms

**User request:** "Build our `rlcheck` tool for Linux (x86 and ARM), Apple Silicon Macs and Windows, stamped with version v1.4.0."

```bash
for target in linux/amd64 linux/arm64 darwin/arm64 windows/amd64; do
  os=${target%/*}; arch=${target#*/}; ext=""
  [ "$os" = windows ] && ext=.exe
  CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -trimpath \
    -ldflags "-s -w -X main.version=v1.4.0" \
    -o "dist/rlcheck-$os-$arch$ext" ./cmd/rlcheck
done
file dist/*
./dist/rlcheck-linux-amd64 -version
```

**Result:** four files of about 1.6 MB each. `file` reports `ELF 64-bit ... statically linked, stripped` for the Linux builds, `Mach-O 64-bit arm64 executable` for macOS and `PE32+ executable (console) x86-64` for Windows. The Linux binary prints `rlcheck v1.4.0`. Nothing else has to be installed on the target machines.

### Example 2: Add a dependency, test for races and scan for vulnerabilities

**User request:** "Our health checker should probe hosts in parallel, at most 4 at a time. Add that, make sure there are no races, and check dependencies for known CVEs before we merge."

```go
package main

import (
	"context"

	"golang.org/x/sync/errgroup"
)

func checkAll(ctx context.Context, hosts []string, check func(context.Context, string) error) error {
	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(4)
	for _, h := range hosts {
		g.Go(func() error { return check(ctx, h) })
	}
	return g.Wait()
}
```

```bash
go get golang.org/x/sync@latest
go mod tidy
go vet ./...
go test -race -count=1 ./...
go get -tool golang.org/x/vuln/cmd/govulncheck@latest
go tool govulncheck ./...
```

**Result:** `go.mod` gains `require golang.org/x/sync v0.23.0` and a `tool` line for govulncheck. `go test -race` prints `ok` for each package, or a `WARNING: DATA RACE` report with both goroutines' stacks. govulncheck ends with `No vulnerabilities found.` or lists each vulnerable call it actually reaches, with the fixed version.

### Example 3: Small image for a Go API in Docker

**User request:** "Our Go gateway image is almost 1 GB because it ships the whole toolchain. Make it small."

```dockerfile
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/gateway ./cmd/gateway

FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/gateway /gateway
ENTRYPOINT ["/gateway"]
```

**Result:** `go mod download` sits in its own layer, so it is cached until `go.mod`/`go.sum` change. The final image contains only the static binary on a distroless base and runs as a non-root user, a small fraction of the size of the full `golang` image.

## Guidelines

- Run `gofmt`, `go vet ./...` and `go test -race ./...` in CI. The race detector only finds races on code paths the tests actually execute; it requires cgo (`CGO_ENABLED=1`) and a supported target such as linux/amd64, darwin/arm64 or windows/amd64.
- `go test` caches passing results for unchanged code (it does notice changed files in the module and changed environment variables). Use `-count=1` when a test depends on external state such as a database or network service.
- Commit `go.mod` and `go.sum` together, and run `go mod tidy` before committing. Do not edit `go.sum` by hand.
- `go install pkg@version` ignores the current module's `go.mod`; use it for machine-wide tools. Use `go get -tool` for tools the project depends on.
- `CGO_ENABLED=0` fails for packages that need C (some SQLite drivers, for example). Pick a pure-Go alternative or cross-compile with a C toolchain for the target.
- `-X` only sets string variables, and needs the full import path for non-main packages (`-X github.com/northwind-labs/ratelimit/internal/build.Version=v1.4.0`).
- Private module credentials belong in git's credential helper or `~/.netrc`, never in `go.mod` or the source tree.
- The `go` line in `go.mod` is the minimum Go version; raise it with `go get go@1.27.1`. With the default `GOTOOLCHAIN=auto` an older go command downloads the required toolchain; set `GOTOOLCHAIN=local` in CI to fail instead.
- `go fix ./...` rewrites code to newer idioms; review the diff first with `go fix -diff ./...`.
- When not to use Go: hard-real-time or GC-sensitive hot paths (look at Rust), quick data analysis (Python), or browser UI code.
