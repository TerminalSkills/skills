---
name: elixir
description: >-
  Elixir is a functional language on the Erlang VM (BEAM) for concurrent, fault-tolerant and
  distributed systems. Use when someone asks to "write Elixir", "build a Phoenix app",
  "Phoenix LiveView", "GenServer", "supervision tree", "Ecto schema or changeset", "mix project",
  or needs lightweight processes, "let it crash" reliability and real-time web UIs.
license: Apache-2.0
compatibility: "Elixir 1.17+ (current 1.20) on Erlang/OTP 27+; Phoenix 1.8 needs Elixir 1.17+ and PostgreSQL by default"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: "https://github.com/elixir-lang/elixir"
  tags:
    - elixir
    - erlang
    - beam
    - phoenix
    - concurrency
---

# Elixir — Functional Language for Scalable Applications

## Overview

Elixir runs on the BEAM virtual machine, where millions of cheap isolated processes talk by message passing and are restarted by supervisors when they crash. Typical stack: Phoenix (web framework, current 1.8), LiveView (server-rendered real-time UI), Ecto (database layer), Phoenix.PubSub (events across nodes), `:telemetry` (metrics). Build tool is `mix`; packages come from Hex.

## Instructions

### Install and create a project

```bash
brew install elixir                        # macOS; Ubuntu/Fedora/Arch/Windows options: elixir-lang.org/install
elixir -v                                  # check Elixir and OTP versions

mix new rate_limiter --sup                 # plain OTP app with a supervision tree
mix test                                   # run ExUnit tests

mix archive.install hex phx_new            # Phoenix project generator
mix phx.new shop_app                       # add --database sqlite3 to skip PostgreSQL
cd shop_app && mix setup                   # deps.get, ecto.create, ecto.migrate, assets
mix phx.server                             # http://localhost:4000
```

On Linux install `inotify-tools` so Phoenix live reload works. `mix help phx.new` lists generator options; `mix phx.gen.auth` generates authentication.

### Language basics

```elixir
# Pattern matching
{:ok, user} = fetch_user(id)
%{name: name, email: email} = user

# Pipeline operator (chain transformations)
result =
  data
  |> Enum.filter(&(&1.active))
  |> Enum.map(&transform/1)
  |> Enum.sort_by(& &1.score, :desc)
  |> Enum.take(10)

# Modules and functions
defmodule MyApp.Accounts do
  def create_user(attrs) do
    %User{}
    |> User.changeset(attrs)
    |> Repo.insert()
  end

  def authenticate(email, password) do
    with {:ok, user} <- get_user_by_email(email),
         true <- Bcrypt.verify_pass(password, user.password_hash) do
      {:ok, user}
    else
      _ -> {:error, :invalid_credentials}
    end
  end
end
```

### GenServer (stateful processes)

```elixir
defmodule MyApp.RateLimiter do
  use GenServer

  # Client API
  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def check_rate(user_id, limit \\ 100) do
    GenServer.call(__MODULE__, {:check, user_id, limit})
  end

  # Server callbacks
  @impl true
  def init(_opts) do
    schedule_cleanup()
    {:ok, %{}}                            # Initial state: empty map
  end

  @impl true
  def handle_call({:check, user_id, limit}, _from, state) do
    now = System.monotonic_time(:second)
    requests = Map.get(state, user_id, [])
    recent = Enum.filter(requests, &(&1 > now - 60))

    if length(recent) < limit do
      {:reply, :ok, Map.put(state, user_id, [now | recent])}
    else
      {:reply, {:error, :rate_limited}, state}
    end
  end

  @impl true
  def handle_info(:cleanup, state) do
    now = System.monotonic_time(:second)
    cleaned = Map.new(state, fn {k, v} ->
      {k, Enum.filter(v, &(&1 > now - 60))}
    end)
    schedule_cleanup()
    {:noreply, cleaned}
  end

  defp schedule_cleanup, do: Process.send_after(self(), :cleanup, 60_000)
end
```

