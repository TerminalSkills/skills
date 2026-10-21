---
name: refine
description: >-
  Build data-intensive React applications with Refine. Use when a user asks to create admin panels, dashboards, or CRUD interfaces using Refine with REST, GraphQL, or custom data providers and Ant Design or Material UI.
license: Apache-2.0
compatibility: "Node.js 20+, React 18 or 19, @refinedev/core 5.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/refinedev/refine
  category: development
  tags: ["admin-panel", "crud", "react", "headless", "data-provider"]
---
# Refine — React Framework for Admin Panels

## Overview

Refine is an open-source React framework for building data-intensive applications such as admin panels, dashboards, and internal tools. It is headless: it provides data fetching, auth, access control, and routing hooks, and you choose the UI library (Ant Design, Material UI, Chakra UI, Mantine, or your own).

This skill targets the current major version: `@refinedev/core` 5.x with `@refinedev/antd` 6.x, `@refinedev/react-router` 2.x (React Router 7), `@tanstack/react-query` 5 and antd 5. Code written for Refine 4 differs in a few places, listed under "Upgrading from 4.x".

## Instructions

### Quick Start

```bash
npm create refine-app@latest
```

The interactive scaffolder asks for the project name, the build tool (Vite or Next.js), the UI library, the data provider (REST, GraphQL, Supabase, Strapi and others) and the auth provider, then writes a working app. Start it with `npm run dev`.

### Resource Definition

```tsx
// src/App.tsx — resources, router and layout
import { Refine } from "@refinedev/core";
import { ThemedLayout, ErrorComponent, useNotificationProvider } from "@refinedev/antd";
import dataProvider from "@refinedev/simple-rest";
import routerProvider, { NavigateToResource } from "@refinedev/react-router";
import { BrowserRouter, Routes, Route, Outlet } from "react-router";
import { App as AntdApp } from "antd";
import "@refinedev/antd/dist/reset.css";
import { OrderList } from "./pages/orders/list";

export default function App() {
  return (
    <BrowserRouter>
      <AntdApp>
        <Refine
          dataProvider={dataProvider("https://api.shopfront.dev/v1")}
          routerProvider={routerProvider}
          notificationProvider={useNotificationProvider}
          options={{ syncWithLocation: true }}
          resources={[
            {
              name: "orders",
              list: "/orders",
              show: "/orders/show/:id",
              edit: "/orders/edit/:id",
              create: "/orders/create",
              meta: { label: "Orders" },
            },
          ]}
        >
          <Routes>
            <Route element={<ThemedLayout><Outlet /></ThemedLayout>}>
              <Route index element={<NavigateToResource />} />
              <Route path="/orders" element={<OrderList />} />
              <Route path="*" element={<ErrorComponent />} />
            </Route>
          </Routes>
        </Refine>
      </AntdApp>
    </BrowserRouter>
  );
}
```

In v5 a resource's `list`, `show`, `edit` and `create` are route strings only; the page components belong in your router, as above. Layout and menu icons are set with `meta.icon`.

### List Page with Filtering

```tsx
// src/pages/orders/list.tsx — table with server-side sorting, filtering, paging
import { useTable, useSelect, List, ShowButton, EditButton } from "@refinedev/antd";
import { Table, Tag, Select, Space } from "antd";

export const OrderList: React.FC = () => {
  const { tableProps } = useTable({
    resource: "orders",
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    filters: {
      permanent: [{ field: "archived", operator: "eq", value: false }],
    },
    pagination: { pageSize: 20 },
  });

  const { selectProps: statusOptions } = useSelect({
    resource: "order_statuses",
    optionLabel: "name",
    optionValue: "value",
  });

  return (
    <List>
    <Table {...tableProps} rowKey="id">
      <Table.Column dataIndex="id" title="Order #" sorter />
      <Table.Column dataIndex="customer_email" title="Customer" sorter />
      <Table.Column
        dataIndex="amount"
        title="Amount"
        render={(val) => `$${(val / 100).toFixed(2)}`}
        sorter
      />
      <Table.Column
        dataIndex="status"
        title="Status"
        render={(status) => (
          <Tag color={status === "paid" ? "green" : status === "refunded" ? "red" : "blue"}>
            {status}
          </Tag>
        )}
        filterDropdown={(props) => <Select {...statusOptions} {...props} />}
      />
      <Table.Column dataIndex="created_at" title="Date" render={(d) => new Date(d).toLocaleDateString()} sorter />
      <Table.Column
        title="Actions"
        render={(_, record) => (
          <Space>
            <ShowButton recordItemId={record.id} size="small" />
            <EditButton recordItemId={record.id} size="small" />
          </Space>
        )}
      />
    </Table>
    </List>
  );
};
```

### Reading Data with Hooks (v5 shape)

```tsx
import { useList, useOne } from "@refinedev/core";

const { result, query } = useList({ resource: "orders", pagination: { pageSize: 5 } });
// result.data is the array, result.total the count; query.isLoading / query.isError hold request state

const { result: order } = useOne({ resource: "orders", id: 1042 });
// order is the record itself (no more data?.data)
```

