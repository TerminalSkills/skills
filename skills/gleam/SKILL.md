---
name: gleam
description: >-
  Gleam is a statically typed functional language that compiles to Erlang (BEAM) or JavaScript. Use when creating Gleam projects, writing custom types and pattern matching, building web servers with Wisp and Mist, running OTP actors, or adding dependencies with gleam add. Covers Gleam 1.x and current package APIs.
license: Apache-2.0
compatibility: "Gleam 1.19+; Erlang/OTP for the default Erlang target, Node.js, Deno or Bun for the JavaScript target"
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/gleam-lang/gleam
  category: development
  tags:
  - gleam
  - erlang
  - beam
  - functional
  - type-safe
---

# Gleam — Type-Safe Language for the BEAM

## Overview

Gleam is a small, statically typed functional language. It compiles to Erlang and runs on the BEAM virtual machine (fault-tolerant, many lightweight processes), or compiles to JavaScript. There are no exceptions, no null, and no implicit conversions: errors are `Result` values and `case` expressions must be exhaustive. Current release: 1.19.2 (the language is 1.x, and the standard library `gleam_stdlib` is 1.x too). Web code in this skill targets Erlang, because Wisp, Mist and OTP actors are Erlang-only.

## Instructions

### Project setup

Install Gleam with a package manager (`brew install gleam` on macOS and Linuxbrew; your distribution's package or `mise`/`asdf` also work), or download the release archive from https://github.com/gleam-lang/gleam/releases and check it against the `.sha256` file published next to it. The Erlang target also needs Erlang/OTP installed (the compiler calls `escript`); the JavaScript target needs a JS runtime instead.

```bash
gleam new task_api          # Erlang target by default; add --template javascript for JS
cd task_api
gleam add wisp mist gleam_json gleam_otp gleam_erlang gleam_http
gleam run                   # build and run src/task_api.gleam main()
gleam test                  # runs gleeunit tests in test/
gleam check                 # type check only
gleam format                # format source
gleam run --target javascript   # run on Node instead (pure code only)
```

`gleam add` writes version ranges into `gleam.toml`; `gleam deps update` refreshes them. Packages live on Hex (https://hex.pm). Note that `gleam_otp` 1.x has a new actor API and `wisp` 2.x changed several helpers; many older blog posts show removed functions.

### Custom types and pattern matching

```gleam
// src/task_api/task.gleam
import gleam/option.{type Option, None, Some}

pub type Priority {
  Low
  Medium
  High
  Urgent
}

pub type Status {
  Todo
  InProgress
  Review
  Done
  Cancelled
}

pub type Task {
  Task(id: String, title: String, priority: Priority, status: Status, assignee: Option(String))
}

/// Only some status changes are allowed; the compiler checks every pair is covered.
pub fn transition(from: Status, to: Status) -> Result(Status, String) {
  case from, to {
    Todo, InProgress -> Ok(InProgress)
    InProgress, Review -> Ok(Review)
    Review, Done -> Ok(Done)
    Review, InProgress -> Ok(InProgress)
    Done, _ | Cancelled, _ -> Error("Finished tasks cannot change status")
    _, Cancelled -> Ok(Cancelled)
    _, _ -> Error("Invalid status transition")
  }
}

/// No default branch needed: adding a Priority variant breaks the build until handled.
pub fn sla_hours(priority: Priority) -> Int {
  case priority {
    Low -> 72
    Medium -> 24
    High -> 8
    Urgent -> 2
  }
}

pub fn describe(task: Task) -> String {
  case task.assignee {
    Some(name) -> task.title <> " (" <> name <> ")"
    None -> task.title <> " (unassigned)"
  }
}
```

### JSON encoding and decoding

`gleam_json` 3.x encodes with `json.object`/`json.string` and decodes with the `gleam/dynamic/decode` module (the old `dynamic.field` decoders are gone).

```gleam
import gleam/dynamic/decode
import gleam/json

pub type NewTask {
  NewTask(title: String, priority: String)
}

fn new_task_decoder() -> decode.Decoder(NewTask) {
  use title <- decode.field("title", decode.string)
  use priority <- decode.field("priority", decode.string)
  decode.success(NewTask(title:, priority:))
}

pub fn parse(input: String) -> Result(NewTask, json.DecodeError) {
  json.parse(input, new_task_decoder())
}

pub fn encode(task: NewTask) -> String {
  json.object([
    #("title", json.string(task.title)),
    #("priority", json.string(task.priority)),
  ])
  |> json.to_string
}
```

### Web server with Wisp and Mist, state in an OTP actor

Wisp (2.x) is the web framework; Mist is the HTTP server it runs on. Handlers take a `wisp.Request` and return a `wisp.Response`; route with `gleam/http/request.path_segments` and the request method. Bodies are strings (`wisp.json_response(json_string, status)`).

```gleam
// src/task_api.gleam
import gleam/dynamic/decode
import gleam/erlang/process
import gleam/http.{Get, Post}
import gleam/http/request
import gleam/int
import gleam/json
import gleam/list
import gleam/otp/actor
import mist
import wisp.{type Request, type Response}
import wisp/wisp_mist

pub type Task {
  Task(id: String, title: String)
}

pub type Message {
  GetAll(reply_to: process.Subject(List(Task)))
  Create(title: String, reply_to: process.Subject(Task))
}

pub type State {
  State(tasks: List(Task), next_id: Int)
}

fn handle_message(state: State, message: Message) -> actor.Next(State, Message) {
  case message {
    GetAll(reply_to) -> {
      process.send(reply_to, list.reverse(state.tasks))
      actor.continue(state)
    }
    Create(title, reply_to) -> {
      let task = Task("task-" <> int.to_string(state.next_id), title)
      process.send(reply_to, task)
      actor.continue(State(tasks: [task, ..state.tasks], next_id: state.next_id + 1))
    }
  }
}

fn task_json(task: Task) -> json.Json {
  json.object([#("id", json.string(task.id)), #("title", json.string(task.title))])
}

pub fn handle_request(req: Request, store: process.Subject(Message)) -> Response {
  use <- wisp.log_request(req)
  use <- wisp.rescue_crashes
  case request.path_segments(req), req.method {
    ["api", "tasks"], Get ->
      actor.call(store, waiting: 1000, sending: GetAll)
      |> json.array(task_json)
      |> json.to_string
      |> wisp.json_response(200)
    ["api", "tasks"], Post -> {
      use body <- wisp.require_json(req)
      case decode.run(body, decode.field("title", decode.string, decode.success)) {
        Ok(title) ->
          actor.call(store, waiting: 1000, sending: Create(title, _))
          |> task_json
          |> json.to_string
          |> wisp.json_response(201)
        Error(_) -> wisp.unprocessable_content()
      }
    }
    ["api", "tasks"], _ -> wisp.method_not_allowed([Get, Post])
    _, _ -> wisp.not_found()
  }
}

pub fn main() {
  wisp.configure_logger()
  let secret_key_base = wisp.random_string(64)
  let assert Ok(started) =
    actor.new(State(tasks: [], next_id: 1))
    |> actor.on_message(handle_message)
    |> actor.start
  let assert Ok(_) =
    wisp_mist.handler(handle_request(_, started.data), secret_key_base)
    |> mist.new
    |> mist.bind("127.0.0.1")
    |> mist.port(8000)
    |> mist.start
  process.sleep_forever()
}
```

Try it: `gleam run`, then `curl -s -X POST localhost:8000/api/tasks -H 'content-type: application/json' -d '{"title":"Renew TLS certificate"}'` returns `{"id":"task-1","title":"Renew TLS certificate"}`.

## Examples

### Example 1: Add a JSON endpoint to a Gleam service

**User request:** "Add GET /api/health to my Wisp app that returns the app version as JSON."

Add a branch to the `case` in `handle_request`: `["api", "health"], Get -> json.object([#("status", json.string("ok")), #("version", json.string("1.4.2"))]) |> json.to_string |> wisp.json_response(200)`. Run `gleam check` (fast, no server), then `gleam run` and `curl -s localhost:8000/api/health`; the body is `{"status":"ok","version":"1.4.2"}`.

### Example 2: Replace string statuses with a custom type

**User request:** "Task status is a String in my Gleam code and I keep typo-ing it. Fix that."

Define `pub type Status { Todo InProgress Review Done Cancelled }`, change the `Task` field type, and add `status_from_string(String) -> Result(Status, Nil)` for input at the JSON boundary. Run `gleam check`: every `case` that no longer covers all variants is reported as an error with the missing patterns, so nothing is left unhandled.

## Guidelines

1. Use `gleam check` for a fast compile loop, `gleam format` before committing, `gleam test` with gleeunit for tests.
2. Model states as custom types, not strings; avoid catch-all `_` branches so new variants are flagged by the compiler.
3. No exceptions: return `Result(value, error)` and chain with `use x <- result.try(...)`. `let assert` crashes on mismatch, so keep it for startup code and tests.
4. Pipelines (`|>`) pass the left value as the first argument; labelled arguments and `_` captures (`Create(title, _)`) fill other positions.
5. Call Erlang or JavaScript with `@external(erlang, "module", "function")`, always with a Gleam type signature.
6. Bind servers to `127.0.0.1` in development (`mist.bind`), and load `secret_key_base` from an environment variable in production instead of generating it per start, or signed cookies break on restart.
7. Actors (`gleam_otp`) serialize access to state; use `actor.call` with a timeout, and supervise long-lived actors for restarts.
8. Code using Wisp, Mist, or OTP only works on the Erlang target; keep shared logic in pure modules if you also want JavaScript output.
