---
name: phoenix
description: |
  Phoenix is an Elixir web framework built on the BEAM VM for fault-tolerant, real-time
  applications. It features LiveView for interactive UIs without JavaScript, channels
  for WebSockets, and Ecto for database access with compile-time query validation.
license: Apache-2.0
compatibility:
  - elixir >= 1.14
  - erlang >= 25
  - mix
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - elixir
    - web
    - realtime
    - liveview
    - websocket
    - functional
---

# Phoenix

Phoenix leverages the Erlang VM (BEAM) for massive concurrency and fault tolerance. LiveView enables rich, real-time UIs with server-rendered HTML — no JavaScript framework needed.

## Installation

```bash
# Install Phoenix and create project
mix archive.install hex phx_new
mix phx.new my_app --database postgres
cd my_app
mix setup   # deps.get + ecto.create + assets
```

## Project Structure

```
# Phoenix project layout
lib/my_app/
├── application.ex          # OTP supervision tree
├── repo.ex                 # Ecto repo
├── accounts/               # Context module
│   ├── user.ex             # Ecto schema
│   └── accounts.ex         # Business logic
lib/my_app_web/
├── endpoint.ex             # HTTP entry point
├── router.ex               # Routes
├── controllers/            # REST controllers
├── live/                   # LiveView modules
├── components/             # Function components
└── templates/              # HEEx templates
```

## Ecto Schema and Migration

```elixir
# lib/my_app/articles/article.ex — Ecto schema
defmodule MyApp.Articles.Article do
  use Ecto.Schema
  import Ecto.Changeset

  schema "articles" do
    field :title, :string
    field :slug, :string
    field :body, :string
    field :published, :boolean, default: false
    belongs_to :author, MyApp.Accounts.User
    timestamps()
  end

  def changeset(article, attrs) do
    article
    |> cast(attrs, [:title, :body, :published])
    |> validate_required([:title, :body])
    |> validate_length(:title, max: 200)
    |> unique_constraint(:slug)
    |> generate_slug()
  end

  defp generate_slug(changeset) do
    case get_change(changeset, :title) do
      nil -> changeset
      title -> put_change(changeset, :slug, Slug.slugify(title))
    end
  end
end
```

```elixir
# priv/repo/migrations/20240101000000_create_articles.exs — migration
defmodule MyApp.Repo.Migrations.CreateArticles do
  use Ecto.Migration

  def change do
    create table(:articles) do
      add :title, :string, null: false, size: 200
      add :slug, :string, null: false
      add :body, :text, null: false
      add :published, :boolean, default: false
      add :author_id, references(:users, on_delete: :delete_all), null: false
      timestamps()
    end

    create unique_index(:articles, [:slug])
  end
end
```

## Context Module

```elixir
# lib/my_app/articles/articles.ex — business logic context
defmodule MyApp.Articles do
  import Ecto.Query
  alias MyApp.Repo
  alias MyApp.Articles.Article

  def list_published do
    Article
    |> where(published: true)
    |> order_by(desc: :inserted_at)
    |> preload(:author)
    |> Repo.all()
  end

  def get_article!(id), do: Repo.get!(Article, id) |> Repo.preload(:author)

  def create_article(attrs) do
    %Article{}
    |> Article.changeset(attrs)
    |> Repo.insert()
  end

  def update_article(%Article{} = article, attrs) do
    article
    |> Article.changeset(attrs)
    |> Repo.update()
  end
end
```

## Router

```elixir
# lib/my_app_web/router.ex — routing
defmodule MyAppWeb.Router do
  use MyAppWeb, :router

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, html: {MyAppWeb.Layouts, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
  end

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/", MyAppWeb do
    pipe_through :browser
    live "/articles", ArticleLive.Index, :index
    live "/articles/:slug", ArticleLive.Show, :show
  end

  scope "/api", MyAppWeb.API do
    pipe_through :api
    resources "/articles", ArticleController, only: [:index, :show, :create]
  end
end
```

## LiveView

```elixir
# lib/my_app_web/live/article_live/index.ex — LiveView for article list
defmodule MyAppWeb.ArticleLive.Index do
  use MyAppWeb, :live_view

  alias MyApp.Articles

  @impl true
  def mount(_params, _session, socket) do
    articles = Articles.list_published()
    {:ok, assign(socket, articles: articles, search: "")}
  end

  @impl true
  def handle_event("search", %{"query" => query}, socket) do
    articles = Articles.search(query)
    {:noreply, assign(socket, articles: articles, search: query)}
  end
end
```

```heex
<!-- lib/my_app_web/live/article_live/index.html.heex — LiveView template -->
<div>
  <h1>Articles</h1>
  <form phx-change="search" phx-debounce="300">
    <input type="text" name="query" value={@search} placeholder="Search..." />
  </form>
  <div :for={article <- @articles}>
    <h2><.link navigate={~p"/articles/#{article.slug}"}><%= article.title %></.link></h2>
    <p>By <%= article.author.name %></p>
  </div>
</div>
```

## JSON Controller

```elixir
# lib/my_app_web/controllers/api/article_controller.ex — API controller
defmodule MyAppWeb.API.ArticleController do
  use MyAppWeb, :controller
  alias MyApp.Articles

  def index(conn, _params) do
    articles = Articles.list_published()
    json(conn, %{data: Enum.map(articles, &article_json/1)})
  end

  def create(conn, %{"article" => params}) do
    case Articles.create_article(params) do
      {:ok, article} -> conn |> put_status(:created) |> json(%{data: article_json(article)})
      {:error, changeset} -> conn |> put_status(422) |> json(%{errors: format_errors(changeset)})
    end
  end

  defp article_json(a), do: %{id: a.id, title: a.title, slug: a.slug}
end
```

## Channels (Real-time)

```elixir
# lib/my_app_web/channels/room_channel.ex — WebSocket channel
defmodule MyAppWeb.RoomChannel do
  use MyAppWeb, :channel

  def join("room:" <> room_id, _params, socket) do
    {:ok, assign(socket, :room_id, room_id)}
  end

  def handle_in("message", %{"body" => body}, socket) do
    broadcast!(socket, "message", %{body: body, user: socket.assigns.user_id})
    {:noreply, socket}
  end
end
```

## Testing

```elixir
# test/my_app/articles_test.exs — context test
defmodule MyApp.ArticlesTest do
  use MyApp.DataCase
  alias MyApp.Articles

  test "create_article/1 with valid data" do
    attrs = %{title: "Test", body: "Content", author_id: user_fixture().id}
    assert {:ok, article} = Articles.create_article(attrs)
    assert article.title == "Test"
  end
end
```

## Key Commands

```bash
# Common Mix commands
mix phx.gen.live Articles Article articles title:string body:text
mix ecto.migrate
mix phx.routes          # Show all routes
mix test
mix phx.server          # Start dev server
iex -S mix phx.server   # Start with REPL
```

## Key Patterns

- Organize business logic in Context modules — controllers/LiveViews delegate to contexts
- Use changesets for all data validation — they compose and return descriptive errors
- Use `preload` explicitly — Ecto never lazy-loads to prevent N+1
- LiveView `handle_event` replaces most JavaScript interactivity
- Use PubSub (`Phoenix.PubSub.broadcast`) for real-time updates across LiveView processes
- Use `Ecto.Multi` for transactions spanning multiple operations
