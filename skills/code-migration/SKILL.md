---
name: code-migration
description: >-
  Migrate codebases between frameworks, languages, and API versions. Use when
  a user asks to convert JavaScript to TypeScript, migrate React class
  components to hooks, upgrade Vue 2 to Vue 3, migrate Python 2 to 3, update
  deprecated APIs, switch ORMs, convert Express to Fastify, or modernize
  legacy code. Handles incremental migration with backward compatibility.
license: Apache-2.0
compatibility: "Any modern development environment"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "migration, typescript, modernization, refactoring, upgrade"
---

# Code Migration

## Overview

Migrate codebases between frameworks, languages, and API versions with automated, incremental transformations. This skill handles JavaScript-to-TypeScript conversions, framework upgrades, deprecated API replacements, and ORM migrations while preserving functionality and maintaining backward compatibility.

## Instructions

When a user asks to migrate or modernize their code, follow these steps:

### Step 1: Assess the migration scope

Analyze the codebase to understand:
- **Source**: Current framework/language version
- **Target**: Desired framework/language version
- **Size**: Number of files and lines affected
- **Dependencies**: Libraries that need updating or replacing
- **Risk areas**: Custom patches, monkey-patches, or framework internals usage

```bash
# Count affected files
find src -name "*.js" | wc -l       # JS→TS migration
grep -rl "React.Component" src/     # Class→hooks migration
grep -rl "Vue.component" src/       # Vue 2 patterns
```

### Step 2: Create a migration plan

Before changing code, produce a migration plan:

```markdown
## Migration Plan: JS → TypeScript

**Files to migrate:** 47
**Estimated effort:** ~2 hours with AI assistance

### Phase 1: Setup (non-breaking)
- Add tsconfig.json with allowJs: true, strict: false, "types": ["node"]
- Install TypeScript and type packages
- Rename entry point to .ts

### Phase 2: Incremental conversion (file by file)
- Rename .js → .ts/.tsx
- Add type annotations to function signatures
- Replace `any` with proper types
- Fix type errors

### Phase 3: Strict mode
- Remove strict: false (strict is the default since TypeScript 6)
- Resolve remaining `any` types
- Add return type annotations
```

### Step 3: Execute the migration file by file

Process files incrementally, verifying each change:

**JavaScript → TypeScript:**

```typescript
// BEFORE: src/utils/api.js
const fetchUser = async (id) => {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) throw new Error('User not found');
  return response.json();
};
module.exports = { fetchUser };

// AFTER: src/utils/api.ts
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export const fetchUser = async (id: string): Promise<User> => {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) throw new Error('User not found');
  return response.json() as Promise<User>;
};
```

**React class → hooks:**

```tsx
// BEFORE
class UserProfile extends React.Component {
  state = { user: null, loading: true };

  componentDidMount() {
    fetchUser(this.props.id).then(user =>
      this.setState({ user, loading: false })
    );
  }

  componentDidUpdate(prevProps) {
    if (prevProps.id !== this.props.id) {
      this.setState({ loading: true });
      fetchUser(this.props.id).then(user =>
        this.setState({ user, loading: false })
      );
    }
  }

  render() {
    if (this.state.loading) return <Spinner />;
    return <div>{this.state.user.name}</div>;
  }
}

// AFTER
function UserProfile({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchUser(id).then(user => {
      setUser(user);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <Spinner />;
  return <div>{user?.name}</div>;
}
```

**Vue 2 → Vue 3 (Options → Composition API):**

```vue
<!-- BEFORE: Vue 2 Options API -->
<script>
export default {
  data() {
    return { count: 0, items: [] };
  },
  computed: {
    total() { return this.items.reduce((s, i) => s + i.price, 0); }
  },
  mounted() { this.fetchItems(); },
  methods: {
    async fetchItems() {
      this.items = await api.getItems();
    }
  }
};
</script>

<!-- AFTER: Vue 3 Composition API -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const count = ref(0);
const items = ref<Item[]>([]);
const total = computed(() => items.value.reduce((s, i) => s + i.price, 0));

async function fetchItems() {
  items.value = await api.getItems();
}

onMounted(fetchItems);
</script>
```

### Step 4: Update dependencies and configuration

```bash
# For JS→TS (current release is TypeScript 7, the native compiler; `tsc` works as before)
npm install -D typescript @types/node @types/react
npx tsc --init

# For Vue 2→3 (@vue/compat is the migration build; remove it when warnings are gone)
npm install vue@3 @vue/compat
npm uninstall vue-template-compiler

# Update import paths, build config (vite/webpack), and aliases
```

