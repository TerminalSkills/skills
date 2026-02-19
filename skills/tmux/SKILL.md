# tmux — Terminal Multiplexer

> Author: terminal-skills

You are an expert in tmux for managing terminal sessions, panes, and windows. You configure persistent development environments, automate workspace layouts, and maintain long-running processes that survive SSH disconnections.

## Core Competencies

### Sessions
- `tmux new -s dev`: create named session
- `tmux attach -t dev`: reconnect to session (survives SSH disconnect)
- `tmux ls`: list sessions
- `tmux kill-session -t dev`: destroy session
- Detach: `Ctrl-b d` — session continues running in background
- Rename: `Ctrl-b $` — rename current session

### Windows (Tabs)
- `Ctrl-b c`: create new window
- `Ctrl-b n` / `Ctrl-b p`: next / previous window
- `Ctrl-b 0-9`: switch to window by number
- `Ctrl-b ,`: rename window
- `Ctrl-b &`: kill window
- `Ctrl-b w`: window picker (interactive)

### Panes (Splits)
- `Ctrl-b %`: split horizontally (side by side)
- `Ctrl-b "`: split vertically (top/bottom)
- `Ctrl-b arrow`: navigate between panes
- `Ctrl-b z`: zoom pane (toggle fullscreen)
- `Ctrl-b x`: kill pane
- `Ctrl-b {` / `}`: swap pane position
- `Ctrl-b Space`: cycle through pane layouts

### Copy Mode
- `Ctrl-b [`: enter copy mode (scroll, search, select)
- Vi keys: `j/k` scroll, `/` search, `v` select, `y` copy
- `Ctrl-b ]`: paste
- `set -g mode-keys vi`: use vi keybindings in copy mode
- Copy to system clipboard: `bind -T copy-mode-vi y send -X copy-pipe-and-cancel "pbcopy"`

### Configuration (~/.tmux.conf)
- `set -g mouse on`: enable mouse (resize panes, select windows, scroll)
- `set -g base-index 1`: start window numbering at 1
- `set -g default-terminal "tmux-256color"`: proper color support
- `set -g status-style "bg=#1a1b26 fg=#a9b1d6"`: status bar styling
- `set -g prefix C-a`: change prefix from Ctrl-b to Ctrl-a
- `bind r source-file ~/.tmux.conf`: reload config with prefix + r
- `set -g history-limit 50000`: scroll buffer size

### Scripting and Automation
- `tmux send-keys -t dev:1 "npm run dev" Enter`: send commands to specific pane
- `tmux split-window -h -t dev`: script pane creation
- `tmuxinator`: YAML-defined workspace layouts — `tmuxinator start project`
- Session scripts: automate dev environment setup (editor, server, logs, tests)

### Plugins (TPM)
- `tpm`: tmux plugin manager — `set -g @plugin 'tmux-plugins/tpm'`
- `tmux-resurrect`: save and restore sessions (persist across system restart)
- `tmux-continuum`: auto-save sessions every 15 minutes
- `tmux-sensible`: sensible defaults
- `tmux-yank`: clipboard integration across platforms

## Code Standards
- Use named sessions: `tmux new -s project-name` — don't use anonymous sessions, you'll lose track
- Use `tmux-resurrect` + `tmux-continuum` — survive system restarts without losing your workspace
- Set `mouse on` in config — resizing panes with mouse is faster than key combinations
- Use tmuxinator for complex layouts — define once in YAML, launch consistently every time
- Set `base-index 1` and `pane-base-index 1` — keyboard numbers start at 1, not 0
- Use vi copy mode (`mode-keys vi`) — consistent with vim/neovim muscle memory
- Keep long-running processes in tmux — SSH disconnect doesn't kill your dev server, build, or deployment
