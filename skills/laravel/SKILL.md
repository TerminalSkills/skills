---
name: laravel
description: |
  Laravel is a PHP web framework with expressive syntax and a rich ecosystem.
  It provides Eloquent ORM, Blade templates, queues, task scheduling, Sanctum
  for API auth, and tools for building modern full-stack or API applications.
license: Apache-2.0
compatibility:
  - php >= 8.2
  - composer
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - php
    - web
    - orm
    - api
    - fullstack
    - queues
---

# Laravel

Laravel is a batteries-included PHP framework. It ships with an ORM (Eloquent), template engine (Blade), queue system, scheduler, and built-in auth scaffolding.

## Installation

```bash
# Create new Laravel project
composer create-project laravel/laravel my-app
cd my-app
php artisan serve
```

## Project Structure

```
# Laravel project layout
app/
├── Http/
│   ├── Controllers/       # Request handlers
│   ├── Middleware/         # HTTP middleware
│   └── Requests/          # Form request validation
├── Models/                # Eloquent models
├── Services/              # Business logic
└── Jobs/                  # Queue jobs
routes/
├── web.php               # Web routes
└── api.php               # API routes
resources/views/           # Blade templates
database/
├── migrations/            # Schema migrations
├── seeders/               # Data seeders
└── factories/             # Model factories
config/                    # Configuration files
```

## Models and Eloquent

```php
// app/Models/Article.php — Eloquent model
<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Article extends Model
{
    protected $fillable = ['title', 'slug', 'body', 'published'];
    protected $casts = ['published' => 'boolean'];

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function scopePublished($query)
    {
        return $query->where('published', true);
    }
}
```

## Migrations

```php
// database/migrations/2024_01_01_create_articles_table.php — migration
<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('articles', function (Blueprint $table) {
            $table->id();
            $table->string('title', 200);
            $table->string('slug')->unique();
            $table->text('body');
            $table->foreignId('author_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('published')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('articles');
    }
};
```

## Controllers

```php
// app/Http/Controllers/ArticleController.php — resource controller
<?php
namespace App\Http\Controllers;

use App\Models\Article;
use App\Http\Requests\StoreArticleRequest;
use Illuminate\Http\JsonResponse;

class ArticleController extends Controller
{
    public function index(): JsonResponse
    {
        $articles = Article::published()
            ->with('author:id,name')
            ->latest()
            ->paginate(20);
        return response()->json($articles);
    }

    public function store(StoreArticleRequest $request): JsonResponse
    {
        $article = $request->user()->articles()->create($request->validated());
        return response()->json($article, 201);
    }

    public function show(Article $article): JsonResponse
    {
        return response()->json($article->load('author:id,name'));
    }

    public function destroy(Article $article): JsonResponse
    {
        $this->authorize('delete', $article);
        $article->delete();
        return response()->json(null, 204);
    }
}
```

## Form Request Validation

```php
// app/Http/Requests/StoreArticleRequest.php — validated request
<?php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreArticleRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'title' => 'required|string|max:200',
            'slug'  => 'required|string|unique:articles',
            'body'  => 'required|string',
        ];
    }
}
```

## Routes

```php
// routes/api.php — API routes
<?php
use App\Http\Controllers\ArticleController;
use Illuminate\Support\Facades\Route;

Route::apiResource('articles', ArticleController::class);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('articles', [ArticleController::class, 'store']);
    Route::delete('articles/{article}', [ArticleController::class, 'destroy']);
});
```

## Blade Templates

```html
<!-- resources/views/articles/index.blade.php — Blade list view -->
@extends('layouts.app')

@section('content')
<h1>Articles</h1>
@foreach ($articles as $article)
    <article>
        <h2><a href="{{ route('articles.show', $article) }}">{{ $article->title }}</a></h2>
        <p>By {{ $article->author->name }} — {{ $article->created_at->diffForHumans() }}</p>
    </article>
@endforeach
{{ $articles->links() }}
@endsection
```

## Queues and Jobs

```php
// app/Jobs/SendWelcomeEmail.php — queued job
<?php
namespace App\Jobs;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendWelcomeEmail implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public User $user) {}

    public function handle(): void
    {
        // Send email logic
    }
}

// Dispatch: SendWelcomeEmail::dispatch($user);
```

## API Auth with Sanctum

```bash
# Install and configure Sanctum
php artisan install:api
```

```php
// routes/api.php — Sanctum token auth
Route::post('/login', function (Request $request) {
    $user = User::where('email', $request->email)->first();
    if (!$user || !Hash::check($request->password, $user->password)) {
        return response()->json(['error' => 'Invalid credentials'], 401);
    }
    return response()->json(['token' => $user->createToken('api')->plainTextToken]);
});
```

## Testing

```php
// tests/Feature/ArticleTest.php — feature test
<?php
namespace Tests\Feature;

use App\Models\Article;
use App\Models\User;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ArticleTest extends TestCase
{
    use RefreshDatabase;

    public function test_list_articles(): void
    {
        Article::factory()->count(3)->create(['published' => true]);
        $response = $this->getJson('/api/articles');
        $response->assertOk()->assertJsonCount(3, 'data');
    }
}
```

## Key Commands

```bash
# Common artisan commands
php artisan make:model Article -mfcr   # Model + migration + factory + controller (resource)
php artisan migrate                     # Run migrations
php artisan db:seed                     # Run seeders
php artisan queue:work                  # Process queue jobs
php artisan route:list                  # Show all routes
php artisan tinker                      # REPL
```

## Key Patterns

- Use `$fillable` or `$guarded` on models to prevent mass assignment vulnerabilities
- Use Form Requests for validation — keeps controllers clean
- Use eager loading (`with()`) to prevent N+1 queries
- Use model factories and `RefreshDatabase` trait for tests
- Use `php artisan make:*` generators to scaffold boilerplate
- Queue long-running tasks (emails, reports) with `ShouldQueue` jobs
