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
  category: frameworks
  tags:
    - php
    - web
    - orm
    - api
    - fullstack
    - queues
---

# Laravel

Laravel is a batteries-included PHP framework with Eloquent ORM, Blade templates, queues, scheduler, and auth scaffolding.

## Installation

```bash
# Create new Laravel project
composer create-project laravel/laravel my-app
cd my-app && php artisan serve
```

## Models and Eloquent

```php
// app/Models/Article.php — Eloquent model
<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Article extends Model
{
    protected $fillable = ['title', 'slug', 'body', 'published'];
    protected $casts = ['published' => 'boolean'];

    public function author()
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
};
```

## Controllers

```php
// app/Http/Controllers/ArticleController.php — resource controller
<?php
namespace App\Http\Controllers;

use App\Models\Article;
use App\Http\Requests\StoreArticleRequest;

class ArticleController extends Controller
{
    public function index()
    {
        return response()->json(
            Article::published()->with('author:id,name')->latest()->paginate(20)
        );
    }

    public function store(StoreArticleRequest $request)
    {
        $article = $request->user()->articles()->create($request->validated());
        return response()->json($article, 201);
    }

    public function show(Article $article)
    {
        return response()->json($article->load('author:id,name'));
    }

    public function destroy(Article $article)
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

Route::apiResource('articles', ArticleController::class);
Route::middleware('auth:sanctum')->group(function () {
    Route::post('articles', [ArticleController::class, 'store']);
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
        <h2>{{ $article->title }}</h2>
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
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SendWelcomeEmail implements ShouldQueue
{
    use Dispatchable, SerializesModels;
    public function __construct(public User $user) {}
    public function handle(): void { /* Send email */ }
}
```

## Testing

```php
// tests/Feature/ArticleTest.php — feature test
<?php
use App\Models\Article;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ArticleTest extends TestCase
{
    use RefreshDatabase;

    public function test_list_articles(): void
    {
        Article::factory()->count(3)->create(['published' => true]);
        $this->getJson('/api/articles')->assertOk()->assertJsonCount(3, 'data');
    }
}
```

## Key Commands

```bash
# Common artisan commands
php artisan make:model Article -mfcr   # Model + migration + factory + controller
php artisan migrate
php artisan queue:work
php artisan tinker
```

## Key Patterns

- Use `$fillable` or `$guarded` on models to prevent mass assignment vulnerabilities
- Use Form Requests for validation — keeps controllers clean
- Use eager loading (`with()`) to prevent N+1 queries
- Queue long-running tasks with `ShouldQueue` jobs
