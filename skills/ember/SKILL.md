---
name: ember
description: >-
  Ember.js is an opinionated JavaScript framework for large single-page web apps, built on
  convention over configuration: Glimmer components, tracked state, nested routing, services,
  Ember Data (WarpDrive) and the ember-cli build tool. Use when someone asks to "build an Ember app",
  "create an Ember component or route", "upgrade Ember", "use Ember Data", or "convert Ember
  templates to .gjs/.gts".
license: Apache-2.0
compatibility: "Node.js 20.19+ and npm; Ember 6/7 with ember-cli 7, TypeScript optional"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["javascript", "ember", "framework", "spa", "typescript"]
  repository: https://github.com/emberjs/ember.js
---

# Ember.js — Convention-Over-Configuration Frontend Framework

## Overview

Ember is a batteries-included framework for ambitious web applications: file layout and naming drive behaviour, so teams share one structure. New apps (ember-cli 7.x, Ember 7.x at the time of writing, with a major release roughly every 18 months and a minor every six weeks) use:

- **Vite** as the build tool (`npm start` runs `vite`, `npm run build` runs `vite build`); the older ember-cli/Broccoli build with `ember serve` is the legacy path.
- **Template-tag components** (`.gjs` / `.gts`): the `<template>` block sits in the JavaScript or TypeScript file. Separate `.hbs` files still work in older apps.
- **Ember Data** now ships as **WarpDrive** (`@warp-drive/*` packages; models import from `@warp-drive/legacy/model`), with the store in `app/services/store.ts`.
- Octane idioms only: Glimmer components, `@tracked`, `@action`, `{{on}}` modifiers, `this.args`. Classic components, `this.get()`, `mut` and computed properties are legacy.

## Instructions

### Create and run an app

```bash
npm install -g ember-cli        # or: npx ember-cli new ...
ember new todo-app --lang en --typescript --strict
cd todo-app
npm start                       # Vite dev server on http://localhost:4200
npm test                        # builds in development mode and runs the QUnit suite via testem
npm run build                   # production build into dist/
npm run lint:types              # type-check .gts files (ember-tsc)
```

`--strict` (template-tag format) is what the official quick start uses; drop `--typescript` for plain JavaScript. Generators: `ember generate component todo-list`, `ember generate route todos`, `ember generate service session`. In a TypeScript app `ember generate model` may still emit a `.js` file with untyped fields; rename it to `.ts` and add `declare`.

### Components (template tag)

```typescript
// app/components/todo-list.gts
import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Store from 'todo-app/services/store';
import type Todo from 'todo-app/models/todo';

interface Signature {
  Args: { title: string };
}

export default class TodoList extends Component<Signature> {
  @service declare store: Store;
  @tracked newText = '';

  get todos() {
    return this.store.peekAll('todo') as Todo[];
  }

  get remaining() {
    return this.todos.filter((t) => !t.completed).length;
  }

  @action updateText(event: Event) {
    this.newText = (event.target as HTMLInputElement).value;
  }

  @action async addTodo(event: SubmitEvent) {
    event.preventDefault();
    if (!this.newText.trim()) return;
    const todo = this.store.createRecord('todo', { text: this.newText, completed: false }) as Todo;
    await todo.save();
    this.newText = '';
  }

  <template>
    <h2>{{@title}} ({{this.remaining}} left)</h2>
    <form {{on "submit" this.addTodo}}>
      <input value={{this.newText}} {{on "input" this.updateText}} placeholder="Add todo" />
      <button type="submit">Add</button>
    </form>
    <ul>
      {{#each this.todos as |todo|}}<li>{{todo.text}}</li>{{/each}}
    </ul>
  </template>
}
```

In `.gjs`/`.gts` files every component, helper and modifier used in the template must be imported (`on` from `@ember/modifier`, `fn` from `@ember/helper`, other components by path). Built-ins such as `{{#if}}`, `{{#each}}` and `{{yield}}` need no import. A form submit handler must call `event.preventDefault()` itself.

### Model, route and router

```typescript
// app/models/todo.ts
import Model, { attr } from '@warp-drive/legacy/model';

export default class Todo extends Model {
  @attr('string') declare text: string;
  @attr('boolean') declare completed: boolean;
}
```

```typescript
// app/routes/todos.ts
import Route from '@ember/routing/route';
import { service } from '@ember/service';
import type Store from 'todo-app/services/store';

export default class TodosRoute extends Route {
  @service declare store: Store;

  model() {
    return this.store.findAll('todo');
  }
}
```

```typescript
// app/router.ts
Router.map(function () {
  this.route('todos');
  this.route('user', { path: '/users/:user_id' }, function () {
    this.route('posts');
  });
});
```

```typescript
// app/templates/todos.gts
import TodoList from 'todo-app/components/todo-list';

<template><TodoList @title="Sprint 42" /></template>
```

The route's `model()` result is available as `@model` in the route template; pass it down as arguments. The store needs a data source for `findAll`/`save`: a legacy adapter in `app/adapters/application.ts` or request handlers configured in `app/services/store.ts`. Check the Ember Data (WarpDrive) guide for the setup that fits your API.

## Examples

### Example 1: Add a route with a nested page

User: "Add a /users/:id/settings page to my Ember app."

Run `ember generate route user/settings`, add `this.route('settings')` inside the `user` route in `app/router.ts`, load data in the `model()` hook and render it in `app/templates/user/settings.gts`. Result: `npm start` serves `http://localhost:4200/users/42/settings`.

### Example 2: Convert a classic component

User: "Convert this classic component with `this.get('count')` and `actions: {}` to modern Ember."

Make it a `@glimmer/component` class, turn `count` into `@tracked count = 0`, turn each entry in `actions` into an `@action` method, replace `{{action "inc"}}` with `{{on "click" this.inc}}`, and read arguments as `@title` or `this.args.title`. Result: the component renders identically, with no `this.get`/`this.set` calls left.

## Guidelines

- Use `@tracked` for reactive state; assign to it, do not mutate in place when the value is an array or object (replace it, or use `tracked-built-ins`).
- Load data in the route `model()` hook, not in component constructors.
- Put shared state (session, notifications, feature flags) in services, injected with `@service`.
- Follow file naming conventions; the resolver depends on them.
- Upgrade one minor at a time and fix deprecation warnings before moving to the next major; deprecated APIs are removed in majors. `npx ember-cli-update` applies blueprint changes.
- Keep application tests in `tests/` (unit, integration, acceptance); `npm test` runs them.
- Ember suits long-lived, large apps; for a small static site a lighter tool is easier.
