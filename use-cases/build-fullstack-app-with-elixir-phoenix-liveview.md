---
title: Build a Real-Time Dashboard with Elixir Phoenix LiveView
slug: build-fullstack-app-with-elixir-phoenix-liveview
description: Build a real-time metrics dashboard with Elixir Phoenix LiveView — server-rendered reactive UI, Phoenix PubSub for live pushes, and a supervised GenServer collecting the numbers — with no JavaScript framework and no chart library.
skills: [elixir]
category: development
tags: [elixir, phoenix, liveview, real-time, websocket, dashboard]
---

# Build a Real-Time Dashboard with Elixir Phoenix LiveView

## The Problem

Mika's team needs an internal dashboard showing live metrics: orders per minute, revenue today, and how the server itself is doing. The current version is a React app talking to a separate WebSocket server. That means three deployables, a JavaScript build pipeline, and a WebSocket server that drops connections when traffic spikes.

## The Solution

Phoenix LiveView renders the page on the server and pushes only the changed parts of the HTML over one WebSocket per viewer. A GenServer owns the metrics and broadcasts a snapshot through `Phoenix.PubSub`; each open dashboard is a LiveView process subscribed to that topic. One Elixir project replaces the API server, the WebSocket server and the React app. The charts here are server-rendered SVG, so there is nothing to bundle.

## Step-by-Step Walkthrough

### 1. Create the project

You need Elixir 1.17 or newer on a current Erlang/OTP. Phoenix 1.8 ships with LiveView 1.x.

```bash
mix archive.install hex phx_new
mix phx.new dashboard    # PostgreSQL + Ecto by default; add --database sqlite3 to avoid Postgres
cd dashboard
mix setup                # creates the database, so PostgreSQL must be running (not needed with sqlite3 or --no-ecto)
```

The code below uses `Decimal`, which comes with Ecto, so it is already a dependency with the default flags. If you generate with `--no-ecto`, add `{:decimal, "~> 2.0"}` to `deps` in `mix.exs`.

### 2. A supervised process that owns the metrics

`Dashboard.Metrics` samples BEAM memory and scheduler run queue every second, counts the orders of the last minute, and broadcasts a snapshot on every change. Other code reports an order with `Dashboard.Metrics.record_order/1`, for example from your checkout controller.

```elixir
# lib/dashboard/metrics.ex
defmodule Dashboard.Metrics do
  @moduledoc "Keeps live metrics in memory and broadcasts a snapshot every second."
  use GenServer

  @topic "metrics:realtime"
  @history 900 # samples kept, one per second

  def topic, do: @topic
  def start_link(_opts), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @doc "Current snapshot (used by LiveView on mount)."
  def snapshot, do: GenServer.call(__MODULE__, :snapshot)

  @doc "Call this from checkout code whenever an order is placed."
  def record_order(%Decimal{} = total), do: GenServer.cast(__MODULE__, {:order, total})

  @impl true
  def init(_) do
    :timer.send_interval(1_000, :tick)
    {:ok, %{orders: [], revenue: Decimal.new(0), history: []}}
  end

  @impl true
  def handle_cast({:order, total}, state) do
    now = System.monotonic_time(:second)
    state = %{state | orders: [now | state.orders], revenue: Decimal.add(state.revenue, total)}
    broadcast(state)
    {:noreply, state}
  end

  @impl true
  def handle_call(:snapshot, _from, state), do: {:reply, build(state), state}

  @impl true
  def handle_info(:tick, state) do
    now = System.monotonic_time(:second)
    orders = Enum.filter(state.orders, &(&1 > now - 60))
    sample = %{memory_mb: div(:erlang.memory(:total), 1_048_576), run_queue: :erlang.statistics(:total_run_queue_lengths)}
    state = %{state | orders: orders, history: Enum.take([sample | state.history], @history)}
    broadcast(state)
    {:noreply, state}
  end

  defp broadcast(state), do: Phoenix.PubSub.broadcast(Dashboard.PubSub, @topic, {:metrics, build(state)})

  defp build(state) do
    %{
      orders_per_minute: length(state.orders),
      revenue: state.revenue,
      processes: :erlang.system_info(:process_count),
      history: Enum.reverse(state.history)
    }
  end
end
```

Add it to the supervision tree in `lib/dashboard/application.ex`, before the endpoint:

```elixir
children = [
  DashboardWeb.Telemetry,
  {Phoenix.PubSub, name: Dashboard.PubSub},
  Dashboard.Metrics,
  DashboardWeb.Endpoint
]
```

If the process crashes, its supervisor restarts it and the open dashboards keep receiving snapshots from the new one.

### 3. The LiveView

The LiveView subscribes to the topic only once the WebSocket is connected (`connected?/1`), so the first, static HTML render does not subscribe. Updates arrive as `handle_info/2` messages; there is no polling timer. The time-range buttons are a `phx-click` event handled on the server. In Phoenix 1.8, LiveView templates wrap their content in `<Layouts.app flash={@flash}>`.

