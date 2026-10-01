---
name: wails
description: >-
  Wails is a Go framework for building desktop applications with web frontends:
  the backend is Go, the UI is any web framework (React, Vue, Svelte) rendered
  in the operating system's webview, and Go methods are called from JavaScript
  through auto-generated TypeScript bindings. Use when a user asks to build a
  desktop app in Go, scaffold a Wails project, bind Go methods to the frontend,
  add native menus, dialogs or events, cross-compile for Windows, or choose
  between Wails v2 and the v3 beta. Covers Wails v2, the stable release.
license: Apache-2.0
compatibility: "Wails v2.16 with Go 1.25+ and Node.js 15+. Linux: gcc, GTK 3, WebKit2GTK. Windows: WebView2 runtime. macOS: Xcode command line tools"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags: ["desktop", "go", "golang", "cross-platform", "native"]
  repository: https://github.com/wailsapp/wails
---

# Wails — Desktop Apps with Go and Web Frontend

## Overview

Wails builds lightweight desktop apps where the backend is Go and the frontend is any web framework (React, Vue, Svelte, Preact, Lit), shown in the system webview instead of a bundled browser. Exported Go methods become promise-returning JavaScript functions with generated TypeScript types.

**This skill describes Wails v2**, the stable line (v2.16.0, September 2026). Wails v3 is in beta (v3.0.0-beta.27): a rewrite with a different CLI, import path and API, summarised at the end of the Instructions.

## Instructions

### Project Setup

```bash
# Prerequisites: Go and npm. v2.16.0's go.mod requires Go 1.25 (the install page still says 1.21+)
go install github.com/wailsapp/wails/v2/cmd/wails@latest
export PATH="$PATH:$(go env GOPATH)/bin"
wails doctor                           # lists missing system dependencies per platform
wails init -n fieldnotes -t react-ts   # templates: wails init -l (svelte, vue, preact, lit, vanilla, each with -ts)
cd fieldnotes
wails dev                              # app window with live reload; also served at http://localhost:34115
wails build                            # production binary in build/bin/
wails build -platform windows/amd64    # other targets: darwin/universal, linux/arm64, ...
wails build -platform windows/amd64 -nsis   # Windows installer (needs makensis on the build machine)
```

Platform dependencies: macOS needs `xcode-select --install`; Windows needs the WebView2 runtime (`wails doctor` checks it); Linux needs gcc, GTK 3 and WebKit2GTK. Distributions without WebKit2GTK 4.0 (Ubuntu 24.04, for example) need `libwebkit2gtk-4.1-dev` and the build tag `-tags webkit2_41` on every `wails dev` and `wails build` (Example 2).

### Go Backend

```go
// app.go — exported methods of a bound struct are callable from JavaScript
package main

import (
	"context"
	"database/sql"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite" // pure-Go driver: no extra CGO, cross-compiles cleanly
)

type App struct {
	ctx context.Context
	db  *sql.DB
}

func NewApp() *App { return &App{} }

// startup receives the context that every runtime call needs (runtime calls work from OnDomReady on)
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	dir, _ := os.UserConfigDir() // ~/.config, ~/Library/Application Support, %AppData%
	dbPath := filepath.Join(dir, "fieldnotes", "notes.db")
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		log.Fatal(err)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	if _, err = db.Exec(`CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`); err != nil {
		log.Fatal(err)
	}
	a.db = db
}

// Note is generated as a TypeScript class in frontend/wailsjs/go/models.ts
type Note struct {
	ID        int64  `json:"id"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	UpdatedAt string `json:"updatedAt"`
}

// A trailing error return value rejects the JavaScript promise
func (a *App) GetNotes() ([]Note, error) {
	rows, err := a.db.Query("SELECT id, title, content, updated_at FROM notes ORDER BY updated_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	notes := []Note{} // non-nil, so the frontend receives [] instead of null
	for rows.Next() {
		var n Note
		if err := rows.Scan(&n.ID, &n.Title, &n.Content, &n.UpdatedAt); err != nil {
			return nil, err
		}
		notes = append(notes, n)
	}
	return notes, rows.Err()
}

func (a *App) CreateNote(title string) (*Note, error) {
	res, err := a.db.Exec("INSERT INTO notes (title) VALUES (?)", title)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &Note{ID: id, Title: title}, nil
}

func (a *App) UpdateNote(id int64, title, content string) error {
	_, err := a.db.Exec("UPDATE notes SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", title, content, id)
	return err
}
```

### Frontend (React + TypeScript)

```tsx
// frontend/src/App.tsx — frontend/wailsjs/ is regenerated by `wails dev` and `wails build`
import { useEffect, useState } from "react";
import { CreateNote, GetNotes, UpdateNote } from "../wailsjs/go/main/App";
import { main } from "../wailsjs/go/models";
import { EventsOn } from "../wailsjs/runtime/runtime";

export default function App() {
  const [notes, setNotes] = useState<main.Note[]>([]);
  const [selected, setSelected] = useState<main.Note | null>(null);
  const load = () => GetNotes().then(setNotes); // Go []Note arrives as main.Note[]
  async function create() {
    setSelected(await CreateNote("Untitled")); // Go *Note arrives as main.Note
    load();
  }

  useEffect(() => {
    load();
    return EventsOn("menu:new-note", create); // EventsOn returns its own unsubscribe function
  }, []);
  async function save(note: main.Note, content: string) {
    await UpdateNote(note.id, note.title, content); // a Go error rejects the promise
    load();
  }

  return (
    <div className="app">
      <aside>
        <button onClick={create}>+ New Note</button>
        {notes.map((note) => (
          <div key={note.id} onClick={() => setSelected(note)}>
            <strong>{note.title}</strong> <small>{note.updatedAt}</small>
          </div>
        ))}
      </aside>
      {selected && <textarea defaultValue={selected.content} onBlur={(e) => save(selected, e.target.value)} />}
    </div>
  );
}
```

### System Tray and Menus

Wails v2 has application menus but **no system tray API**; a tray icon needs Wails v3 or a third-party Go package.

```go
// main.go — window options, application menu, bindings
package main

import (
	"embed"
	"log"
	goruntime "runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	appMenu := menu.NewMenu()
	if goruntime.GOOS == "darwin" {
		appMenu.Append(menu.AppMenu()) // must come first on macOS
	}
	fileMenu := appMenu.AddSubmenu("File")
	fileMenu.AddText("New Note", keys.CmdOrCtrl("n"), func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu:new-note") // Go → frontend
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) { runtime.Quit(app.ctx) })
	if goruntime.GOOS == "darwin" {
		appMenu.Append(menu.EditMenu()) // enables Cmd+C, Cmd+V, Cmd+Z on macOS
	}

	err := wails.Run(&options.App{
		Title:       "Field Notes",
		Width:       1024,
		Height:      768,
		AssetServer: &assetserver.Options{Assets: assets},
		Menu:        appMenu,
		OnStartup:   app.startup,
		Bind:        []interface{}{app},
	})
	if err != nil {
		log.Fatal(err)
	}
}
```

### Wails v3 (beta)

Install with `go install github.com/wailsapp/wails/v3/cmd/wails3@latest`; the commands are `wails3 init -n fieldnotes`, `wails3 dev` and `wails3 build`, driven by a `Taskfile.yml`. `wails.Run(&options.App{Bind: ...})` becomes `application.New(application.Options{Services: ...})` plus explicitly created windows; bindings are generated into `frontend/bindings/`, the JavaScript runtime is the `@wailsio/runtime` package, and multiple windows and a system tray are built in. None of the v2 code above compiles against v3 unchanged; the migration guide is at `https://v3.wails.io`. Use v2 for anything that ships today and v3 when a release needs its features and can absorb beta fixes.

