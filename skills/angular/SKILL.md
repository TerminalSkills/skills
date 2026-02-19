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
  category: frameworks
  tags:
    - typescript
    - frontend
    - spa
    - rxjs
    - google
    - components
---

# Angular

Angular is an opinionated, full-featured frontend framework using TypeScript, components, dependency injection, and RxJS.

## Installation

```bash
# Create new Angular project
npm i -g @angular/cli
ng new my-app --routing --style=scss
cd my-app && ng serve
```

## Standalone Components

```typescript
// src/app/articles/article-list.component.ts — standalone component with signals
import { Component, signal, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ArticleService } from './article.service';

@Component({
  selector: 'app-article-list',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>Articles</h1>
    <input (input)="search.set($any($event.target).value)" placeholder="Search..." />
    @for (article of filtered(); track article.id) {
      <article>
        <h2><a [routerLink]="['/articles', article.slug]">{{ article.title }}</a></h2>
      </article>
    } @empty {
      <p>No articles found.</p>
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
}
```

## Services

```typescript
// src/app/articles/article.service.ts — injectable data service
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ArticleService {
  private http = inject(HttpClient);

  getAll(): Observable<Article[]> {
    return this.http.get<Article[]>('/api/articles');
  }

  getBySlug(slug: string): Observable<Article> {
    return this.http.get<Article>(`/api/articles/${slug}`);
  }

  create(article: Partial<Article>): Observable<Article> {
    return this.http.post<Article>('/api/articles', article);
  }
}
```

## Routing

```typescript
// src/app/app.routes.ts — application routes with lazy loading
import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./home/home.component').then(m => m.HomeComponent) },
  { path: 'articles', loadComponent: () => import('./articles/article-list.component').then(m => m.ArticleListComponent) },
  { path: 'articles/:slug', loadComponent: () => import('./articles/article-detail.component').then(m => m.ArticleDetailComponent) },
  { path: 'admin', loadComponent: () => import('./admin/admin.component').then(m => m.AdminComponent), canActivate: [authGuard] },
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
  if (token) req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  return next(req);
};
```

## Reactive Forms

```typescript
// src/app/articles/article-form.component.ts — reactive form
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ArticleService } from './article.service';
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

## App Config

```typescript
// src/app/app.config.ts — application configuration
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
```

## Key Patterns

- Use standalone components (Angular 17+) — no NgModules needed
- Use `inject()` function instead of constructor injection
- Use signals for synchronous state, RxJS for async streams
- Lazy-load routes with `loadComponent` for smaller bundles
- Use `@for`/`@if` control flow syntax (Angular 17+) instead of `*ngFor`/`*ngIf`