```elixir
# lib/dashboard_web/live/metrics_live.ex
defmodule DashboardWeb.MetricsLive do
  use DashboardWeb, :live_view

  @ranges ~w(1m 5m 15m)
  @seconds %{"1m" => 60, "5m" => 300, "15m" => 900}

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket), do: Phoenix.PubSub.subscribe(Dashboard.PubSub, Dashboard.Metrics.topic())

    {:ok,
     socket
     |> assign(page_title: "Dashboard", range: "5m", ranges: @ranges)
     |> assign_metrics(Dashboard.Metrics.snapshot())}
  end

  @impl true
  def handle_info({:metrics, snapshot}, socket), do: {:noreply, assign_metrics(socket, snapshot)}

  @impl true
  def handle_event("set_range", %{"range" => range}, socket) when range in @ranges do
    {:noreply, socket |> assign(range: range) |> assign_metrics(socket.assigns.snapshot)}
  end

  defp assign_metrics(socket, snapshot) do
    points = Enum.take(snapshot.history, -Map.fetch!(@seconds, socket.assigns.range))
    assign(socket, snapshot: snapshot, points: points)
  end

  # Server-side SVG polyline: no chart library or JS hook needed.
  defp polyline(points, key) do
    values = Enum.map(points, &Map.fetch!(&1, key))
    max = max(Enum.max(values, fn -> 1 end), 1)
    step = 300 / max(length(values) - 1, 1)

    values
    |> Enum.with_index()
    |> Enum.map_join(" ", fn {v, i} -> "#{Float.round(i * step, 1)},#{Float.round(60 - v / max * 58, 1)}" end)
  end

  attr :title, :string, required: true
  attr :value, :any, required: true

  defp metric_card(assigns) do
    ~H"""
    <div class="rounded-lg border p-4">
      <p class="text-sm text-gray-500">{@title}</p>
      <p class="text-2xl font-semibold">{@value}</p>
    </div>
    """
  end

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <div class="grid grid-cols-3 gap-4 mb-8">
        <.metric_card title="Orders / min" value={@snapshot.orders_per_minute} />
        <.metric_card title="Revenue today" value={"$" <> Decimal.to_string(Decimal.round(@snapshot.revenue, 2))} />
        <.metric_card title="BEAM processes" value={@snapshot.processes} />
      </div>

      <div class="flex gap-2 mb-2">
        <button :for={r <- @ranges} phx-click="set_range" phx-value-range={r}
          class={["px-3 py-1 rounded", r == @range && "bg-blue-500 text-white", r != @range && "bg-gray-100"]}>
          {r}
        </button>
      </div>

      <h2 class="font-semibold">Memory (MB)</h2>
      <svg id="memory-chart" viewBox="0 0 300 60" class="w-full h-24 border rounded">
        <polyline fill="none" stroke="currentColor" stroke-width="1" points={polyline(@points, :memory_mb)} />
      </svg>
      <h2 class="font-semibold mt-4">Scheduler run queue</h2>
      <svg id="runq-chart" viewBox="0 0 300 60" class="w-full h-24 border rounded">
        <polyline fill="none" stroke="currentColor" stroke-width="1" points={polyline(@points, :run_queue)} />
      </svg>
    </Layouts.app>
    """
  end
end
```

Route it in `lib/dashboard_web/router.ex` in place of the generated page route:

```elixir
scope "/", DashboardWeb do
  pipe_through :browser
  live "/", MetricsLive
end
```

### 4. Test it without a browser

`Phoenix.LiveViewTest` mounts the view, lets you push an order through the real process, and asserts on the rendered HTML. (If you replaced the generated page route, delete the generated `test/dashboard_web/controllers/page_controller_test.exs`.)

```elixir
# test/dashboard_web/live/metrics_live_test.exs
defmodule DashboardWeb.MetricsLiveTest do
  use DashboardWeb.ConnCase
  import Phoenix.LiveViewTest

  test "pushes a new order to the page without polling", %{conn: conn} do
    {:ok, view, html} = live(conn, "/")
    assert html =~ "Orders / min"

    Dashboard.Metrics.record_order(Decimal.new("19.90"))
    _ = Dashboard.Metrics.snapshot()  # wait until the cast was handled
    _ = :sys.get_state(view.pid)      # and the broadcast reached the view
    assert render(view) =~ "$19.90"

    assert view |> element("button", "15m") |> render_click() =~ "memory-chart"
  end
end
```

```bash
mix test
mix phx.server    # http://localhost:4000
```

The generated `config/dev.exs` binds the dev server to loopback (`http: [ip: {127, 0, 0, 1}]`), so it is reachable only from your machine. Keep it that way unless you run inside a container that needs to publish the port.

Before exposing the dashboard beyond your machine, put it behind authentication (`mix phx.gen.auth` generates it), because it shows revenue.

## Real-World Example

Mika's team wires `Dashboard.Metrics.record_order/1` into the checkout flow and opens the dashboard on the office screen. Every order shows up in the revenue tile as it is placed, with no refresh and no client-side state to keep in sync. Swapping the BEAM samples for real application metrics (error rate from `:telemetry` events, queue depth from the job runner) only changes the `:tick` handler and `build/1` in `Dashboard.Metrics`; the LiveView and the PubSub wiring stay the same. For history that survives a restart, store the samples with Ecto and load them in `init/1`.

Before putting it in front of many viewers, load-test your own deployment: connection count and memory per connection depend on what each LiveView assigns, so measure rather than assume.

## Related Skills

- [elixir](../skills/elixir/SKILL.md) — Elixir, Phoenix and LiveView project setup, GenServers, supervision and Ecto