**TypeScript 6/7 changed the defaults, which matters for a JS→TS migration.** A fresh `tsc --init` now writes `strict: true`, `types: []`, `verbatimModuleSyntax` and `noUncheckedIndexedAccess`; a missing `rootDir` means the tsconfig folder. On an untouched JS project that gives hundreds of errors on day one, including `Cannot find name 'process'` until `"types": ["node"]` is set. For an incremental migration write the options you want explicitly:

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": false,
    "strict": false,
    "types": ["node"],
    "rootDir": "./src",
    "outDir": "./dist",
    "module": "nodenext",
    "noEmit": false
  },
  "include": ["src"]
}
```

Vue 2 reached end of life on 31 December 2023, and Vue 3.5 is the current line. Rewriting `data`/`methods` to the Composition API is optional: the Options API still works in Vue 3, so migrate the build and breaking changes first and convert components later. Check Vue-ecosystem replacements too: Vuex to Pinia, Vue CLI to Vite, Vue Router 3 to 4.

### Step 5: Verify after migration

After each file or batch:
1. Run the type checker: `npx tsc --noEmit`
2. Run existing tests: `npm test`
3. Run the linter: `npx eslint src/`
4. Build the project: `npm run build`

Report any errors and fix them before proceeding.

## Examples

### Example 1: Migrate an Express.js project from JavaScript to TypeScript

**User request:** "Convert my Express app from JS to TS"

**Actions taken:**
1. Analyzed project: 23 JS files, Express 5, no existing types
2. Installed TypeScript, `@types/express`, `@types/node`, and `tsx` for running source in development
3. Created `tsconfig.json` with `allowJs: true`, `strict: false` and `types: ["node"]` for incremental migration
4. Renamed files `.js` → `.ts` starting from leaf modules (utils, models)
5. Added interfaces for request/response bodies
6. Converted `require` → `import`, `module.exports` → `export`
7. Added type annotations to route handlers

**Result:**
```
Files migrated: 23/23
Type errors fixed: 41
New interfaces created: 8 (User, Product, Order, ApiError, etc.)
Build: ✅ passing
Tests: ✅ 34/34 passing
```

### Example 2: Upgrade React Router v5 to v6 (then v7)

**User request:** "Upgrade our app from React Router 5 to 6"

**Actions taken:**
1. Identified 12 files using React Router v5 APIs
2. Applied transformations:
   - `<Switch>` → `<Routes>`
   - `<Route component={X}>` → `<Route element={<X />}>`
   - `useHistory()` → `useNavigate()`
   - `<Redirect to="/">` → `<Navigate to="/" replace>`
   - Nested routes restructured with `<Outlet />`
3. Updated `react-router-dom` to 6.30 (the last v6 release)

**Before/After:**
```tsx
// v5
<Switch>
  <Route exact path="/" component={Home} />
  <Route path="/users/:id" component={UserProfile} />
  <Redirect to="/" />
</Switch>

// v6
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/users/:id" element={<UserProfile />} />
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

**Result:** 12 files updated, 0 type errors, all 28 tests passing.

**Next step:** React Router 7 is the current stable line (`react-router-dom` 7.x re-exports the same API from the single `react-router` package) and v8 needs Node 22.22+ and React 19.2.7+. Enable the v7 future flags while still on 6.30, then follow the "Upgrading from v6" page in the React Router docs.

## Guidelines

- Always migrate incrementally — one file or module at a time. Never attempt a big-bang rewrite.
- Create the migration plan before writing any code. Share it with the user for approval on large projects.
- For JS→TS, start with `strict: false` and `allowJs: true`, then tighten after all files are converted.
- Preserve existing behavior exactly. Migration should not change functionality.
- Run tests after every file migration. If tests break, fix before proceeding.
- When migrating frameworks, check the official migration guide first (e.g., Vue 2→3, Angular upgrade guide).
- For large codebases (100+ files), suggest migrating in phases across multiple PRs.
- TypeScript can now run without a build step: Node 22.18+ and 24 strip types from `.ts` files natively, but only for erasable syntax (no `enum`, no parameter properties, no `namespace`). Set `erasableSyntaxOnly` if you rely on it.
- Python 2 to 3: `2to3` was removed in Python 3.13; use `futurize`, `pyupgrade` or `ruff check --select UP`.
- Keep `require`/`import` style consistent within each file during migration — don't mix.
- Add type annotations starting with function signatures, then variables, then generics. Don't over-type.
