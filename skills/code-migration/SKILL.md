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
  version: "1.0.0"
  category: development
  tags: ["migration", "typescript", "modernization", "refactoring", "upgrade"]
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
- Add tsconfig.json with allowJs: true
- Install TypeScript and type packages
- Rename entry point to .ts

### Phase 2: Incremental conversion (file by file)
- Rename .js → .ts/.tsx
- Add type annotations to function signatures
- Replace `any` with proper types
- Fix type errors

### Phase 3: Strict mode
- Enable strict: true in tsconfig
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
# For JS→TS
npm install -D typescript @types/node @types/react
npx tsc --init

# For Vue 2→3
npm install vue@3 @vue/compiler-sfc
npm uninstall vue-template-compiler

# Update import paths, build config (vite/webpack), and aliases
```

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
1. Analyzed project: 23 JS files, Express 4.18, no existing types
2. Installed TypeScript, `@types/express`, `@types/node`, `ts-node`
3. Created `tsconfig.json` with `allowJs: true` for incremental migration
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

### Example 2: Update deprecated React Router v5 to v6

**User request:** "Upgrade our app from React Router 5 to 6"

**Actions taken:**
1. Identified 12 files using React Router v5 APIs
2. Applied transformations:
   - `<Switch>` → `<Routes>`
   - `<Route component={X}>` → `<Route element={<X />}>`
   - `useHistory()` → `useNavigate()`
   - `<Redirect to="/">` → `<Navigate to="/" replace>`
   - Nested routes restructured with `<Outlet />`
3. Updated `react-router-dom` to v6.20

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

## Guidelines

- Always migrate incrementally — one file or module at a time. Never attempt a big-bang rewrite.
- Create the migration plan before writing any code. Share it with the user for approval on large projects.
- For JS→TS, start with `strict: false` and `allowJs: true`, then tighten after all files are converted.
- Preserve existing behavior exactly. Migration should not change functionality.
- Run tests after every file migration. If tests break, fix before proceeding.
- When migrating frameworks, check the official migration guide first (e.g., Vue 2→3, Angular upgrade guide).
- Handle deprecated APIs by checking the library's changelog for the recommended replacement.
- For large codebases (100+ files), suggest migrating in phases across multiple PRs.
- Keep `require`/`import` style consistent within each file during migration — don't mix.
- Add type annotations starting with function signatures, then variables, then generics. Don't over-type.