### Data Providers

```typescript
// Refine works with any backend via data providers:
// Built-in: REST, GraphQL, Supabase, Strapi, Appwrite, Hasura,
//           NestJS, Airtable, Medusa (more in the refinedev/refine repo and community)
// (packages are versioned per release train; install the one you need and
//  check its peer range against @refinedev/core 5)

// Custom data provider for your API
import { DataProvider } from "@refinedev/core";

export const myDataProvider: DataProvider = {
  getList: async ({ resource, pagination, sorters, filters }) => {
    const params = new URLSearchParams();
    params.set("page", String(pagination?.currentPage ?? 1));
    params.set("limit", String(pagination?.pageSize ?? 20));
    if (sorters?.[0]) params.set("sort", `${sorters[0].field}:${sorters[0].order}`);

    const response = await fetch(`/api/${resource}?${params}`); // add auth headers here
    const { data, total } = await response.json();
    return { data, total };
  },
  getOne: async ({ resource, id }) => {
    const response = await fetch(`/api/${resource}/${id}`);
    const data = await response.json();
    return { data };
  },
  create: async ({ resource, variables }) => {
    const response = await fetch(`/api/${resource}`, {
      method: "POST", body: JSON.stringify(variables),
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    return { data };
  },
  update: async ({ resource, id, variables }) => {
    const response = await fetch(`/api/${resource}/${id}`, {
      method: "PATCH", body: JSON.stringify(variables),
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    return { data };
  },
  deleteOne: async ({ resource, id }) => {
    await fetch(`/api/${resource}/${id}`, { method: "DELETE" });
    return { data: { id } as any };
  },
  getApiUrl: () => "/api",
};
```

### Upgrading from 4.x

```bash
npm i @refinedev/core@5 @refinedev/antd@6 @refinedev/react-router@2 @tanstack/react-query@5
npx @refinedev/codemod@latest refine4-to-refine5
```

- Hooks group state: use `result` for data and `query` / `mutation` for request state (`useList`, `useOne`, `useMany`, `useShow`, `useForm`, `useCreate`, ...). `data?.data` and top-level `isLoading` are gone.
- Pagination option `current` is now `currentPage` (also in custom data providers: `pagination?.currentPage`).
- `ThemedLayoutV2` is now `ThemedLayout`; React Router is v7 and imported from `react-router`, not `react-router-dom`.
- `useNavigation` helpers are removed: use `useGo` (and the router's own back navigation).
- `legacyAuthProvider`, `legacyRouterProvider` and `v3LegacyAuthProviderCompatible` are removed.
- Reference: https://refine.dev/docs/migration-guide/4x-to-5x/

## Examples

**Example 1: Admin panel over an existing REST API**

User: "I have a REST API at https://api.shopfront.dev/v1 with an /orders endpoint. Give me an admin panel with Ant Design."

```bash
npm create refine-app@latest shopfront-admin
cd shopfront-admin && npm run dev
```

Choose Vite, Ant Design, REST data provider. Then list `orders` in `resources` in `src/App.tsx` as shown above and put an `OrderList` page behind `/orders`. Result: a sidebar with Orders, a sortable, filterable, paginated orders table at http://localhost:5173/orders, and the page and sort state kept in the URL because `syncWithLocation` is on. If the API returns totals in a header other than `x-total-count`, write the custom data provider from the section above.

**Example 2: Add login and role-based buttons**

User: "Only admins should see the Delete button on orders, and users must sign in first."

Add `authProvider={authProvider}` to `<Refine>` with `login`, `logout`, `check`, `onError` and `getPermissions` methods that call your API, and `accessControlProvider={{ can: async ({ action }) => ({ can: currentUser.role === "admin" || action !== "delete" }) }}`. Add a `/login` route (for example with `AuthPage` from `@refinedev/antd` and `Authenticated` from `@refinedev/core` around the layout). Result: unauthenticated visits redirect to the login page, and Refine's built-in `DeleteButton` is hidden or disabled for non-admins.

## Guidelines

1. **Headless first** — Refine is UI-agnostic; choose Ant Design for speed, Material UI for familiarity, or go fully custom
2. **Data providers for any backend** — Use built-in providers for Supabase, Strapi, Hasura; write a custom one for your API in ~50 lines
3. **Hooks over components** — Use `useTable`, `useForm`, `useShow` hooks for full control; they handle data fetching, pagination, and caching
4. **Access control** — Implement `accessControlProvider` for role-based UI; Refine hides buttons/pages users can't access
5. **Inferencer for prototyping** — Use `@refinedev/inferencer` to auto-generate CRUD pages from API responses; replace with custom pages later
6. **Audit logs** — Enable `auditLogProvider` to track who changed what; critical for internal tools
7. **Real-time updates** — Add `liveProvider` for WebSocket updates; tables refresh when data changes
8. **i18n built-in** — Use `i18nProvider` for multi-language admin panels; Refine handles label translation
9. **Keep packages on one release train** — mixing 4.x and 5.x `@refinedev/*` packages, or React Query 4 with core 5, fails at build time or at runtime; upgrade them together
