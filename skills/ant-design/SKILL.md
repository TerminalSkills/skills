---
name: ant-design
description: >-
  Ant Design (antd) is a React component library of 70+ enterprise UI components
  (tables, forms, date pickers, modals, menus) with design-token theming through
  ConfigProvider. Use it to build admin panels, back-office tools and data-heavy
  dashboards: server-paginated tables with filters and bulk actions, validated
  forms, dark or branded themes, and antd inside Next.js without a flash of
  unstyled content. Triggers: "antd table", "Ant Design form validation",
  "customize antd theme", "antd dark mode", "antd with Next.js App Router",
  "upgrade antd 5 to 6".
license: Apache-2.0
compatibility: "antd 6.x; React 18 or 19; Node.js 16+ for the app, Node.js 20+ for the optional @ant-design/cli"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["react", "antd", "component-library", "admin-panel", "design-tokens"]
  repository: https://github.com/ant-design/ant-design
---
# Ant Design — Enterprise React Components for Data-Heavy Apps

## Overview

Ant Design (npm package `antd`) is an enterprise-class design language and React UI library. Its strength is dense business screens: `Table` with sorting, filtering, row selection and pagination built in; `Form` with a field store, validation rules and watchers; plus date pickers, cascaders, trees, drawers and menus. Styling is CSS-in-JS driven by design tokens, so a brand color or dark mode is one `ConfigProvider` prop instead of a stylesheet rewrite.

The current major is **v6** (6.6.x at the time of writing). v6 needs React 18 or newer, uses CSS variables by default, drops IE, and renames many props (old names still work with console warnings until v7).

## Instructions

### Installation

```bash
npm install antd
# icons are a separate package; keep its major equal to antd's
npm install @ant-design/icons@6
```

`dayjs` ships as a dependency of antd and is what `DatePicker` returns. Components are tree-shaken from the ES build, so `import { Button, Table } from 'antd'` is the normal import; no babel plugin is needed.

Optional, for agents: the official `@ant-design/cli` answers API questions offline for the exact antd version in the project and lints for deprecated props.

```bash
npx @ant-design/cli info Table          # props, types, defaults, "since" version
npx @ant-design/cli token Table         # component-level design tokens
npx @ant-design/cli lint ./src          # deprecated APIs, a11y, usage issues
npx @ant-design/cli doctor              # duplicate antd/dayjs, React compat, SSR setup
npx @ant-design/cli migrate 5 6         # checklist for a major upgrade
```

Add `--format json` for machine-readable output. Set `NO_UPDATE_CHECK=1` in CI to skip its update check.

### App shell: ConfigProvider + App

Wrap the app once. `ConfigProvider` carries theme, locale and default size; `App` makes `message`, `notification` and `modal` inherit that context through `App.useApp()`.

```tsx
'use client';
import type { PropsWithChildren } from 'react';
import { App, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import { brandTheme } from './theme';

export default function Providers({ children }: PropsWithChildren) {
  return (
    <ConfigProvider theme={brandTheme} locale={enUS} componentSize="medium">
      <App>{children}</App>
    </ConfigProvider>
  );
}
```

Inside components call `const { message, modal, notification } = App.useApp();`. The static `message.success()` / `Modal.confirm()` functions ignore `ConfigProvider`, so a themed app shows unthemed toasts if you use them.

### Theming with design tokens

```ts
import type { ThemeConfig } from 'antd';
import { theme } from 'antd';

export const brandTheme: ThemeConfig = {
  algorithm: [theme.darkAlgorithm, theme.compactAlgorithm],
  token: {
    colorPrimary: '#0f766e',       // seed token: derives hover/active/bg shades
    borderRadius: 4,
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  components: {
    Table: { headerBg: '#0b2a27', rowHoverBg: '#12332f' },
    Button: { primaryShadow: 'none' },
  },
};
```

- Seed tokens (`colorPrimary`, `borderRadius`, `fontSize`) feed the algorithm; override map/alias tokens only when a derived value is wrong.
- Algorithms: `theme.defaultAlgorithm`, `theme.darkAlgorithm`, `theme.compactAlgorithm`, combinable in an array. Swap them at runtime for a dark-mode toggle.
- Nest another `ConfigProvider` to theme one region; unchanged tokens inherit from the parent.
- Read tokens in your own components with `const { token } = theme.useToken();`, or outside React with `theme.getDesignToken(brandTheme)`.
- Discover component token names with `npx @ant-design/cli token Table` rather than guessing.
- Pass `{}` instead of `undefined` when toggling `theme` off, otherwise the subtree remounts.

