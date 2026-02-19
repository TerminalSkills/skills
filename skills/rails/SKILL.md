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

Rails is an opinionated full-stack framework that favors convention over configuration. It includes ORM, routing, views, mailers, jobs, and WebSocket support.

## Installation

```bash
# Create new Rails app with PostgreSQL
gem install rails
rails new myapp --database=postgresql --css=tailwind
cd myapp && rails db:create
```

## Models

```ruby
# app/models/article.rb — ActiveRecord model
class Article < ApplicationRecord
  belongs_to :author, class_name: "User"
  has_many :comments, dependent: :destroy

  validates :title, presence: true, length: { maximum: 200 }
  validates :slug, presence: true, uniqueness: true

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
    @articles = Article.published.recent.includes(:author).page(params[:page]).per(20)
    render json: @articles
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

  def set_article = @article = Article.find(params[:id])
  def article_params = params.require(:article).permit(:title, :body)
end
```

## Routes

```ruby
# config/routes.rb — URL routing
Rails.application.routes.draw do
  root "pages#home"
  resources :articles, only: [:index, :show, :create, :update, :destroy]
  mount ActionCable.server => "/cable"
end
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
      user: current_user.name, message: data["message"]
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
end
```

## Key Commands

```bash
# Common Rails commands
rails generate model Article title:string body:text author:references
rails db:migrate
rails console
rails routes
rails test
```

## Key Patterns

- Use `strong_parameters` to whitelist input — never trust user data
- Use `includes`/`eager_load` to prevent N+1 queries
- Use Active Job + Sidekiq for background processing
- Use `rails credentials:edit` for secrets
