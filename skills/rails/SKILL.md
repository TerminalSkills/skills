---
name: rails
description: |
  Ruby on Rails is a full-stack web framework following convention over configuration.
  It provides ActiveRecord ORM, Action Controller, Action View templates, Action Cable
  for WebSockets, and generators for rapid application development.
license: Apache-2.0
compatibility:
  - ruby >= 3.1
  - bundler
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frameworks
  tags:
    - ruby
    - web
    - fullstack
    - mvc
    - orm
    - websocket
---

# Ruby on Rails

Rails is an opinionated full-stack framework that favors convention over configuration. It includes everything needed to build database-backed web apps: ORM, routing, views, mailers, jobs, and WebSocket support.

## Installation

```bash
# Create new Rails app with PostgreSQL
gem install rails
rails new myapp --database=postgresql --css=tailwind
cd myapp
rails db:create
```

## Project Structure

```
# Standard Rails project layout
app/
├── controllers/          # Request handlers
├── models/               # ActiveRecord models
├── views/                # ERB/HTML templates
├── channels/             # Action Cable channels
├── jobs/                 # Background jobs
├── mailers/              # Email classes
└── serializers/          # API serializers
config/
├── routes.rb             # URL routing
├── database.yml          # DB config
└── environments/         # Per-env settings
db/
├── migrate/              # Schema migrations
├── schema.rb             # Current schema
└── seeds.rb              # Seed data
```

## Models

```ruby
# app/models/article.rb — ActiveRecord model
class Article < ApplicationRecord
  belongs_to :author, class_name: "User"
  has_many :comments, dependent: :destroy

  validates :title, presence: true, length: { maximum: 200 }
  validates :slug, presence: true, uniqueness: true
  validates :body, presence: true

  scope :published, -> { where(published: true) }
  scope :recent, -> { order(created_at: :desc) }

  before_validation :generate_slug, on: :create

  private

  def generate_slug
    self.slug = title&.parameterize
  end
end
```

## Migrations

```ruby
# db/migrate/20240101000000_create_articles.rb — database migration
class CreateArticles < ActiveRecord::Migration[7.1]
  def change
    create_table :articles do |t|
      t.string :title, null: false, limit: 200
      t.string :slug, null: false, index: { unique: true }
      t.text :body, null: false
      t.references :author, null: false, foreign_key: { to_table: :users }
      t.boolean :published, default: false
      t.timestamps
    end
  end
end
```

## Controllers

```ruby
# app/controllers/articles_controller.rb — RESTful controller
class ArticlesController < ApplicationController
  before_action :authenticate_user!, except: [:index, :show]
  before_action :set_article, only: [:show, :update, :destroy]

  def index
    @articles = Article.published.recent
      .includes(:author)
      .page(params[:page])
      .per(20)
    render json: @articles, include: [:author]
  end

  def show
    render json: @article
  end

  def create
    @article = current_user.articles.build(article_params)
    if @article.save
      render json: @article, status: :created
    else
      render json: { errors: @article.errors }, status: :unprocessable_entity
    end
  end

  def destroy
    @article.destroy
    head :no_content
  end

  private

  def set_article
    @article = Article.find(params[:id])
  end

  def article_params
    params.require(:article).permit(:title, :body)
  end
end
```

## Routes

```ruby
# config/routes.rb — URL routing
Rails.application.routes.draw do
  root "pages#home"

  resources :articles, only: [:index, :show, :create, :update, :destroy]

  namespace :api do
    namespace :v1 do
      resources :articles, only: [:index, :show]
    end
  end

  mount ActionCable.server => "/cable"
end
```

## Views

```erb
<!-- app/views/articles/index.html.erb — list view template -->
<h1>Articles</h1>
<% @articles.each do |article| %>
  <article>
    <h2><%= link_to article.title, article_path(article) %></h2>
    <p>By <%= article.author.name %> — <%= time_ago_in_words(article.created_at) %> ago</p>
    <p><%= truncate(article.body, length: 200) %></p>
  </article>
<% end %>
<%= paginate @articles %>
```

## Action Cable (WebSockets)

```ruby
# app/channels/chat_channel.rb — WebSocket channel
class ChatChannel < ApplicationCable::Channel
  def subscribed
    stream_from "chat_#{params[:room_id]}"
  end

  def receive(data)
    ActionCable.server.broadcast("chat_#{params[:room_id]}", {
      user: current_user.name,
      message: data["message"]
    })
  end
end
```

## Background Jobs

```ruby
# app/jobs/send_notification_job.rb — Active Job
class SendNotificationJob < ApplicationJob
  queue_as :default
  retry_on StandardError, wait: :polynomially_longer, attempts: 5

  def perform(user, message)
    NotificationService.send(user, message)
  end
end

# Enqueue: SendNotificationJob.perform_later(user, "Hello!")
```

## Testing

```ruby
# test/models/article_test.rb — model test
require "test_helper"

class ArticleTest < ActiveSupport::TestCase
  test "validates title presence" do
    article = Article.new(body: "content", author: users(:one))
    assert_not article.valid?
    assert_includes article.errors[:title], "can't be blank"
  end

  test "published scope" do
    assert_includes Article.published, articles(:published_one)
    assert_not_includes Article.published, articles(:draft_one)
  end
end
```

## Key Commands

```bash
# Common Rails commands
rails generate model Article title:string body:text author:references
rails generate controller Articles index show create
rails db:migrate
rails db:seed
rails console           # Interactive REPL
rails routes            # Show all routes
rails test              # Run tests
```

## Key Patterns

- Use `strong_parameters` (`params.permit`) to whitelist input — never trust user data
- Use `includes`/`eager_load` to prevent N+1 queries
- Use scopes for reusable query logic on models
- Use `before_action` for authentication and resource loading
- Use Active Job + Sidekiq/GoodJob for background processing
- Use `rails credentials:edit` for secrets — never commit them
