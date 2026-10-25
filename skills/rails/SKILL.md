---
name: rails
description: >-
  Ruby on Rails is a full-stack web framework with ActiveRecord ORM,
  controllers, views, Active Job, Action Cable and built-in authentication.
  Use when someone asks to "create a Rails app", "add a model and migration",
  "build a Rails API endpoint", "add login to Rails", "run background jobs",
  "write Rails tests" or "upgrade to Rails 8".
license: Apache-2.0
compatibility: "Ruby 3.2+ (Rails 8.1 needs >= 3.2.0), Bundler, SQLite or PostgreSQL"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "ruby, rails, fullstack, mvc, activerecord"
  repository: https://github.com/rails/rails
---

# Ruby on Rails

## Overview

Rails favors convention over configuration: generators create models, controllers, views, migrations and tests in standard places. This skill targets Rails 8.1 (8.1.4, September 2026). Defaults changed in Rails 8: new apps use SQLite, Propshaft, importmap, Turbo and Stimulus, plus the database-backed Solid Queue (jobs), Solid Cache and Solid Cable (Action Cable in production), so no Redis is needed. Rails 8 also ships a built-in authentication generator and Kamal deploy config. The code below was generated and run on Rails 8.1.4 with Ruby 3.4.

## Instructions

### 1. Create the app

```bash
gem install rails
rails new shop                                   # SQLite + Solid trio, importmap
rails new shop --database=postgresql --css=tailwind
rails new shop_api --api                         # no views/assets, JSON only
cd shop && bin/rails db:create
bin/rails server                                 # http://localhost:3000 (bin/dev exists only with Tailwind or a JS bundler)
```

Flags such as `--skip-kamal`, `--skip-docker`, `--skip-thruster` drop generated deploy files. Use `bin/rails` (the binstub) so the project's Bundler versions load.

Layout: `app/{models,controllers,views,jobs,channels,mailers}`, `config/routes.rb`, `config/database.yml`, `config/credentials.yml.enc`, `db/migrate`, `db/schema.rb`, `test/`, plus `config/queue.yml`, `config/cable.yml`, `config/ci.rb` and `bin/jobs`.

### 2. Authentication (built in, no Devise needed)

```bash
bin/rails generate authentication
bin/rails db:migrate
```

This adds `User` (`email_address`, `password_digest` via `has_secure_password`), `Session`, `Current` (`Current.user`, `Current.session`), `SessionsController`, `PasswordsController` and an `Authentication` concern that is included in `ApplicationController`. Every action then requires a login; open specific ones with `allow_unauthenticated_access only: %i[index show]`. The generated code redirects to `root_url` after login, so the app must define a `root` route.

### 3. Models and migrations

```bash
bin/rails generate model Article title:string! slug:string:uniq body:text! published:boolean author:references
```

Edit the migration: `author:references` points at an `authors` table, so name the real one, and give booleans a default.

```ruby
# db/migrate/20261024185513_create_articles.rb
class CreateArticles < ActiveRecord::Migration[8.1]
  def change
    create_table :articles do |t|
      t.string :title, null: false
      t.string :slug, null: false
      t.text :body, null: false
      t.boolean :published, null: false, default: false
      t.references :author, null: false, foreign_key: { to_table: :users }
      t.timestamps
    end
    add_index :articles, :slug, unique: true
  end
end
```

```ruby
# app/models/article.rb
class Article < ApplicationRecord
  belongs_to :author, class_name: "User"

  validates :title, presence: true, length: { maximum: 200 }
  validates :slug, presence: true, uniqueness: true
  validates :body, presence: true

  scope :published, -> { where(published: true) }
  scope :recent, -> { order(created_at: :desc) }

  before_validation :generate_slug, on: :create

  private

  def generate_slug
    self.slug = title&.parameterize if slug.blank?
  end
end
```

Add `has_many :articles, foreign_key: :author_id, inverse_of: :author, dependent: :destroy` to `User`. Run `bin/rails db:migrate`; roll back with `bin/rails db:rollback`.

### 4. Routes and controller

```ruby
# config/routes.rb
Rails.application.routes.draw do
  resource :session
  resources :passwords, param: :token
  root "articles#index"
  resources :articles, only: %i[index show create update destroy]
end
```

