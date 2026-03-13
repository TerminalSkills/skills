---
name: laravel
description: >-
   You are an expert in Laravel, the most popular PHP framework for building
  web applications and APIs. You help developers build production systems with
  Eloquent ORM, Blade templating, Artisan CLI, queues, events, middleware,
  authentication (Sanctum/Breeze), Livewire for reactive UI, and a rich
  ecosystem of first-party packages — enabling rapid development without
  sacrificing code quality.
category: Backend Development
tags: [php, framework, eloquent, blade, artisan, api, fullstack]
version: 1.0.0
author: terminal-skills
---

# Laravel — The PHP Framework for Web Artisans

You are an expert in Laravel, the most popular PHP framework for building web applications and APIs. You help developers build production systems with Eloquent ORM, Blade templating, Artisan CLI, queues, events, middleware, authentication (Sanctum/Breeze), Livewire for reactive UI, and a rich ecosystem of first-party packages — enabling rapid development without sacrificing code quality.

## Core Capabilities

### Eloquent Models

```php
<?php
// app/Models/User.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Casts\Attribute;

class User extends Model
{
    use SoftDeletes;

    protected $fillable = ['name', 'email', 'password'];
    protected $hidden = ['password'];
    protected $casts = ['email_verified_at' => 'datetime', 'profile' => 'array'];

    public function posts(): HasMany
    {
        return $this->hasMany(Post::class);
    }

    // Accessor
    protected function name(): Attribute
    {
        return Attribute::make(
            get: fn (string $value) => ucfirst($value),
            set: fn (string $value) => strtolower($value),
        );
    }

    // Scope
    public function scopeActive($query) { return $query->whereNull('deleted_at'); }
}
```

### Controllers and Routes

```php
<?php
// app/Http/Controllers/UserController.php
namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(Request $request)
    {
        return User::query()
            ->when($request->search, fn ($q, $s) => $q->where('name', 'like', "%{$s}%"))
            ->with('posts')
            ->paginate(20);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'email' => 'required|email|unique:users',
            'password' => 'required|min:8',
        ]);

        $user = User::create([
            ...$validated,
            'password' => bcrypt($validated['password']),
        ]);

        // Dispatch event
        event(new UserRegistered($user));

        return response()->json($user, 201);
    }

    public function show(User $user)
    {
        return $user->load(['posts' => fn ($q) => $q->published()->latest()->limit(5)]);
    }
}
```

```php
// routes/api.php
Route::apiResource('users', UserController::class);
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
});
```

### Queues

```php
<?php
// app/Jobs/ProcessOrder.php
namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessOrder implements ShouldQueue
{
    use InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 60;

    public function __construct(public Order $order) {}

    public function handle(): void
    {
        $this->order->process();
        Mail::to($this->order->user)->send(new OrderConfirmation($this->order));
    }
}

// Dispatch: ProcessOrder::dispatch($order)->onQueue('orders');
```

## Installation

```bash
composer create-project laravel/laravel my-app
cd my-app
php artisan serve                          # Dev server on :8000
php artisan make:model User -mfcr         # Model + migration + factory + controller + resource
```

## Best Practices

1. **Eloquent scopes** — Use query scopes for reusable filters: `User::active()->recent()->get()`
2. **Form requests** — Extract validation to FormRequest classes; keeps controllers thin
3. **Eager loading** — Always use `with()` for relations; prevents N+1 queries
4. **Queues for heavy work** — Dispatch jobs for emails, reports, imports; process with `php artisan queue:work`
5. **API resources** — Use API Resources for response transformation; controls serialization per endpoint
6. **Sanctum for auth** — Use Sanctum for SPA/mobile API auth; simple token-based or cookie-based
7. **Migrations are immutable** — Never modify existing migrations; create new ones for changes
8. **Artisan commands** — Create custom commands for maintenance tasks; run via scheduler for cron jobs
