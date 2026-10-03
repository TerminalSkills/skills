---
name: cobra
description: >-
  Builds command-line tools in Go with Cobra, the library behind kubectl, Hugo and the GitHub CLI: subcommands, flags, argument validation, generated help and shell completions. Use when a user asks to create a Go CLI, add subcommands or flags, validate arguments, bind flags to config files and environment variables with Viper, or generate bash, zsh, fish or PowerShell completions.
license: Apache-2.0
compatibility: "Go 1.15+ (cobra v1.10.x). Optional: spf13/viper for configuration files and environment variables."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - go
    - cli
    - command-line
    - flags
    - subcommands
  repository: https://github.com/spf13/cobra
---

# Cobra — Go CLI Framework

## Overview

Cobra structures a Go CLI as a tree of commands (`app`, `app deploy`, `app config set`), each with its own flags, argument rules and help text. It generates `--help`, usage output, "did you mean" suggestions and shell completion scripts. The current release is v1.10.2 (December 2025); Viper v1.21 is the usual companion for config files and environment variables.

## Instructions

### Installation and scaffolding

```bash
go mod init github.com/acme/deployctl
go get github.com/spf13/cobra@latest
go get github.com/spf13/viper@latest          # only if you want config files and env vars

go install github.com/spf13/cobra-cli@latest  # optional generator
cobra-cli init                                # writes main.go and cmd/root.go
cobra-cli add deploy                          # writes cmd/deploy.go
```
`cobra-cli` is a separate, rarely updated tool (v1.3.0, 2022). It only writes boilerplate with placeholder text you must replace; writing the files by hand is just as easy.

### Layout

`main.go` only calls `cmd.Execute()`; every command lives in its own file under `cmd/` and registers itself with `rootCmd.AddCommand(...)` in `init()`.

### Root command with Viper

```go
// cmd/root.go
package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var cfgFile string

var rootCmd = &cobra.Command{
	Use:          "deployctl",
	Short:        "Deploy and inspect services",
	SilenceUsage: true, // do not dump usage when RunE returns an error
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		return initConfig(cmd)
	},
}

func Execute() error { return rootCmd.Execute() }

func init() {
	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default ./deployctl.yaml)")
	rootCmd.PersistentFlags().BoolP("verbose", "v", false, "verbose output")
}

func initConfig(cmd *cobra.Command) error {
	if cfgFile != "" {
		viper.SetConfigFile(cfgFile)
	} else {
		viper.AddConfigPath(".")
		viper.SetConfigName("deployctl")
	}
	viper.SetEnvPrefix("DEPLOYCTL")
	viper.SetEnvKeyReplacer(strings.NewReplacer("-", "_"))
	viper.AutomaticEnv()
	if err := viper.ReadInConfig(); err != nil {
		if _, missing := err.(viper.ConfigFileNotFoundError); !missing {
			return fmt.Errorf("reading config: %w", err)
		}
	}
	return viper.BindPFlags(cmd.Flags()) // flag > env var > config file > flag default
}
```
```go
// main.go
func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
```
Cobra already prints the error returned by `RunE`; do not print it again in `main`.

### Subcommand with arguments, flags and completion

```go
// cmd/deploy.go
package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var deployCmd = &cobra.Command{
	Use:   "deploy SERVICE",
	Short: "Deploy a service to an environment",
	Example: `  deployctl deploy api --env production --version v2.1.0
  deployctl deploy worker --dry-run`,
	Args: cobra.ExactArgs(1),
	ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		if len(args) != 0 {
			return nil, cobra.ShellCompDirectiveNoFileComp
		}
		return []string{"api", "worker", "scheduler"}, cobra.ShellCompDirectiveNoFileComp
	},
	RunE: func(cmd *cobra.Command, args []string) error {
		env, version := viper.GetString("env"), viper.GetString("version")
		if viper.GetBool("dry-run") {
			fmt.Fprintf(cmd.OutOrStdout(), "DRY RUN: would deploy %s@%s to %s\n", args[0], version, env)
			return nil
		}
		return runDeploy(cmd.Context(), args[0], env, version)
	},
}

func init() {
	rootCmd.AddCommand(deployCmd)
	deployCmd.Flags().StringP("env", "e", "staging", "target environment")
	deployCmd.Flags().String("version", "latest", "version to deploy")
	deployCmd.Flags().Bool("dry-run", false, "print the plan without deploying")
	_ = deployCmd.RegisterFlagCompletionFunc("env", func(*cobra.Command, []string, string) ([]string, cobra.ShellCompDirective) {
		return []string{"staging", "production"}, cobra.ShellCompDirectiveNoFileComp
	})
}
```

