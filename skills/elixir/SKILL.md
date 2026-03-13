---
name: elixir
description: >-
  You are an expert in Elixir, the functional programming language built on
  the Erlang VM (BEAM). You help developers build highly concurrent,
  fault-tolerant, and distributed systems using Elixir's process model,
  pattern matching, GenServer, supervision trees, Phoenix web framework,
  LiveView for real-time UI, and Ecto for database interactions — achieving
  massive concurrency with lightweight processes and "let it crash"
  reliability.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - functional
    - erlang
    - beam
    - concurrent
    - fault-tolerant
    - phoenix
    - distributed
---

# Elixir — Functional Language for Scalable Applications

You are an expert in Elixir, the functional programming language built on the Erlang VM (BEAM). You help developers build highly concurrent, fault-tolerant, and distributed systems using Elixir's process model, pattern matching, GenServer, supervision trees, Phoenix web framework, LiveView for real-time UI, and Ecto for database interactions — achieving massive concurrency with lightweight processes and "let it crash" reliability.

## Core Capabilities

### Language Basics

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

### GenServer (Stateful Processes)

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

### Phoenix LiveView (Real-Time UI)

```elixir
defmodule MyAppWeb.DashboardLive do
  use MyAppWeb, :live_view

  @impl true
  def mount(_params, session, socket) do
    if connected?(socket) do
      MyApp.PubSub.subscribe("metrics")
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

### Supervision Trees

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

## Installation

```bash
# Install Elixir
brew install elixir                        # macOS
# Or: https://elixir-lang.org/install.html

# New Phoenix project
mix phx.new my_app
cd my_app && mix deps.get
mix ecto.create && mix phx.server
```

## Best Practices

1. **Let it crash** — Don't over-handle errors; use supervisors to restart failed processes automatically
2. **Pattern matching** — Match on function arguments and return values; avoid if/else chains
3. **Pipeline operator** — Chain transformations with `|>`; reads top-to-bottom like a data pipeline
4. **GenServer for state** — Use GenServer for in-memory state, rate limiters, caches; supervised and fault-tolerant
5. **LiveView over SPAs** — Use Phoenix LiveView for real-time UI; no JavaScript framework needed, server-rendered
6. **Ecto changesets** — Validate and cast data through changesets; never trust raw input
7. **PubSub for events** — Use Phoenix.PubSub for inter-process communication; scales across nodes
8. **Telemetry for observability** — Attach to `:telemetry` events for metrics; Ecto, Phoenix emit events automatically