### Forms

Use `Form.useForm()` for the instance, `name` on each `Form.Item` to bind a field, `rules` for validation, and `onFinish` for already-validated values. Do not set `value`/`defaultValue` on inputs inside `Form.Item`; use `initialValues` and `form.setFieldsValue()`.

```tsx
const [form] = Form.useForm<RefundValues>();
const reason = Form.useWatch('reason', form);   // re-renders when the field changes

<Form<RefundValues> form={form} layout="vertical" initialValues={{ reason: 'duplicate' }} onFinish={onFinish}>
  <Form.Item label="Order ID" name="orderId"
    rules={[{ required: true, message: 'Enter the order ID' }, { pattern: /^ORD-\d{6}$/, message: 'Format: ORD-123456' }]}>
    <Input />
  </Form.Item>
</Form>
```

Other instance methods: `validateFields()`, `resetFields()`, `setFieldValue(name, value)`. `Form.List` handles repeatable groups; in v6 `onFinish` only includes list items that have a registered `Form.Item`.

### Tables

Type columns with `TableColumnsType<Row>`, always set `rowKey`, and for server data make the table controlled: pass `pagination.current/pageSize/total` and translate `onChange(pagination, filters, sorter)` into a request. Setting `sorter: true` on a column (instead of a compare function) tells antd the server sorts. `rowSelection={{ selectedRowKeys, onChange }}` adds checkboxes for bulk actions; `virtual` renders thousands of rows without pagination, but only when both `scroll.x` and `scroll.y` are numbers, e.g. `scroll={{ x: 1200, y: 600 }}`.

### Next.js

App Router: install `@ant-design/nextjs-registry` and wrap `children` in `<AntdRegistry>` in `app/layout.tsx`; it inlines first-screen styles so pages do not flash unstyled. Put antd usage in `'use client'` files: dotted sub-components such as `Typography.Title` or `Select.Option` fail during prerender when used directly in a server component.

```tsx
import { AntdRegistry } from '@ant-design/nextjs-registry';
import Providers from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AntdRegistry>
          <Providers>{children}</Providers>
        </AntdRegistry>
      </body>
    </html>
  );
}
```

Pages Router: use `createCache`, `extractStyle` and `StyleProvider` from `@ant-design/cssinjs` in `pages/_document.tsx`; its version must match the one antd installs (`npm ls @ant-design/cssinjs`). For zero runtime style generation, v6 offers `theme={{ zeroRuntime: true }}` together with `import 'antd/dist/antd.css'`.

### Locale

`ConfigProvider locale={deDE}` (from `antd/locale/de_DE`) translates component text. Date pickers also need the dayjs locale: `import 'dayjs/locale/de'; dayjs.locale('de');`.

## Examples

### Example 1: Customer table with server-side paging and bulk suspend

**Request:** "Our ops team has 48,000 customers. Build an antd table that pages, sorts and filters on the server, and lets them suspend selected accounts after a confirm."

```tsx
const columns: TableColumnsType<Customer> = [
  { title: 'Name', dataIndex: 'name', sorter: true },
  { title: 'Email', dataIndex: 'email' },
  { title: 'Plan', dataIndex: 'plan',
    filters: [{ text: 'Starter', value: 'starter' }, { text: 'Growth', value: 'growth' }, { text: 'Pro', value: 'pro' }] },
  { title: 'Status', dataIndex: 'status',
    render: (s: Customer['status']) => <Tag color={s === 'active' ? 'green' : 'red'}>{s}</Tag> },
  { title: 'MRR', dataIndex: 'mrr', align: 'right', sorter: true, render: (v: number) => `$${v.toFixed(2)}` },
];

const onChange: TableProps<Customer>['onChange'] = (pagination, filters, sorter) => {
  const s = Array.isArray(sorter) ? sorter[0] : sorter;
  setQuery((prev) => ({
    ...prev,
    page: pagination.current ?? 1,
    pageSize: pagination.pageSize ?? 25,
    sort: s.order ? String(s.field) : undefined,
    // antd reports 'ascend' | 'descend' | null; translate to what the API expects
    order: s.order === 'descend' ? 'desc' : s.order === 'ascend' ? 'asc' : undefined,
    plan: (filters.plan as string[] | null) ?? [],
  }));
};

useEffect(() => {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.pageSize) });
  if (query.sort && query.order) { params.set('sort', query.sort); params.set('order', query.order); }
  query.plan.forEach((p) => params.append('plan', p));
  // e.g. GET /api/customers?page=2&limit=25&sort=mrr&order=desc&plan=pro
  fetch(`/api/customers?${params}`).then((r) => r.json()).then((b) => { setRows(b.items); setTotal(b.total); });
}, [query]);

const suspendSelected = () => modal.confirm({
  title: `Suspend ${selected.length} customers?`,
  okButtonProps: { danger: true },
  onOk: async () => {
    await fetch('/api/customers/suspend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selected }) });
    message.success(`Suspended ${selected.length} customers`);
    setSelected([]);
  },
});

<Table<Customer> rowKey="id" columns={columns} dataSource={rows} loading={loading} size="medium"
  rowSelection={{ selectedRowKeys: selected, onChange: setSelected }}
  pagination={{ current: query.page, pageSize: query.pageSize, total, showSizeChanger: true, showTotal: (t) => `${t} customers` }}
  onChange={onChange} />
```