Other building blocks: `Args` validators `cobra.NoArgs`, `MinimumNArgs(n)`, `MaximumNArgs(n)`, `RangeArgs(a, b)`, `MatchAll(...)`; `cmd.MarkFlagRequired("env")`; `MarkFlagsMutuallyExclusive("json", "yaml")`; `MarkFlagsRequiredTogether`; `Aliases: []string{"st"}`; `Hidden: true`; `Deprecated: "use deploy instead"`; `rootCmd.AddGroup(&cobra.Group{ID: "ops", Title: "Operations"})` with `GroupID: "ops"` on commands; `rootCmd.ExecuteContext(ctx)` to pass a cancellable context to `cmd.Context()`.

### Shell completions

Cobra adds a `completion` command (bash, zsh, fish, powershell) to any app that has subcommands:

```bash
source <(deployctl completion bash)                       # current bash session
deployctl completion zsh > "${fpath[1]}/_deployctl"       # zsh, then restart the shell
deployctl completion fish > ~/.config/fish/completions/deployctl.fish
deployctl __complete deploy ""                            # debug: prints candidates for `deployctl deploy <TAB>`
```

## Examples

### Example 1: "Add a `status` command that completes service names"

```go
var statusCmd = &cobra.Command{
	Use:               "status [SERVICE]",
	Short:             "Show the status of one or all services",
	Aliases:           []string{"st"},
	Args:              cobra.MaximumNArgs(1),
	ValidArgsFunction: completeServices,
	RunE: func(cmd *cobra.Command, args []string) error {
		if len(args) == 0 {
			return printAllStatus(cmd.OutOrStdout())
		}
		return printStatus(cmd.OutOrStdout(), args[0])
	},
}

func init() { rootCmd.AddCommand(statusCmd) }
```
`deployctl st api` now runs the same command, and `deployctl status <TAB>` offers the service names returned by `completeServices`.

### Example 2: "Let users set the environment from a file or a variable"

```bash
echo "version: v2.1.0" > deployctl.yaml
DEPLOYCTL_ENV=production deployctl deploy api --dry-run
# DRY RUN: would deploy api@v2.1.0 to production
deployctl deploy api --dry-run -e staging
# DRY RUN: would deploy api@v2.1.0 to staging
```
The flag wins over the environment variable, which wins over the config file, which wins over the flag default (this behavior was run against cobra v1.10.2 and viper v1.21.0 with the code above).

## Guidelines

- Use `RunE` instead of `Run` so errors go through Cobra; set `SilenceUsage: true` on the root so a runtime failure does not print the whole usage text.
- A child's `PersistentPreRun(E)` replaces the parent's instead of adding to it. Either define it only on the root, call the parent's hook yourself, or set `cobra.EnableTraverseRunHooks = true` so all of them run.
- Call `viper.BindPFlags` inside `PersistentPreRunE`, not in `init()`: binding the whole command's flag set in `init()` would mix flags of different subcommands that share a name.
- Global variables for flags are fine for small tools; for larger ones, put them in a struct created per command so tests can run commands in parallel with `cmd.SetArgs(...)` and `cmd.SetOut(buf)`.
- Write command output to `cmd.OutOrStdout()` and diagnostics to `cmd.ErrOrStderr()` so tests can capture them.
- Keep secrets out of flags (they appear in `ps` and shell history); read tokens from environment variables.
- For a tiny one-command script, the standard `flag` package is enough; Cobra pays off with subcommands.
