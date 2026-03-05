---
name: gleam
category: Programming Languages
tags: [gleam, erlang, beam, functional, type-safe, concurrent, fault-tolerant]
version: 1.0.0
author: terminal-skills
---

# Gleam — Type-Safe Language for the BEAM

You are an expert in Gleam, the type-safe functional language that runs on the Erlang BEAM virtual machine. You help developers build concurrent, fault-tolerant applications with Gleam's friendly syntax, exhaustive pattern matching, and access to the entire Erlang/OTP ecosystem.

## Core Capabilities

### Project Setup

```bash
# Install Gleam
brew install gleam    # macOS
# Or: curl -fsSL https://gleam.run/install | sh

# Create a new project
gleam new my_app
cd my_app

# Run
gleam run

# Test
gleam test

# Build for production
gleam build
```

### Type-Safe Web Server with Wisp

```gleam
// src/my_app/router.gleam — Type-safe HTTP routing
// Gleam catches errors at compile time — no runtime crashes from typos.

import gleam/http.{Get, Post, Delete}
import gleam/http/request.{type Request}
import gleam/http/response.{type Response}
import gleam/json
import gleam/result
import wisp.{type Request as WispRequest, type Response as WispResponse}

pub fn handle_request(req: WispRequest) -> WispResponse {
  case wisp.path_segments(req) {
    // GET /api/tasks
    ["api", "tasks"] -> list_tasks(req)

    // GET /api/tasks/:id
    ["api", "tasks", id] -> get_task(req, id)

    // POST /api/tasks
    ["api", "tasks"] if req.method == Post -> create_task(req)

    // DELETE /api/tasks/:id
    ["api", "tasks", id] if req.method == Delete -> delete_task(req, id)

    // 404 for everything else
    _ -> wisp.not_found()
  }
}

fn list_tasks(req: WispRequest) -> WispResponse {
  // Pattern matching ensures we handle every case
  case task_service.get_all() {
    Ok(tasks) -> {
      let body = json.array(tasks, task_to_json)
      wisp.json_response(json.to_string_builder(body), 200)
    }
    Error(err) -> {
      wisp.log_error("Failed to list tasks: " <> err)
      wisp.internal_server_error()
    }
  }
}

fn create_task(req: WispRequest) -> WispResponse {
  use body <- wisp.require_json(req)

  // Decode and validate — compiler ensures all fields are handled
  case decode_create_request(body) {
    Ok(create_req) -> {
      case task_service.create(create_req.title, create_req.priority) {
        Ok(task) -> wisp.json_response(
          json.to_string_builder(task_to_json(task)),
          201,
        )
        Error(err) -> wisp.unprocessable_entity()
      }
    }
    Error(_) -> wisp.bad_request()
  }
}
```

### Custom Types and Pattern Matching

```gleam
// src/my_app/task.gleam — Domain types with exhaustive matching
// The compiler guarantees you handle every variant — impossible to forget a case.

import gleam/option.{type Option, Some, None}

/// Task priority — the compiler ensures you handle all variants
pub type Priority {
  Low
  Medium
  High
  Urgent
}

/// Task status with strict state machine semantics
pub type Status {
  Todo
  InProgress
  Review
  Done
  Cancelled
}

pub type Task {
  Task(
    id: String,
    title: String,
    description: Option(String),
    priority: Priority,
    status: Status,
    assignee: Option(String),
  )
}

/// Validate status transitions — not all transitions are allowed.
/// The compiler ensures every combination is handled.
pub fn transition(from: Status, to: Status) -> Result(Status, String) {
  case from, to {
    // Valid transitions
    Todo, InProgress -> Ok(InProgress)
    InProgress, Review -> Ok(Review)
    Review, Done -> Ok(Done)
    Review, InProgress -> Ok(InProgress)    // Send back for changes

    // Any status can be cancelled
    _, Cancelled -> Ok(Cancelled)

    // Can't move backwards to Todo
    _, Todo -> Error("Cannot move back to Todo")

    // Can't skip steps
    Todo, Done -> Error("Must go through InProgress and Review first")
    Todo, Review -> Error("Must go through InProgress first")

    // Already in target state
    same, target if same == target -> Ok(target)

    // Everything else is invalid
    _, _ -> Error("Invalid status transition")
  }
}

/// Calculate SLA based on priority — exhaustive, no default needed
pub fn sla_hours(priority: Priority) -> Int {
  case priority {
    Low -> 72
    Medium -> 24
    High -> 8
    Urgent -> 2
  }
}
```

### Concurrency with OTP Actors

```gleam
// src/my_app/task_actor.gleam — Concurrent actor for task management
// Gleam runs on the BEAM — millions of lightweight processes, fault-tolerant.

import gleam/erlang/process.{type Subject}
import gleam/otp/actor.{type Next}

/// Messages the actor can receive
pub type Message {
  GetAll(reply_to: Subject(List(Task)))
  Create(title: String, priority: Priority, reply_to: Subject(Result(Task, String)))
  UpdateStatus(id: String, status: Status, reply_to: Subject(Result(Task, String)))
}

/// Actor state
pub type State {
  State(tasks: List(Task), next_id: Int)
}

/// Handle each message type
fn handle_message(message: Message, state: State) -> Next(Message, State) {
  case message {
    GetAll(reply_to) -> {
      process.send(reply_to, state.tasks)
      actor.continue(state)
    }

    Create(title, priority, reply_to) -> {
      let id = "task-" <> int.to_string(state.next_id)
      let task = Task(
        id: id,
        title: title,
        description: None,
        priority: priority,
        status: Todo,
        assignee: None,
      )
      process.send(reply_to, Ok(task))
      actor.continue(State(
        tasks: [task, ..state.tasks],
        next_id: state.next_id + 1,
      ))
    }

    UpdateStatus(id, new_status, reply_to) -> {
      let result = update_task_status(state.tasks, id, new_status)
      case result {
        Ok(updated_tasks) -> {
          process.send(reply_to, Ok(find_task(updated_tasks, id)))
          actor.continue(State(..state, tasks: updated_tasks))
        }
        Error(err) -> {
          process.send(reply_to, Error(err))
          actor.continue(state)
        }
      }
    }
  }
}

/// Start the actor
pub fn start() -> Result(Subject(Message), actor.StartError) {
  actor.start(State(tasks: [], next_id: 1), handle_message)
}
```

## Installation

```bash
# macOS
brew install gleam

# Linux
curl -fsSL https://gleam.run/install | sh

# Dependencies
gleam add wisp           # Web framework
gleam add gleam_json     # JSON encoding/decoding
gleam add sqlight        # SQLite bindings
gleam add gleam_http     # HTTP types
```

## Best Practices

1. **Let the compiler help** — Gleam's type system catches bugs at compile time; if it compiles, it almost certainly works
2. **Use custom types over strings** — Define `Priority` and `Status` as custom types, not strings; the compiler ensures you handle every variant
3. **Pattern matching for control flow** — Replace if/else chains with pattern matching; the compiler warns about missing cases
4. **Result type over exceptions** — Gleam has no exceptions; use `Result(value, error)` and `use` syntax for error handling
5. **Leverage the BEAM** — Gleam runs on Erlang's VM; you get fault tolerance, hot code reloading, and millions of concurrent processes for free
6. **Call Erlang/Elixir libraries** — Use `@external` to call any Erlang or Elixir library; the entire OTP ecosystem is available
7. **Pipelines for data transformation** — Use `|>` operator for readable data pipelines: `data |> filter |> map |> sort`
8. **Actors for state** — Use OTP actors (via gleam_otp) for concurrent stateful services; each actor is isolated and crash-safe
