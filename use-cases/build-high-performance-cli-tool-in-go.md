---
title: Build a High-Performance CLI Tool in Go
slug: build-high-performance-cli-tool-in-go
description: Build a production CLI tool in Go that processes large log files, extracts patterns, and outputs structured reports — with concurrent processing, cross-platform binaries, and automated releases.
skills:
  - golang
  - github-actions
category: Systems Programming
tags:
  - go
  - cli
  - performance
  - devtools
  - logs
---

# Build a High-Performance CLI Tool in Go

Priya is a platform engineer who spends 30 minutes every morning grepping through nginx and application logs across 12 servers to find error patterns. She pipes together `grep`, `awk`, `sort`, `uniq -c`, and `jq` in a shell script that breaks whenever the log format changes. She wants a single binary that parses structured and unstructured logs, detects error spikes, and outputs a clean summary — fast enough to process 50GB of logs in under a minute.

## Step 1 — Set Up the CLI Structure

Go's standard library and cobra give you argument parsing, subcommands, and help generation. The tool compiles to a single static binary with zero dependencies — just copy it to any server.

```go
// cmd/logpulse/main.go — Entry point.
// Initializes the CLI with cobra. The binary name is "logpulse".
// Build: go build -o logpulse ./cmd/logpulse

package main

import (
	"fmt"
	"os"

	"github.com/priya-tools/logpulse/internal/analyzer"
	"github.com/priya-tools/logpulse/internal/output"
	"github.com/spf13/cobra"
)

// Version is set at build time via ldflags
var version = "dev"

func main() {
	rootCmd := &cobra.Command{
		Use:     "logpulse",
		Short:   "Fast log analysis tool",
		Version: version,
	}

	analyzeCmd := &cobra.Command{
		Use:   "analyze [files...]",
		Short: "Analyze log files for error patterns and anomalies",
		Args:  cobra.MinimumNArgs(1),
		RunE:  runAnalyze,
	}

	analyzeCmd.Flags().StringP("format", "f", "auto", "Log format: auto, json, nginx, syslog")
	analyzeCmd.Flags().StringP("output", "o", "table", "Output format: table, json, csv")
	analyzeCmd.Flags().IntP("top", "n", 20, "Number of top patterns to show")
	analyzeCmd.Flags().StringP("since", "s", "1h", "Time window: 1h, 24h, 7d")
	analyzeCmd.Flags().IntP("workers", "w", 0, "Concurrent workers (0 = auto)")
	analyzeCmd.Flags().StringSlice("level", []string{"error", "fatal", "panic"}, "Log levels to include")

	rootCmd.AddCommand(analyzeCmd)

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func runAnalyze(cmd *cobra.Command, args []string) error {
	format, _ := cmd.Flags().GetString("format")
	outputFmt, _ := cmd.Flags().GetString("output")
	top, _ := cmd.Flags().GetInt("top")
	since, _ := cmd.Flags().GetString("since")
	workers, _ := cmd.Flags().GetInt("workers")
	levels, _ := cmd.Flags().GetStringSlice("level")

	cfg := analyzer.Config{
		Format:  format,
		Since:   since,
		Workers: workers,
		Levels:  levels,
		TopN:    top,
	}

	// Analyze all provided files/globs concurrently
	result, err := analyzer.Run(args, cfg)
	if err != nil {
		return fmt.Errorf("analysis failed: %w", err)
	}

	return output.Render(result, outputFmt, os.Stdout)
}
```

## Step 2 — Concurrent File Processing

The analyzer processes multiple files in parallel using goroutines and channels. Each worker parses a file, extracts log entries, and sends results through a channel. An aggregator merges results from all workers.