### Phoenix LiveView (real-time UI)

```elixir
defmodule MyAppWeb.DashboardLive do
  use MyAppWeb, :live_view

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(MyApp.PubSub, "metrics")
      :timer.send_interval(5000, :tick)
    end

    {:ok, assign(socket,
      users_online: 0,
      orders_today: 0,
      revenue: Decimal.new(0)
    )}
  end

  @impl true
  def handle_info(:tick, socket) do
    {:noreply, assign(socket,
      users_online: MyApp.Presence.count(),
      orders_today: MyApp.Orders.count_today(),
      revenue: MyApp.Orders.revenue_today()
    )}
  end

  @impl true
  def handle_info({:new_order, order}, socket) do
    {:noreply, update(socket, :orders_today, &(&1 + 1))
    |> update(:revenue, &Decimal.add(&1, order.total))}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="grid grid-cols-3 gap-4">
      <.stat_card title="Users Online" value={@users_online} />
      <.stat_card title="Orders Today" value={@orders_today} />
      <.stat_card title="Revenue" value={"$#{@revenue}"} />
    </div>
    """
  end
end
```

### Supervision trees

```elixir
defmodule MyApp.Application do
  use Application

  def start(_type, _args) do
    children = [
      MyApp.Repo,                         # Database (auto-restarts on crash)
      {Phoenix.PubSub, name: MyApp.PubSub},
      MyApp.RateLimiter,                  # Custom GenServer
      MyAppWeb.Endpoint,                  # Web server
      {Task.Supervisor, name: MyApp.TaskSupervisor},
    ]

    opts = [strategy: :one_for_one, name: MyApp.Supervisor]
    Supervisor.start_link(children, opts)
    # If any child crashes, only that child restarts (one_for_one)
  end
end
```

## Examples

### Example 1: Add a rate limiter that survives crashes

Request: "Limit each user to 100 API calls a minute, and don't lose the service if it crashes."

Create `lib/shop_app/rate_limiter.ex` with the GenServer above, add `ShopApp.RateLimiter` to the supervisor's `children`, then call `ShopApp.RateLimiter.check_rate(user.id)` in a plug. Result: `:ok` for the first 100 calls in a window, `{:error, :rate_limited}` after; if the process dies the supervisor restarts it with empty state.

### Example 2: Live dashboard without JavaScript

Request: "Show orders today and revenue on an admin page that updates itself."

```bash
mix phx.gen.live Orders Order orders total:decimal status:string   # context, schema, LiveViews, migration
mix ecto.migrate
```

Add the `DashboardLive` module above to `router.ex` inside a `live_session`, broadcast `{:new_order, order}` with `Phoenix.PubSub.broadcast(ShopApp.PubSub, "metrics", {:new_order, order})` after each insert. The page updates over the WebSocket for every open browser.

## Guidelines

- **Let it crash**: do not wrap everything in try/rescue; put state in supervised processes and pick the strategy deliberately (`:one_for_one` restarts only the failed child).
- **Pattern match** on function heads and `{:ok, _}` / `{:error, _}` tuples instead of if/else chains; use `with` for chains of fallible steps.
- **Do not hold all state in one GenServer**: a single process serializes every call. Use ETS, Registry or a process per entity when throughput matters; `GenServer.call` times out after 5 s by default.
- **Ecto changesets** validate and cast all external input; never pass raw params to `Repo.insert`.
- **LiveView**: subscribe and start timers only inside `if connected?(socket)`; keep assigns small, use streams (`stream/3`) for long lists.
- **Never** create atoms from user input (`String.to_atom/1`); atoms are not garbage collected.
- **Observability**: attach to `:telemetry` events (Ecto and Phoenix emit them); Phoenix ships a `LiveDashboard` for dev.
- CPU-heavy numeric work is not the BEAM's strength; use Nx or a NIF/port for it.
