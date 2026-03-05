---
name: zig
description: Expert guidance for Zig, the systems programming language focused on performance, safety, and readability. Helps developers write high-performance code with compile-time evaluation, seamless C interop, no hidden control flow, and no garbage collector. Zig is used for game engines, operating systems, networking, and as a C/C++ replacement.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
  - zig
  - systems
  - performance
  - c-interop
  - comptime
---

# Zig — Modern Systems Programming Language


## Overview

You are an expert in Zig, the systems programming language focused on performance, safety, and readability. You help developers write high-performance code with compile-time evaluation, seamless C interop, no hidden control flow, and no garbage collector. Zig is used for game engines, operating systems, networking, and as a C/C++ replacement.

## Instructions

### Build System

```bash
# Install Zig
brew install zig    # macOS
# Or download from https://ziglang.org/download/

# Create a project
mkdir my-project && cd my-project
zig init

# Build and run
zig build run

# Test
zig build test

# Cross-compile (Zig's killer feature — no extra toolchains needed)
zig build -Dtarget=x86_64-linux-gnu
zig build -Dtarget=aarch64-macos
zig build -Dtarget=x86_64-windows-gnu
```

### Core Language

```zig
// src/main.zig — Zig fundamentals
const std = @import("std");
const Allocator = std.mem.Allocator;

// Structs are the primary abstraction (no classes, no inheritance)
const Task = struct {
    id: u64,
    title: []const u8,       // Slice — pointer + length, no null terminator
    priority: Priority,
    status: Status,

    const Self = @This();

    pub fn isOverdue(self: Self, now: i64) bool {
        return self.due_date != null and self.due_date.? < now;
    }

    pub fn format(self: Self, writer: anytype) !void {
        try writer.print("[{s}] {s} ({})\n", .{
            @tagName(self.status),
            self.title,
            @tagName(self.priority),
        });
    }
};

const Priority = enum { low, medium, high, urgent };
const Status = enum { todo, in_progress, review, done, cancelled };

// Error handling — errors are values, not exceptions
const TaskError = error{
    NotFound,
    InvalidTransition,
    TitleTooLong,
    StorageFull,
};

// Explicit allocator — you choose where memory comes from
fn createTask(allocator: Allocator, title: []const u8, priority: Priority) TaskError!*Task {
    if (title.len > 256) return TaskError.TitleTooLong;

    const task = allocator.create(Task) catch return TaskError.StorageFull;
    task.* = .{
        .id = generateId(),
        .title = allocator.dupe(u8, title) catch return TaskError.StorageFull,
        .priority = priority,
        .status = .todo,
    };
    return task;
}

pub fn main() !void {
    // Arena allocator — free everything at once (fast, simple)
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();     // Free ALL memory when scope exits
    const allocator = arena.allocator();

    const task = try createTask(allocator, "Implement auth", .high);
    const stdout = std.io.getStdOut().writer();
    try task.format(stdout);
}
```

### Comptime (Compile-Time Evaluation)

```zig
// comptime.zig — Zig's most powerful feature: code that runs at compile time
const std = @import("std");

// Generic data structures — type parameter resolved at compile time
fn ArrayList(comptime T: type) type {
    return struct {
        items: []T,
        capacity: usize,
        allocator: std.mem.Allocator,

        const Self = @This();

        pub fn init(allocator: std.mem.Allocator) Self {
            return .{ .items = &.{}, .capacity = 0, .allocator = allocator };
        }

        pub fn append(self: *Self, item: T) !void {
            if (self.items.len >= self.capacity) {
                try self.grow();
            }
            self.items.len += 1;
            self.items[self.items.len - 1] = item;
        }

        fn grow(self: *Self) !void {
            const new_cap = if (self.capacity == 0) 8 else self.capacity * 2;
            self.items = try self.allocator.realloc(self.items, new_cap);
            self.capacity = new_cap;
        }
    };
}

// Compile-time string formatting for embedded/no-alloc contexts
fn comptimeConcat(comptime a: []const u8, comptime b: []const u8) *const [a.len + b.len]u8 {
    comptime {
        var result: [a.len + b.len]u8 = undefined;
        @memcpy(result[0..a.len], a);
        @memcpy(result[a.len..], b);
        return &result;
    }
}

// This is evaluated entirely at compile time — zero runtime cost
const greeting = comptimeConcat("Hello, ", "Zig!");
// greeting is a compile-time constant: "Hello, Zig!"
```

