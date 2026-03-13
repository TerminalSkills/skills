---
name: ember
description: >-
  You are an expert in Ember.js, the opinionated frontend framework for
  ambitious web applications. You help developers build large-scale SPAs with
  Ember's convention-over-configuration approach, Glimmer components, tracked
  properties, Ember Data for data management, routing with nested layouts,
  services for shared state, and ember-cli for scaffolding — providing
  Rails-like productivity for frontend development.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Frontend Development
  tags:
    - javascript
    - framework
    - convention
    - spa
    - typescript
    - productivity
---

# Ember.js — Convention-Over-Configuration Frontend Framework

You are an expert in Ember.js, the opinionated frontend framework for ambitious web applications. You help developers build large-scale SPAs with Ember's convention-over-configuration approach, Glimmer components, tracked properties, Ember Data for data management, routing with nested layouts, services for shared state, and ember-cli for scaffolding — providing Rails-like productivity for frontend development.

## Core Capabilities

### Components (Glimmer)

```typescript
// app/components/todo-list.ts
import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { service } from "@ember/service";

interface TodoListArgs {
  title: string;
}

export default class TodoList extends Component<TodoListArgs> {
  @service declare store: any;
  @tracked newTodoText = "";
  @tracked filter: "all" | "active" | "done" = "all";

  get filteredTodos() {
    const todos = this.store.peekAll("todo");
    switch (this.filter) {
      case "active": return todos.filter(t => !t.completed);
      case "done": return todos.filter(t => t.completed);
      default: return todos;
    }
  }

  get remaining() {
    return this.store.peekAll("todo").filter(t => !t.completed).length;
  }

  @action async addTodo() {
    if (!this.newTodoText.trim()) return;
    const todo = this.store.createRecord("todo", {
      text: this.newTodoText,
      completed: false,
    });
    await todo.save();
    this.newTodoText = "";
  }

  @action async toggleTodo(todo: any) {
    todo.completed = !todo.completed;
    await todo.save();
  }

  @action setFilter(filter: "all" | "active" | "done") {
    this.filter = filter;
  }
}
```

```handlebars
{{! app/components/todo-list.hbs }}
<div class="todo-list">
  <h2>{{@title}} ({{this.remaining}} remaining)</h2>

  <form {{on "submit" this.addTodo}}>
    <input value={{this.newTodoText}}
      {{on "input" (fn (mut this.newTodoText) (get event "target.value"))}}
      placeholder="Add todo..." />
    <button type="submit">Add</button>
  </form>

  <div class="filters">
    {{#each (array "all" "active" "done") as |f|}}
      <button {{on "click" (fn this.setFilter f)}}
        class={{if (eq this.filter f) "active"}}>
        {{f}}
      </button>
    {{/each}}
  </div>

  <ul>
    {{#each this.filteredTodos as |todo|}}
      <li {{on "click" (fn this.toggleTodo todo)}}
        class={{if todo.completed "done"}}>
        {{todo.text}}
      </li>
    {{/each}}
  </ul>
</div>
```

### Routes

```typescript
// app/routes/todos.ts
import Route from "@ember/routing/route";
import { service } from "@ember/service";

export default class TodosRoute extends Route {
  @service declare store: any;

  async model() {
    return this.store.findAll("todo");
  }
}
```

```typescript
// app/router.ts
Router.map(function () {
  this.route("todos");
  this.route("user", { path: "/users/:user_id" }, function () {
    this.route("posts");
    this.route("settings");
  });
});
```

## Installation

```bash
npm install -g ember-cli
ember new my-app --lang en --typescript
cd my-app && ember serve
ember generate component todo-list
ember generate route todos
ember generate model todo
```

## Best Practices

1. **Tracked properties** — Use `@tracked` for reactive state; Ember auto-rerenders when tracked properties change
2. **Convention over config** — Follow Ember's file naming/structure conventions; reduces boilerplate dramatically
3. **Ember Data** — Use for API data management; handles caching, relationships, dirty tracking out of the box
4. **Services** — Use services for shared state (auth, notifications, feature flags); injected via `@service`
5. **Route model hook** — Load data in `model()` hook; template receives it automatically, loading states handled
6. **Glimmer components** — Use modern Glimmer syntax (no `this.get()`); lighter, faster than classic components
7. **ember-cli generators** — Use `ember generate` for scaffolding; ensures consistent file structure
8. **Testing built-in** — Ember ships with test framework; unit, integration, and acceptance tests out of the box