## Examples

### Example 1: Export a note through a native save dialog

**User request:** "Add an Export button that saves the selected note as a Markdown file and shows where it went."

```go
// app.go — add the import "github.com/wailsapp/wails/v2/pkg/runtime", then:
func (a *App) ExportNote(id int64) (string, error) {
	var n Note
	if err := a.db.QueryRow("SELECT title, content FROM notes WHERE id = ?", id).Scan(&n.Title, &n.Content); err != nil {
		return "", err
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export note",
		DefaultFilename: n.Title + ".md",
		Filters:         []runtime.FileFilter{{DisplayName: "Markdown (*.md)", Pattern: "*.md"}},
	})
	if err != nil || path == "" {
		return "", err
	}
	if err := os.WriteFile(path, []byte("# "+n.Title+"\n\n"+n.Content+"\n"), 0o644); err != nil {
		return "", err
	}
	runtime.EventsEmit(a.ctx, "note:exported", path)
	return path, nil
}
```

```tsx
// App.tsx — import ExportNote from "../wailsjs/go/main/App", then inside the component:
const [status, setStatus] = useState("");
useEffect(() => EventsOn("note:exported", (path: string) => setStatus(`Saved ${path}`)), []);
// and in the JSX, next to the textarea:
{selected && <button onClick={() => ExportNote(selected.id)}>Export…</button>}
<footer>{status}</footer>
```

**Result:** the next `wails dev` or `wails build` regenerates the bindings, and `frontend/wailsjs/go/main/App.d.ts` gains `export function ExportNote(arg1:number):Promise<string>;`. Clicking Export opens the system save dialog; the footer then shows the saved path.

### Example 2: Build on Ubuntu 24.04 and cross-compile for Windows

**User request:** "wails doctor says libwebkit is missing on Ubuntu 24.04, and I also need a Windows .exe from this machine."

```bash
sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev
wails build -tags webkit2_41              # build/bin/fieldnotes
wails build -platform windows/amd64       # build/bin/fieldnotes.exe, no Windows machine needed
```

**Result:** the Windows build ends with `Built '.../fieldnotes/build/bin/fieldnotes.exe' in 11.265s.` (about 15 MB with the SQLite driver). `wails doctor` on 24.04 still suggests `libwebkit2gtk-4.0-dev`, which that release does not ship. `wails build -platform darwin/arm64` on Linux stops with `Crosscompiling to Mac not currently supported.`: macOS builds need a Mac or a macOS CI runner.

## Guidelines

1. **Go for backend, web for UI** — keep business logic, file I/O and database access in Go; keep rendering in the frontend
2. **Auto-generated bindings** — never edit `frontend/wailsjs/`; it is rewritten on every `wails dev` and `wails build`
3. **Embed assets** — `//go:embed all:frontend/dist` bundles the frontend into the binary; single-file distribution
4. **Events for async** — `runtime.EventsEmit` pushes progress and background results to the frontend; keep the function `EventsOn` returns and call it on unmount
5. **Native dialogs** — use the runtime dialogs (`OpenFileDialog`, `SaveFileDialog`, `MessageDialog`) instead of HTML modals
6. **SQLite for local data** — keep the database under `os.UserConfigDir()`, never next to the executable; a pure-Go driver keeps cross-compilation working
7. **Context comes from `OnStartup`** — store it there, but call window, dialog and event functions only from `OnDomReady` or later; the docs do not guarantee the runtime inside `OnStartup`
8. **Cross-compiling is partial** — Windows builds from Linux and macOS; macOS builds only on macOS; Linux builds need Linux with the GTK and WebKit headers. Use one CI runner per OS
9. **Bound methods are an API surface** — anything in the webview can call them, so validate arguments and do not load untrusted remote pages into the app window