```ruby
# app/controllers/articles_controller.rb
class ArticlesController < ApplicationController
  allow_unauthenticated_access only: %i[index show]
  before_action :set_article, only: %i[show update destroy]

  def index
    articles = Article.published.recent.includes(:author).limit(20).offset(page_offset)
    render json: articles.as_json(only: %i[id title slug created_at], include: { author: { only: :email_address } })
  end

  def show
    render json: @article
  end

  def create
    article = Current.user.articles.build(article_params)
    if article.save
      render json: article, status: :created
    else
      render json: { errors: article.errors }, status: :unprocessable_content
    end
  end

  def update
    if @article.update(article_params)
      render json: @article
    else
      render json: { errors: @article.errors }, status: :unprocessable_content
    end
  end

  def destroy
    @article.destroy!
    head :no_content
  end

  private

  def set_article
    @article = Article.find(params.expect(:id))
  end

  def article_params
    params.expect(article: %i[title body published])
  end

  def page_offset
    ([params[:page].to_i, 1].max - 1) * 20
  end
end
```

`params.expect` (Rails 8.0+) replaces `params.require(...).permit(...)`: it also returns 400 instead of 500 when the shape is wrong. `:unprocessable_content` is the current name of the 422 status symbol (`:unprocessable_entity` is the deprecated alias). Rails has no built-in pagination; use `limit/offset` as above, or the pagy or kaminari gems. Inspect routes with `bin/rails routes -g article`.

### 5. Views, jobs, cable

Scaffolds (`bin/rails generate scaffold Article ...`) produce ERB views, Jbuilder JSON and tests. Views use `link_to`, `time_ago_in_words`, `truncate`.

Active Job runs on Solid Queue in production (`config.active_job.queue_adapter = :solid_queue`, tables in `db/queue_schema.rb`); run workers with `bin/jobs`.

```ruby
class WelcomeEmailJob < ApplicationJob
  queue_as :default
  retry_on Net::OpenTimeout, wait: :polynomially_longer, attempts: 5
  discard_on ActiveJob::DeserializationError

  def perform(user)
    UserMailer.welcome(user).deliver_now
  end
end
# WelcomeEmailJob.perform_later(user)
```

Rails 8.1 adds `include ActiveJob::Continuable` and `step :name do ... end` so long jobs resume at the last finished step after a restart or deploy.

```ruby
# app/channels/chat_channel.rb (development uses the async cable adapter, production solid_cable)
class ChatChannel < ApplicationCable::Channel
  def subscribed
    stream_from "chat_#{params[:room_id]}"
  end

  def receive(data)
    ActionCable.server.broadcast("chat_#{params[:room_id]}", { user: current_user.email_address, message: data["message"] })
  end
end
```

`/cable` is mounted by default; do not mount it again. Define `current_user` in `ApplicationCable::Connection` (`identified_by :current_user`).

## Examples

### Example 1: "Add a public blog API where only logged-in users can post"

Run steps 2 to 4. Result: `GET /articles` returns published articles as JSON without a login, and `POST /articles` without a session redirects to `/session/new`. After `POST /session` with `email_address` and `password` it returns 201 with the new article, and an empty title returns 422 with `{"errors":{"title":["can't be blank"]}}`.

### Example 2: "Test it"

```ruby
# test/controllers/articles_controller_test.rb
require "test_helper"

class ArticlesControllerTest < ActionDispatch::IntegrationTest
  test "create with a session" do
    post session_url, params: { email_address: "ana@shopkit.dev", password: "correct-horse" }
    post articles_url, params: { article: { title: "Mine", body: "Text" } }, as: :json
    assert_response :created
    post articles_url, params: { article: { title: "", body: "Text" } }, as: :json
    assert_response :unprocessable_content
  end
end
```

with a fixture `test/fixtures/users.yml` whose `password_digest` is `<%= BCrypt::Password.create("correct-horse") %>`. `bin/rails test` printed all article tests passing on 8.1.4. The default fixtures from `generate model` (`articles.yml` with `author: one`) fail to load; delete or fill them in.

## Guidelines

- Use `includes` (or `preload`, `eager_load`) to avoid N+1 queries; add the `bullet` gem in development to catch them.
- Never trust params: always `params.expect` or `permit`. Use `find_by!`/`find` scoped to `Current.user` so users cannot read other users' records.
- Secrets live in `bin/rails credentials:edit` (key in `config/master.key`, which is git-ignored; set `RAILS_MASTER_KEY` in production). Never commit the key.
- `bin/ci` (Rails 8.1) runs the steps in `config/ci.rb`: rubocop, bundler-audit, brakeman and tests. Use it locally and in GitHub Actions.
- Run `bin/brakeman` and `bin/bundler-audit` before deploying; Rails patch releases are frequent security fixes, so stay on the latest 8.1.x.
- Deploy with Kamal (`bin/kamal setup`, `bin/kamal deploy`) from the generated `config/deploy.yml`, or any Docker host using the generated `Dockerfile`.
- Upgrading: move one minor at a time (7.2, 8.0, 8.1), running `bin/rails app:update` and the test suite at each step. Set `ActiveRecord::Migration[8.1]` only in new migrations.
- Do not edit `db/schema.rb` by hand; it is regenerated by migrations.