**Result:** Only 25 rows travel per request. The first click on the MRR header re-queries with `sort=mrr&order=asc`, the second with `order=desc`, a third clears the sort (antd's default cycle; set `sortDirections: ['descend', 'ascend']` on the column to start with descending). The Plan filter sends `plan=pro`, the footer reads "48000 customers", and the danger-styled confirm dialog inherits the app theme because it comes from `App.useApp()`.

### Example 2: Branded dark theme in a Next.js App Router project

**Request:** "Set up antd in our Next.js 15 app with our teal brand color, a compact dark theme, and no flash of unstyled buttons on first load."

```bash
npm install antd @ant-design/nextjs-registry
```

Create `app/theme.ts` with the `brandTheme` from the Theming section, `app/providers.tsx` with the App shell above, and wrap them in `AntdRegistry` in `app/layout.tsx`. Any page that renders antd components starts with `'use client'`.

**Result:** `next build` prerenders the pages with antd's styles inlined in the HTML, so the primary buttons are teal from the first paint, tables use the dark header color, and spacing is the compact variant. The dark algorithm adjusts the seed, so the rendered primary is a darker teal (`--ant-color-primary:#106761` in antd 6.6.5, not `#0f766e`); check it with `theme.getDesignToken(brandTheme).colorPrimary`, and drop `darkAlgorithm` if the exact brand hex matters more than dark mode. Changing `colorPrimary` in one file re-derives hover, active and focus shades everywhere.

### Example 3: Checking a v5 codebase before upgrading to v6

**Request:** "What breaks if we move our back office from antd 5 to 6?"

```bash
npx @ant-design/cli migrate 5 6
npx @ant-design/cli lint ./src --only deprecated
```

**Result:** The migrate command lists global breaking changes (React 18+, `@ant-design/icons@6`, CSS variables, no IE). Lint reports lines such as `Space 'direction' is deprecated`, `Alert 'message' is deprecated ... use 'title'` and `Modal 'destroyOnClose' is deprecated`; the replacements are `orientation`, `title` and `destroyOnHidden`.

## Guidelines

- Write v6 prop names: `Space orientation`, `Alert title`, `Modal destroyOnHidden`, `variant` instead of `bordered`, `popupRender` instead of `dropdownRender`, `size="medium"` instead of `"middle"` on `Table`. Old names still render but warn and disappear in v7. Lint did not flag `Table size="middle"` in testing, so check sizes by hand.
- Upgrade `antd` and `@ant-design/icons` together; icons v6 does not work with antd v5, and two dayjs or cssinjs copies break locales and SSR styles (`cli doctor` detects both).
- Custom CSS that targets internal `.ant-*` DOM nodes is fragile across majors; prefer component tokens or the `classNames`/`styles` semantic props (`cli semantic Table` lists the slots).
- Never fetch all rows and let `Table` sort/filter them client-side for large datasets; use `sorter: true`, controlled pagination and a paginated API.
- Rendering user input through `dangerouslySetInnerHTML` inside table `render` functions is an XSS hole; return plain text or React nodes.
- `@ant-design/cli setup` writes MCP or skill configuration into agent config files; do not run it without the user asking.
- When not to use antd: a marketing site or a design that must look custom (antd has a strong visual identity and a heavy runtime); a Tailwind-first codebase where copy-in components fit better (shadcn-ui); a Material Design product (material-ui); a project that wants a lighter hooks-first kit with CSS modules (mantine).
