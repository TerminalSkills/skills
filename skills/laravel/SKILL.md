---
name: laravel
description: >-
  Laravel is a PHP web framework for building full-stack applications and JSON
  APIs with Eloquent ORM, Blade views, the Artisan CLI, queues, events and
  Sanctum authentication. Use when a user asks to create a Laravel app, add
  models, migrations, controllers, form requests, API routes, queued jobs or
  token auth, run Artisan commands, or upgrade from Laravel 12 to 13.
license: Apache-2.0
compatibility: "PHP 8.3+ and Composer; Node.js for the Vite frontend build (Laravel 13)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/laravel/framework
  category: development
  tags: ["php", "laravel", "eloquent", "artisan", "api"]
---

# Laravel — The PHP Framework for Web Artisans

## Overview

Laravel is a full-stack PHP framework. Laravel 13 (released March 2026, current line 13.x) requires PHP 8.3 or newer. It ships Eloquent (ORM), Blade (templates), Artisan (CLI), a queue system, events, scheduling and first-party packages such as Sanctum (API tokens and SPA cookies), Fortify (headless auth), Livewire, Horizon and Pint. New apps use SQLite by default, so `laravel new` works with no database server.

## Instructions

### Create and run an app

```bash
composer global require laravel/installer     # needs PHP 8.3+ and Composer
laravel new orders-api                         # prompts for a starter kit, tests, database
cd orders-api
npm install && npm run build
composer run dev                               # serves :8000, queue worker and Vite together
```

- Starter kits are React, Svelte, Vue (Inertia) and Livewire; all use Fortify for login, registration, 2FA and email verification. Breeze and Jetstream are not offered for new apps. Choose "none" for a plain API or Blade app.
- To use MySQL or PostgreSQL edit the `DB_*` values in `.env`, create the database, then run `php artisan migrate`.
- Create files with generators: `php artisan make:model Order -mfcr` (model, migration, factory, resource controller), `make:request`, `make:job`, `make:resource`, `make:policy`. `php artisan route:list` shows every route.

### Eloquent models

`$fillable`, `$hidden` and `casts()` on the model work in every version; Laravel 13 also accepts PHP attributes such as `#[Fillable([...])]` and `#[Table('...')]`. Define casts in a `casts()` method. Mark local scopes with `#[Scope]`.

```php
<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends Model
{
    use SoftDeletes;

    protected $fillable = ['user_id', 'reference', 'status', 'total_cents'];

    protected function casts(): array
    {
        return ['shipped_at' => 'datetime', 'meta' => 'array'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    #[Scope]
    protected function pending(Builder $query): void
    {
        $query->where('status', 'pending');
    }
}
// Order::pending()->with('items')->latest()->paginate(20);
```

### Validation and controllers

Put validation in a FormRequest (`php artisan make:request StoreOrderRequest`) and keep controllers thin. Hash passwords with the `hashed` cast on the User model (the default skeleton has it) or `Hash::make`.

```php
// app/Http/Controllers/OrderController.php
public function store(StoreOrderRequest $request)
{
    $order = $request->user()->orders()->create($request->validated());
    ProcessOrder::dispatch($order)->onQueue('orders');

    return new OrderResource($order);   // 201 for a newly created model
}
```

### API routes and Sanctum

`routes/api.php` does not exist in a fresh app. Run `php artisan install:api` to publish it, install Sanctum and add the migration, then migrate.

```bash
php artisan install:api
php artisan migrate
```

```php
// routes/api.php
Route::post('/sanctum/token', function (Request $request) {
    $request->validate(['email' => 'required|email', 'password' => 'required', 'device_name' => 'required']);
    $user = User::where('email', $request->email)->first();
    if (! $user || ! Hash::check($request->password, $user->password)) {
        throw ValidationException::withMessages(['email' => ['The provided credentials are incorrect.']]);
    }
    return $user->createToken($request->device_name, ['orders:read'])->plainTextToken;
});

Route::middleware('auth:sanctum')->group(function () {
    Route::apiResource('orders', OrderController::class);
});
```

