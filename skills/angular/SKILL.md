---
name: angular
description: >-
  Angular is Google's TypeScript framework for building single-page web applications with
  components, signals, dependency injection, routing, forms, an HTTP client and the ng CLI.
  Use when the user wants to create an Angular app, write standalone components, use signals,
  set up lazy routes, guards, interceptors or reactive forms, or upgrade an older Angular
  project. Trigger words: angular, ng new, ng serve, standalone component, signals, rxjs.
license: Apache-2.0
compatibility: "Node.js ^22.22.3, ^24.15.0 or >=26 for Angular 22; npm"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: "https://github.com/angular/angular"
  tags:
    - typescript
    - frontend
    - spa
    - rxjs
    - components
---

# Angular

## Overview

Angular is an opinionated, full-featured frontend framework: TypeScript, components with templates, dependency injection, signals and RxJS for reactivity, a router, forms, an HTTP client, and the `ng` CLI. This skill targets Angular 22 (CLI 22.2.4, October 2026), whose new projects are standalone, OnPush by default and zoneless, use Vitest for unit tests, and TypeScript 6. Apps from v17 to v21 differ mostly in file naming and defaults; see the guidelines.

## Instructions

Create and run a project. Node must satisfy the range in `compatibility`, otherwise the CLI prints the required versions and exits.

```bash
npm create @angular@latest ticket-desk -- --routing --style=scss --defaults
cd ticket-desk
npx ng serve                                  # dev server on http://localhost:4200
npx ng build                                  # production build into dist/ticket-desk/browser
npx ng test                                   # unit tests with the Vitest runner
npx ng generate component articles/article-list
```

Layout used by the examples below. Generated files have no `.component` suffix and classes have no `Component` suffix (`app.ts` exports `App`):

```text
src/app/
├── app.ts, app.html, app.config.ts, app.routes.ts
├── articles/  article.model.ts, article.service.ts, article-list/article-list.ts, article-form/article-form.ts
└── auth/      auth.service.ts, auth.guard.ts, auth.interceptor.ts
```

Rules for current Angular code:

- Components are standalone by default: do not write `standalone: true` or add NgModules. Import only what the template uses (`RouterLink`, `ReactiveFormsModule`); `CommonModule` is unnecessary because `@if`, `@for` and `@switch` are built into templates.
- Change detection is OnPush by default and new apps run without zone.js. A plain field assigned inside a `subscribe` callback does not update the view. Keep state in `signal()`, derive it with `computed()`, and convert Observables with `toSignal()` from `@angular/core/rxjs-interop`.
- Use `inject()` for dependencies, `@Injectable({ providedIn: 'root' })` for services, and functional guards (`CanActivateFn`) and interceptors (`HttpInterceptorFn`).
- `HttpClient` is not provided by default: add `provideHttpClient(withFetch(), withInterceptors([...]))` to `app.config.ts`.
- Lazy-load routes with `loadComponent: () => import('./x').then((m) => m.X)`.
- Template control flow: `@for (item of items(); track item.id) { ... } @empty { ... }` (`track` is required), `@if (...) { ... } @else { ... }`.

## Examples

### Example 1: Searchable article list with signals

**User request:** "Show articles from /api/articles with a live search box"

```typescript
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ArticleService } from '../article.service';

@Component({
  selector: 'app-article-list',
  imports: [RouterLink],
  template: `
    <input #q (input)="search.set(q.value)" placeholder="Search articles" />
    <p>{{ filtered().length }} articles found</p>
    @for (article of filtered(); track article.id) {
      <article>
        <h2><a [routerLink]="['/articles', article.slug]">{{ article.title }}</a></h2>
        <p>{{ article.excerpt }}</p>
      </article>
    } @empty {
      <p>No articles found.</p>
    }
  `,
})
export class ArticleList {
  private readonly articleService = inject(ArticleService);
  protected readonly articles = toSignal(this.articleService.getAll(), { initialValue: [] });
  protected readonly search = signal('');
  protected readonly filtered = computed(() => {
    const term = this.search().toLowerCase();
    return this.articles().filter((a) => a.title.toLowerCase().includes(term));
  });
}
```

The service and model it relies on:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Article } from './article.model';

@Injectable({ providedIn: 'root' })
export class ArticleService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/articles';

  getAll(): Observable<Article[]> {
    return this.http.get<Article[]>(this.baseUrl);
  }

  create(article: Pick<Article, 'title' | 'excerpt'>): Observable<Article> {
    return this.http.post<Article>(this.baseUrl, article);
  }
}
```

**Result:** `ng build` compiles it; the list renders from `filtered()`, and typing in the box updates the count and the rows with no manual change detection.

### Example 2: Protected route, token interceptor and reactive form

**User request:** "Only logged-in users may open the new-article form, and every request should carry the bearer token"

```typescript
import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'articles' },
  {
    path: 'articles',
    loadComponent: () => import('./articles/article-list/article-list').then((m) => m.ArticleList),
  },
  {
    path: 'articles/new',
    canActivate: [authGuard],
    loadComponent: () => import('./articles/article-form/article-form').then((m) => m.ArticleForm),
  },
  { path: '**', redirectTo: 'articles' },
];
```

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/login']);
};
```

```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();
  return next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);
};
```

```typescript
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
  ],
};
```

```typescript
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ArticleService } from '../article.service';

@Component({
  selector: 'app-article-form',
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <input formControlName="title" placeholder="Title" />
      <textarea formControlName="excerpt" placeholder="Excerpt"></textarea>
      <button type="submit" [disabled]="form.invalid">Create</button>
    </form>
  `,
})
export class ArticleForm {
  private readonly fb = inject(FormBuilder);
  private readonly articles = inject(ArticleService);
  private readonly router = inject(Router);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    excerpt: ['', Validators.required],
  });

  protected submit() {
    if (this.form.valid) {
      this.articles.create(this.form.getRawValue()).subscribe(() => this.router.navigate(['/articles']));
    }
  }
}
```

**Result:** an anonymous visitor to `/articles/new` is redirected to `/login` (add that route when you build the login page); after `AuthService.setToken()` is called, every request carries `Authorization: Bearer ...`; the submit button stays disabled until both fields are valid. The production build puts `article-form` and `article-list` in lazy chunks.

## Guidelines

- Check `node -v` before scaffolding; an unsupported Node fails at `ng new`.
- Upgrade existing projects one major at a time (`npx ng update @angular/core@21 @angular/cli@21`, then 22), following the update guide at angular.dev/update-guide, and commit between steps. Use the built-in migrations instead of hand edits: `ng generate @angular/core:control-flow-migration`, `:standalone-migration`, `:inject-migration`, `:signal-input-migration`.
- Projects created before v20 use `article-list.component.ts` and `ArticleListComponent`; keep the project's existing convention rather than mixing styles.
- Existing zone-based apps keep working with `provideZoneChangeDetection()`; do not add it to a new zoneless app.
- Do not hard-code API hosts or tokens in code. Use a dev proxy (`ng serve --proxy-config proxy.conf.json`) and your deployment's environment for the real base URL.
- Long-lived Observables need cleanup: prefer `toSignal`, the `async` pipe or `takeUntilDestroyed()` over bare `subscribe`.
- Deploy the `dist/` output of `ng build`; never run the dev server in production.