```go
// internal/analyzer/analyzer.go — Core analysis engine.
// Processes log files concurrently with configurable worker count.
// Uses errgroup for coordinated goroutine management with error handling.

package analyzer

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"golang.org/x/sync/errgroup"
)

// Config holds analysis parameters from CLI flags.
type Config struct {
	Format  string
	Since   string
	Workers int
	Levels  []string
	TopN    int
}

// Result holds the aggregated analysis output.
type Result struct {
	TotalLines    int64
	MatchedLines  int64
	FilesAnalyzed int
	Duration      time.Duration
	TopPatterns   []Pattern
	TimeBuckets   []TimeBucket
	LevelCounts   map[string]int64
}

// Pattern represents a recurring error pattern with count and examples.
type Pattern struct {
	Signature string   // Normalized error message (variables replaced with placeholders)
	Count     int64
	FirstSeen time.Time
	LastSeen  time.Time
	Examples  []string // Up to 3 raw log lines as examples
	Sources   []string // Files where this pattern appears
}

// TimeBucket holds error count for a time interval.
type TimeBucket struct {
	Start time.Time
	End   time.Time
	Count int64
}

// Run analyzes the provided file paths/globs concurrently.
func Run(paths []string, cfg Config) (*Result, error) {
	start := time.Now()

	// Expand globs into individual file paths
	files, err := expandGlobs(paths)
	if err != nil {
		return nil, fmt.Errorf("expanding paths: %w", err)
	}

	if len(files) == 0 {
		return nil, fmt.Errorf("no files matched the provided paths")
	}

	// Default workers = number of CPU cores
	workers := cfg.Workers
	if workers <= 0 {
		workers = runtime.NumCPU()
	}
	// Don't use more workers than files
	if workers > len(files) {
		workers = len(files)
	}

	// Parse the time window
	cutoff, err := parseSince(cfg.Since)
	if err != nil {
		return nil, fmt.Errorf("invalid --since value %q: %w", cfg.Since, err)
	}

	// Create a parser for the specified format
	parser, err := NewParser(cfg.Format)
	if err != nil {
		return nil, err
	}

	// Channel for per-file results
	resultsCh := make(chan *fileResult, len(files))

	// Process files concurrently with bounded parallelism
	g, ctx := errgroup.WithContext(context.Background())
	g.SetLimit(workers)

	for _, f := range files {
		file := f  // Capture loop variable for goroutine closure
		g.Go(func() error {
			fr, err := processFile(ctx, file, parser, cfg.Levels, cutoff)
			if err != nil {
				// Log and continue — don't abort on single file failure
				fmt.Fprintf(os.Stderr, "warning: skipping %s: %v\n", file, err)
				return nil
			}
			resultsCh <- fr
			return nil
		})
	}

	// Wait for all workers to finish, then close the channel
	go func() {
		g.Wait()
		close(resultsCh)
	}()

	// Aggregate results from all files
	aggregator := newAggregator(cfg.TopN)
	for fr := range resultsCh {
		aggregator.merge(fr)
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	result := aggregator.finalize()
	result.Duration = time.Since(start)
	result.FilesAnalyzed = len(files)

	return result, nil
}

// expandGlobs resolves file globs into absolute paths.
func expandGlobs(patterns []string) ([]string, error) {
	var files []string
	seen := make(map[string]bool)

	for _, pattern := range patterns {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			return nil, fmt.Errorf("invalid glob %q: %w", pattern, err)
		}

		for _, match := range matches {
			abs, _ := filepath.Abs(match)
			if !seen[abs] {
				seen[abs] = true
				files = append(files, abs)
			}
		}
	}

	return files, nil
}
```

## Step 3 — Pattern Detection

The pattern detector normalizes log messages by replacing variable parts (timestamps, IDs, IPs, numbers) with placeholders. This groups "Connection refused to 10.0.1.5:5432" and "Connection refused to 10.0.2.8:5432" under the same pattern.

```go
// internal/analyzer/patterns.go — Error pattern detection.
// Normalizes log messages to find recurring patterns.
// Uses regex replacement to turn variable data into stable signatures.

package analyzer

import (
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// Patterns to normalize in log messages.
// Order matters: more specific patterns first.
var normalizers = []*regexp.Regexp{
	regexp.MustCompile(`\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b`), // UUIDs
	regexp.MustCompile(`\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?\b`),                     // IP:port
	regexp.MustCompile(`\b0x[0-9a-fA-F]+\b`),                                                  // Hex addresses
	regexp.MustCompile(`\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?\b`),                // Timestamps
	regexp.MustCompile(`\b\d{10,13}\b`),                                                       // Unix timestamps
	regexp.MustCompile(`"/[^"]*"`),                                                             // URL paths
	regexp.MustCompile(`\b\d+(\.\d+)?\s*(ms|s|MB|KB|GB|bytes)\b`),                            // Metrics
	regexp.MustCompile(`\b\d{4,}\b`),                                                          // Long numbers (IDs)
}

var replacements = []string{
	"<UUID>", "<IP>", "<HEX>", "<TIMESTAMP>",
	"<UNIX_TS>", "<PATH>", "<METRIC>", "<ID>",
}

// normalize replaces variable parts of a log message with placeholders.
func normalize(msg string) string {
	for i, re := range normalizers {
		msg = re.ReplaceAllString(msg, replacements[i])
	}
	// Collapse whitespace
	return strings.Join(strings.Fields(msg), " ")
}

// aggregator collects patterns from multiple file results.
type aggregator struct {
	mu       sync.Mutex
	patterns map[string]*Pattern
	topN     int
	total    int64
	matched  int64
}

