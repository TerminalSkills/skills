---
title: Build a Real-Time Dashboard with Elixir Phoenix LiveView
slug: build-fullstack-app-with-elixir-phoenix-liveview
description: Build a real-time analytics dashboard using Elixir Phoenix LiveView for server-rendered reactive UI, Ecto for database access, and Phoenix PubSub for live updates — handling 10,000 concurrent WebSocket connections on a single server with no JavaScript framework.
skills: [elixir]
category: development
tags: [elixir, phoenix, liveview, real-time, websocket, dashboard]
---

# Build a Real-Time Dashboard with Elixir Phoenix LiveView

Mika's team needs an internal analytics dashboard showing live metrics: active users, orders per minute, error rates, and server health. The current React + WebSocket solution requires a separate API server, WebSocket server, and React build pipeline. When traffic spikes, the WebSocket server drops connections at 2,000 concurrent users.

Mika rebuilds it with Phoenix LiveView — the entire real-time UI runs as server-rendered HTML pushed over WebSocket, no JavaScript framework needed. Thanks to Elixir's BEAM VM, a single server handles 10,000+ concurrent WebSocket connections.

## The Implementation

```elixir
# lib/dashboard_web/live/metrics_live.ex
defmodule DashboardWeb.MetricsLive do
  use DashboardWeb, :live_view
  alias Dashboard.Metrics

  @refresh_interval 2_000                  # 2 seconds

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(Dashboard.PubSub, "metrics:realtime")
      :timer.send_interval(@refresh_interval, :refresh)
    end

    {:ok, assign(socket,
      active_users: Metrics.active_users_count(),
      orders_per_minute: Metrics.orders_per_minute(),
      error_rate: Metrics.error_rate_percent(),
      revenue_today: Metrics.revenue_today(),
      top_endpoints: Metrics.top_endpoints(10),
      server_health: Metrics.server_health(),
      chart_data: Metrics.last_hour_timeseries(),
      page_title: "Dashboard"
    )}
  end

  @impl true
  def handle_info(:refresh, socket) do
    {:noreply, assign(socket,
      active_users: Metrics.active_users_count(),
      orders_per_minute: Metrics.orders_per_minute(),
      error_rate: Metrics.error_rate_percent(),
      revenue_today: Metrics.revenue_today(),
      chart_data: Metrics.last_hour_timeseries()
    )}
  end

  @impl true
  def handle_info({:new_order, order}, socket) do
    {:noreply, socket
    |> update(:orders_per_minute, &(&1 + 1))
    |> update(:revenue_today, &Decimal.add(&1, order.total))
    |> push_event("flash-metric", %{id: "revenue"})}
  end

  @impl true
  def handle_info({:error_spike, rate}, socket) do
    {:noreply, socket
    |> assign(:error_rate, rate)
    |> put_flash(:error, "Error rate spike: #{rate}%")}
  end

  @impl true
  def handle_event("set_timerange", %{"range" => range}, socket) do
    chart_data = case range do
      "1h" -> Metrics.last_hour_timeseries()
      "24h" -> Metrics.last_day_timeseries()
      "7d" -> Metrics.last_week_timeseries()
    end
    {:noreply, assign(socket, chart_data: chart_data, time_range: range)}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="grid grid-cols-4 gap-4 mb-8">
      <.metric_card
        title="Active Users"
        value={@active_users}
        icon="users"
        trend={:up}
      />
      <.metric_card
        title="Orders/min"
        value={@orders_per_minute}
        icon="shopping-cart"
      />
      <.metric_card
        id="revenue"
        title="Revenue Today"
        value={"$#{Decimal.round(@revenue_today, 2)}"}
        icon="dollar-sign"
        trend={:up}
      />
      <.metric_card
        title="Error Rate"
        value={"#{@error_rate}%"}
        icon="alert-triangle"
        trend={if @error_rate > 1, do: :danger, else: :ok}
      />
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div class="col-span-2 bg-white rounded-lg p-6 shadow">
        <div class="flex justify-between mb-4">
          <h2 class="text-lg font-semibold">Traffic</h2>
          <div class="flex gap-2">
            <button :for={range <- ["1h", "24h", "7d"]}
              phx-click="set_timerange" phx-value-range={range}
              class={"px-3 py-1 rounded #{if @time_range == range, do: "bg-blue-500 text-white", else: "bg-gray-100"}"}>
              {range}
            </button>
          </div>
        </div>
        <div id="chart" phx-hook="Chart" data-points={Jason.encode!(@chart_data)} />
      </div>

      <div class="bg-white rounded-lg p-6 shadow">
        <h2 class="text-lg font-semibold mb-4">Top Endpoints</h2>
        <div :for={ep <- @top_endpoints} class="flex justify-between py-2 border-b">
          <span class="font-mono text-sm">{ep.path}</span>
          <span class="text-gray-500">{ep.rpm} rpm</span>
        </div>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-4 gap-4">
      <div :for={server <- @server_health}
        class={"p-4 rounded-lg #{if server.healthy, do: "bg-green-50", else: "bg-red-50"}"}>
        <p class="font-semibold">{server.name}</p>
        <p class="text-sm">CPU: {server.cpu}% | RAM: {server.memory}%</p>
        <p class="text-sm">Uptime: {server.uptime}</p>
      </div>
    </div>
    """
  end
end
```

```elixir
# lib/dashboard/metrics/collector.ex — Broadcast metrics via PubSub
defmodule Dashboard.Metrics.Collector do
  use GenServer

  def start_link(_) do
    GenServer.start_link(__MODULE__, nil, name: __MODULE__)
  end

  def init(_) do
    :timer.send_interval(1_000, :collect)
    {:ok, %{}}
  end

  def handle_info(:collect, state) do
    # Collect from various sources
    metrics = %{
      active_users: Dashboard.Presence.count_users(),
      orders_per_minute: query_orders_last_minute(),
      error_rate: query_error_rate(),
    }

    # Check for anomalies
    if metrics.error_rate > 5.0 do
      Phoenix.PubSub.broadcast(Dashboard.PubSub, "metrics:realtime",
        {:error_spike, metrics.error_rate})
    end

    {:noreply, state}
  end
end
```

## Results

The LiveView dashboard handles the entire team of 50 users watching live metrics simultaneously. During a Black Friday traffic spike, 200 internal users monitored the dashboard concurrently with zero dropped connections.

- **Concurrent connections**: 10,000+ WebSocket connections on a single 4-core server
- **Memory per connection**: ~40KB (vs ~2MB per WebSocket in Node.js)
- **Update latency**: <50ms server → browser for metric updates
- **JavaScript shipped**: 28KB (Phoenix LiveView client) vs 340KB (React + Chart.js + WebSocket client)
- **Codebase**: Single Elixir project replaces API server + WebSocket server + React app
- **Crash recovery**: When the metrics collector GenServer crashes, supervisor restarts it in <1ms; users never notice