The `User` model needs the `Laravel\Sanctum\HasApiTokens` trait. Clients send `Authorization: Bearer <token>`. Tokens are hashed in the database, so show `plainTextToken` once. For a first-party SPA do not use tokens: call `$middleware->statefulApi()` in `bootstrap/app.php`, set `SANCTUM_STATEFUL_DOMAINS`, fetch `/sanctum/csrf-cookie`, then POST `/login`.

### Queues

```php
<?php
namespace App\Jobs;

use App\Models\Order;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ProcessOrder implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $backoff = 60;

    public function __construct(public Order $order) {}

    public function handle(): void
    {
        $this->order->process();
    }
}
```

Run `php artisan queue:work` (or let `composer run dev` do it). The default queue driver is `database`; use Redis plus Horizon for volume. Restart workers after a deploy with `php artisan queue:restart`.

### Laravel 13 notes (upgrading from 12)

- Update `laravel/framework` to `^13.0`, `laravel/tinker` to `^3.0`, `phpunit/phpunit` to `^12.0`, `pestphp/pest` to `^4.0`, then `composer global update laravel/installer`.
- The CSRF middleware is now `PreventRequestForgery` (it also checks `Sec-Fetch-Site`); `VerifyCsrfToken` remains as a deprecated alias.
- Cache has a `serializable_classes` option, `false` by default: list any PHP classes you store in cache.
- The skeleton sets session `serialization` to `json`; switching an existing app from `php` logs every user out.
- Default cache and session-cookie prefixes now use hyphens; set `CACHE_PREFIX` and `SESSION_COOKIE` to keep old names.
- Laravel Boost (`composer require laravel/boost --dev`, `php artisan boost:install`) gives agents project-aware tools and docs search.

## Examples

### Example 1: Token-protected orders API

**User request:** "Add an orders API to my Laravel app with login tokens, nothing for the browser."

```bash
php artisan install:api && php artisan make:model Order -mfcr --api
# edit the migration: user_id, reference, status, total_cents
php artisan migrate
php artisan test --compact
```

Add `HasApiTokens` to `User`, paste the token route and the `auth:sanctum` group from above into `routes/api.php`. Then `curl -H "Authorization: Bearer 1|k9Xa..." -H "Accept: application/json" http://localhost:8000/api/orders` returns a paginated JSON object; without the token it returns 401 `{"message":"Unauthenticated."}`.

### Example 2: Move PDF invoice generation off the request

**User request:** "Generating the invoice PDF takes 6 seconds. Make the order endpoint return immediately."

```bash
php artisan make:job GenerateInvoicePdf
```

Implement `ShouldQueue` with `$tries = 3`, call `GenerateInvoicePdf::dispatch($order)->onQueue('invoices');` in the controller and run `php artisan queue:work --queue=invoices,default`. The endpoint now answers in milliseconds, and failures are retried and listed by `php artisan queue:failed`.

## Guidelines

- Always `with()` relations you will loop over; call `Model::preventLazyLoading(! app()->isProduction())` in `AppServiceProvider::boot` to catch N+1 queries in development.
- Never edit a migration that has run in production; add a new one. Use `php artisan migrate --force` only in deploy scripts.
- Never set `$guarded = []` on models that take request input; validate and use `$request->validated()`.
- Keep `APP_DEBUG=false` and a real `APP_KEY` in production; run `php artisan config:cache route:cache view:cache` (or `php artisan optimize`) on deploy. After caching config, `env()` works only inside config files.
- Serve the `public/` directory as the web root, never the project root.
- Do not use Sanctum tokens for your own browser SPA; use its cookie mode. Reach for Passport only when you need a full OAuth2 server.
- Format with Pint (`vendor/bin/pint`) and test with Pest or PHPUnit (`php artisan test`).