func newAggregator(topN int) *aggregator {
	return &aggregator{
		patterns: make(map[string]*Pattern),
		topN:     topN,
	}
}

func (a *aggregator) merge(fr *fileResult) {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.total += fr.totalLines
	a.matched += fr.matchedLines

	for sig, p := range fr.patterns {
		existing, ok := a.patterns[sig]
		if !ok {
			a.patterns[sig] = p
			continue
		}

		existing.Count += p.Count
		if p.FirstSeen.Before(existing.FirstSeen) {
			existing.FirstSeen = p.FirstSeen
		}
		if p.LastSeen.After(existing.LastSeen) {
			existing.LastSeen = p.LastSeen
		}
		// Keep up to 3 examples
		if len(existing.Examples) < 3 {
			existing.Examples = append(existing.Examples, p.Examples...)
			if len(existing.Examples) > 3 {
				existing.Examples = existing.Examples[:3]
			}
		}
		// Track all source files
		existing.Sources = append(existing.Sources, p.Sources...)
	}
}

func (a *aggregator) finalize() *Result {
	// Sort patterns by count descending, take top N
	patterns := make([]Pattern, 0, len(a.patterns))
	levelCounts := make(map[string]int64)

	for _, p := range a.patterns {
		patterns = append(patterns, *p)
	}

	sort.Slice(patterns, func(i, j int) bool {
		return patterns[i].Count > patterns[j].Count
	})

	if len(patterns) > a.topN {
		patterns = patterns[:a.topN]
	}

	return &Result{
		TotalLines:   a.total,
		MatchedLines: a.matched,
		TopPatterns:  patterns,
		LevelCounts:  levelCounts,
	}
}
```

## Step 4 — Cross-Platform Release with GoReleaser

```yaml
# .goreleaser.yml — Automated multi-platform release configuration.
# Builds for Linux, macOS, Windows (amd64 + arm64).
# Creates GitHub Release with changelogs and checksums.

version: 2

builds:
  - main: ./cmd/logpulse
    binary: logpulse
    env:
      - CGO_ENABLED=0                    # Static binary, no C dependencies
    ldflags:
      - -s -w                            # Strip debug info (30% smaller)
      - -X main.version={{.Version}}     # Inject version at build time
    goos:
      - linux
      - darwin
      - windows
    goarch:
      - amd64
      - arm64

archives:
  - format: tar.gz
    name_template: "logpulse_{{ .Os }}_{{ .Arch }}"
    format_overrides:
      - goos: windows
        format: zip

checksum:
  name_template: "checksums.txt"

changelog:
  sort: asc
  filters:
    exclude:
      - "^docs:"
      - "^test:"
      - "^ci:"

brews:
  - repository:
      owner: priya-tools
      name: homebrew-tap
    homepage: "https://github.com/priya-tools/logpulse"
    description: "Fast log analysis tool"
    install: |
      bin.install "logpulse"

nfpms:
  - package_name: logpulse
    homepage: "https://github.com/priya-tools/logpulse"
    description: "Fast log analysis tool"
    formats:
      - deb
      - rpm
```

```yaml
# .github/workflows/release.yml — Automated release on tag push.
# Creates binaries for 6 platform/arch combinations, publishes to GitHub Releases,
# and updates the Homebrew tap.

name: Release
on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-go@v5
        with:
          go-version: "1.22"

      - uses: goreleaser/goreleaser-action@v6
        with:
          version: "~> v2"
          args: release --clean
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Results

Priya shipped logpulse v1.0 and shared it with her team. After two weeks:

- **Processing speed: 50GB of logs in 47 seconds** — 8 goroutines saturate the NVMe read bandwidth. The previous shell pipeline took 12 minutes for the same data. That's a 15x speedup.
- **Binary size: 8.2MB** — single static binary, no dependencies. Priya copies it to any server with `scp logpulse user@host:/usr/local/bin/` — no Go runtime, no pip install, no node_modules.
- **Pattern detection found 3 unknown issues** in the first week — recurring database timeout pattern that was hidden in log noise, a rate limiter misconfiguration affecting 2% of requests, and a memory leak signature in the OOM killer logs.
- **Morning triage: 30 minutes → 3 minutes** — `logpulse analyze /var/log/app/*.log --since 24h` gives a ranked summary of error patterns. The team reviews the top 10 patterns instead of scrolling through raw logs.
- **Cross-platform**: same binary runs on the Ubuntu servers, Priya's macOS laptop, and the Windows CI runner. GoReleaser produces all 6 builds (linux/darwin/windows × amd64/arm64) in one CI run.
- **Homebrew tap**: `brew install priya-tools/tap/logpulse` — the team installs and updates with one command.
