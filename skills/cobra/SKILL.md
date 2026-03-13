---
name: cobra
description: >-
   You are an expert in Cobra, the most popular Go library for building modern
  CLI applications. You help developers create command-line tools with
  subcommands, flags, argument validation, shell completions, and help
  generation — powering CLIs like kubectl, Hugo, GitHub CLI, and Docker.
category: Developer Tools
tags: [go, cli, command-line, framework, flags, subcommands]
version: 1.0.0
author: terminal-skills
---

# Cobra — Go CLI Framework

You are an expert in Cobra, the most popular Go library for building modern CLI applications. You help developers create command-line tools with subcommands, flags, argument validation, shell completions, and help generation — powering CLIs like kubectl, Hugo, GitHub CLI, and Docker.

## Core Capabilities

### Application Structure

```go
// cmd/root.go — Root command
package cmd

import (
    "fmt"
    "os"
    "github.com/spf13/cobra"
    "github.com/spf13/viper"
)

var cfgFile string
var verbose bool

var rootCmd = &cobra.Command{
    Use:   "myctl",
    Short: "My CLI tool for managing stuff",
    Long:  `A comprehensive CLI tool for managing deployments, configs, and services.`,
    PersistentPreRun: func(cmd *cobra.Command, args []string) {
        if verbose {
            fmt.Println("Verbose mode enabled")
        }
    },
}

func Execute() {
    if err := rootCmd.Execute(); err != nil {
        os.Exit(1)
    }
}

func init() {
    cobra.OnInitialize(initConfig)
    rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "config file (default $HOME/.myctl.yaml)")
    rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "verbose output")
}

func initConfig() {
    if cfgFile != "" {
        viper.SetConfigFile(cfgFile)
    } else {
        home, _ := os.UserHomeDir()
        viper.AddConfigPath(home)
        viper.SetConfigName(".myctl")
    }
    viper.AutomaticEnv()
    viper.ReadInConfig()
}
```

```go
// cmd/deploy.go — Subcommand with flags
package cmd

import (
    "fmt"
    "github.com/spf13/cobra"
)

var deployCmd = &cobra.Command{
    Use:   "deploy [service]",
    Short: "Deploy a service to the target environment",
    Long:  `Deploy a service to the specified environment with optional version override.`,
    Args:  cobra.ExactArgs(1),            // Require exactly 1 argument
    Example: `  myctl deploy api --env production --version v2.1.0
  myctl deploy worker --env staging --dry-run`,
    RunE: func(cmd *cobra.Command, args []string) error {
        service := args[0]
        env, _ := cmd.Flags().GetString("env")
        version, _ := cmd.Flags().GetString("version")
        dryRun, _ := cmd.Flags().GetBool("dry-run")

        if dryRun {
            fmt.Printf("DRY RUN: Would deploy %s@%s to %s\n", service, version, env)
            return nil
        }

        fmt.Printf("Deploying %s@%s to %s...\n", service, version, env)
        return performDeploy(service, env, version)
    },
}

func init() {
    rootCmd.AddCommand(deployCmd)
    deployCmd.Flags().StringP("env", "e", "staging", "target environment")
    deployCmd.Flags().String("version", "latest", "version to deploy")
    deployCmd.Flags().Bool("dry-run", false, "simulate deployment")
    deployCmd.MarkFlagRequired("env")
}
```

```go
// cmd/status.go — Another subcommand
var statusCmd = &cobra.Command{
    Use:     "status [service]",
    Short:   "Show service status",
    Aliases: []string{"st"},              // myctl st == myctl status
    Args:    cobra.MaximumNArgs(1),
    ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
        // Dynamic completion: list available services
        services := []string{"api", "worker", "scheduler", "web"}
        return services, cobra.ShellCompDirectiveNoFileComp
    },
    RunE: func(cmd *cobra.Command, args []string) error {
        if len(args) == 0 {
            return showAllStatus()
        }
        return showServiceStatus(args[0])
    },
}
```

### Shell Completions

```bash
# Generate completions
myctl completion bash > /etc/bash_completion.d/myctl
myctl completion zsh > "${fpath[1]}/_myctl"
myctl completion fish > ~/.config/fish/completions/myctl.fish

# Cobra generates completions for all commands, flags, and arguments automatically
```

## Installation

```bash
go get github.com/spf13/cobra
# Scaffolding tool
go install github.com/spf13/cobra-cli@latest
cobra-cli init
cobra-cli add deploy
cobra-cli add status
```

## Best Practices

1. **Subcommands for organization** — Group related functionality: `myctl deploy`, `myctl status`, `myctl config`
2. **Flags with Viper** — Bind flags to Viper for unified config (CLI flags + env vars + config file)
3. **RunE over Run** — Use `RunE` (returns error) instead of `Run`; Cobra handles error display and exit codes
4. **Argument validation** — Use `Args: cobra.ExactArgs(1)` or custom validators; catch errors before execution
5. **Shell completions** — Cobra generates bash/zsh/fish/powershell completions; add `ValidArgsFunction` for dynamic completion
6. **Help is automatic** — Cobra generates `--help`, usage text, and subcommand lists; customize with `Long` and `Example`
7. **Aliases for convenience** — Add short aliases: `st` for `status`, `d` for `deploy`
8. **Persistent flags** — Use `PersistentFlags()` on root for flags that apply to all subcommands (`--verbose`, `--config`)
