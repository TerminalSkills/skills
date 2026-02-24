---
name: angular
description: |
  Angular is Google's TypeScript-based frontend framework for building scalable
  single-page applications. It provides components, dependency injection, RxJS-based
  reactivity, routing, forms, HTTP client, and a powerful CLI for development.
license: Apache-2.0
compatibility:
  - node >= 18
  - npm
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - typescript
    - frontend
    - spa
    - rxjs
    - google
    - components
---

# Angular

Angular is an opinionated, full-featured frontend framework. It uses TypeScript, components with templates, dependency injection, RxJS for async data, and a CLI for scaffolding.

## Installation

```bash
# Create new Angular project
npm i -g @angular/cli
ng new my-app --routing --style=scss
cd my-app
ng serve
```

## Project Structure

```
# Angular project layout
src/app/
├── app.component.ts        # Root component
├── app.config.ts           # Application config
├── app.routes.ts           # Route definitions
├── articles/
│   ├── article-list/       # List component
│   ├── article-detail/     # Detail component
│   ├── article.service.ts  # Data service
│   └── article.model.ts    # Interface/type
├── auth/
│   ├── auth.service.ts
│   ├── auth.guard.ts
│   └── auth.interceptor.ts
└── shared/
    ├── components/
    └── pipes/
```

## Components (Standalone)

```typescript
// src/app/articles/article-list/article-list.component.ts — standalone component
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ArticleService } from '../article.service';
import { Article } from '../article.model';

@Component({
  selector: 'app-article-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <h1>Articles</h1>
    @for (article of articles; track article.id) {
      <article>
        <h2><a [routerLink]="['/articles', article.slug]">{{ article.title }}</a></h2>
        <p>{{ article.excerpt }}</p>
      </article>
    } @empty {
      <p>No articles found.</p>
    }
  `,
})
export class ArticleListComponent implements OnInit {
  private articleService = inject(ArticleService);
  articles: Article[] = [];

  ngOnInit() {
    this.articleService.getAll().subscribe((data) => (this.articles = data));
  }
}
```

## Signals (Modern Reactivity)

```typescript
// src/app/articles/article-list/article-list.component.ts — signals-based component
import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ArticleService } from '../article.service';

@Component({
  selector: 'app-article-list',
  standalone: true,
  template: `
    <input (input)="search.set($any($event.target).value)" placeholder="Search..." />
    <div>{{ filteredCount() }} articles found</div>
    @for (article of filtered(); track article.id) {
      <article><h2>{{ article.title }}</h2></article>
    }
  `,
})
export class ArticleListComponent {
  private svc = inject(ArticleService);
  articles = toSignal(this.svc.getAll(), { initialValue: [] });
  search = signal('');
  filtered = computed(() =>
    this.articles().filter((a) => a.title.toLowerCase().includes(this.search().toLowerCase()))
  );
  filteredCount = computed(() => this.filtered().length);
}
```

## Services

```typescript
// src/app/articles/article.service.ts — injectable data service
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Article } from './article.model';

@Injectable({ providedIn: 'root' })
export class ArticleService {
  private http = inject(HttpClient);
  private baseUrl = '/api/articles';

  getAll(): Observable<Article[]> {
    return this.http.get<Article[]>(this.baseUrl);
  }

  getBySlug(slug: string): Observable<Article> {
    return this.http.get<Article>(`${this.baseUrl}/${slug}`);
  }

  create(article: Partial<Article>): Observable<Article> {
    return this.http.post<Article>(this.baseUrl, article);
  }
}
```

## Routing

```typescript
// src/app/app.routes.ts — application routes
import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home.component').then(m => m.HomeComponent) },
  { path: 'articles', loadComponent: () => import('./articles/article-list/article-list.component').then(m => m.ArticleListComponent) },
  { path: 'articles/:slug', loadComponent: () => import('./articles/article-detail/article-detail.component').then(m => m.ArticleDetailComponent) },
  { path: 'admin', loadComponent: () => import('./admin/admin.component').then(m => m.AdminComponent), canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
```

## Guards and Interceptors

```typescript
// src/app/auth/auth.guard.ts — functional route guard
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login']);
};
```

```typescript
// src/app/auth/auth.interceptor.ts — HTTP interceptor
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();
  if (token) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
```

## Reactive Forms

```typescript
// src/app/articles/article-form/article-form.component.ts — reactive form
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ArticleService } from '../article.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-article-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <input formControlName="title" placeholder="Title" />
      <textarea formControlName="body" placeholder="Body"></textarea>
      <button type="submit" [disabled]="form.invalid">Create</button>
    </form>
  `,
})
export class ArticleFormComponent {
  private fb = inject(FormBuilder);
  private svc = inject(ArticleService);
  private router = inject(Router);

  form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    body: ['', Validators.required],
  });

  submit() {
    if (this.form.valid) {
      this.svc.create(this.form.getRawValue()).subscribe(() => this.router.navigate(['/articles']));
    }
  }
}
```

## Application Config

```typescript
// src/app/app.config.ts — application configuration
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
```

## Key Patterns

- Use standalone components (default in Angular 17+) — no NgModules needed
- Use `inject()` function instead of constructor injection for cleaner code
- Use signals for synchronous state, RxJS for async streams and HTTP
- Lazy-load routes with `loadComponent` for smaller initial bundles
- Use functional guards and interceptors (simpler than class-based)
- Use `@for`/`@if`/`@switch` control flow syntax (Angular 17+) instead of `*ngFor`/`*ngIf`