### HTTP Server

```zig
// src/server.zig — HTTP server with std.http
const std = @import("std");
const http = std.http;

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var server = try std.net.Server.init(.{
        .address = try std.net.Address.parseIp("0.0.0.0", 8080),
        .reuse_address = true,
    });
    defer server.deinit();

    std.log.info("Server listening on :8080", .{});

    while (true) {
        const connection = try server.accept();
        // Handle each connection (in production, use a thread pool)
        handleConnection(allocator, connection) catch |err| {
            std.log.err("Connection error: {}", .{err});
        };
    }
}

fn handleConnection(allocator: std.mem.Allocator, connection: std.net.Server.Connection) !void {
    defer connection.stream.close();

    var buf: [8192]u8 = undefined;
    var server = http.Server.init(connection, &buf);

    var request = try server.receiveHead();
    const path = request.head.target;

    if (std.mem.eql(u8, path, "/api/health")) {
        try request.respond(
            "{\"status\":\"ok\"}",
            .{ .extra_headers = &.{.{ .name = "content-type", .value = "application/json" }} },
        );
    } else {
        try request.respond("Not Found", .{ .status = .not_found });
    }
}
```

### C Interop (Zero Overhead)

```zig
// c_interop.zig — Call C libraries directly, no bindings generator needed
const c = @cImport({
    @cInclude("sqlite3.h");    // Include any C header
});

const Database = struct {
    db: *c.sqlite3,

    pub fn open(path: [*:0]const u8) !Database {
        var db: ?*c.sqlite3 = null;
        const rc = c.sqlite3_open(path, &db);
        if (rc != c.SQLITE_OK) return error.DatabaseOpenFailed;
        return .{ .db = db.? };
    }

    pub fn close(self: *Database) void {
        _ = c.sqlite3_close(self.db);
    }

    pub fn exec(self: *Database, sql: [*:0]const u8) !void {
        var err_msg: ?[*:0]u8 = null;
        const rc = c.sqlite3_exec(self.db, sql, null, null, &err_msg);
        if (rc != c.SQLITE_OK) {
            if (err_msg) |msg| c.sqlite3_free(msg);
            return error.QueryFailed;
        }
    }
};
```

## Installation

```bash
# macOS
brew install zig

# Linux (snap)
snap install zig --classic

# Or download binary from https://ziglang.org/download/

# Build from source
git clone https://github.com/ziglang/zig
cd zig && cmake -B build && cmake --build build
```


## Examples

### Example 1

**User request:** "Help me set up Zig"

The agent follows the instructions above to configure Zig with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Zig configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Explicit allocators** — Every function that allocates takes an `Allocator` parameter; this gives you control over where memory comes from
2. **Arena allocators for requests** — Use `ArenaAllocator` for request-scoped work; free everything at once with `deinit()`
3. **`defer` for cleanup** — Always `defer` resource cleanup immediately after acquisition; prevents leaks and use-after-free
4. **Comptime over runtime** — If something can be computed at compile time, it should be; use `comptime` parameters for zero-cost generics
5. **Error unions for safety** — Use `!` (error union) return types; the compiler forces you to handle or propagate every error
6. **C interop for ecosystems** — Use `@cImport` to call any C library directly; no FFI overhead, no bindings generator needed
7. **Cross-compilation built-in** — Zig can cross-compile to 40+ targets with no extra toolchains; one binary, any platform
8. **No hidden control flow** — No exceptions, no operator overloading, no hidden allocations; every function call is visible in the code
