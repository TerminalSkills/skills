---
name: refine
description: >-
  Build data-intensive React applications with Refine. Use when a user asks to create admin panels, dashboards, or CRUD interfaces using Refine with REST, GraphQL, or custom data providers and Ant Design or Material UI.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["admin-panel", "crud", "react", "headless", "data-provider"]
---
# Refine — React Framework for Admin Panels

## Overview

You are an expert in Refine, the open-source React framework for building data-intensive applications like admin panels, dashboards, and internal tools. Refine is headless — it provides data fetching, auth, access control, and routing hooks while you choose the UI library (Ant Design, Material UI, Chakra, Mantine, or custom).

## Instructions

### Quick Start

```bash
npm create refine-app@latest my-admin -- \
  --ui antd \
  --data-provider rest \
  --auth-provider custom
cd my-admin && npm run dev
```

### Resource Definition

```tsx
// src/App.tsx — Define CRUD resources
import { Refine } from "@refinedev/core";
import { ThemedLayoutV2 } from "@refinedev/antd";
import dataProvider from "@refinedev/simple-rest";
import routerProvider from "@refinedev/react-router";

function App() {
  return (
    <Refine
      dataProvider={dataProvider("https://api.example.com")}
      routerProvider={routerProvider}
      resources={[
        {
          name: "orders",
          list: "/orders",
          show: "/orders/:id",
          edit: "/orders/:id/edit",
          create: "/orders/create",
          meta: { icon: <ShoppingCartOutlined />, label: "Orders" },
        },
        {
          name: "users",
          list: "/users",
          show: "/users/:id",
          edit: "/users/:id/edit",
          meta: { icon: <UserOutlined /> },
        },
        {
          name: "analytics",
          list: "/analytics",
          meta: { icon: <BarChartOutlined /> },
        },
      ]}
    >
      <ThemedLayoutV2>
        <Routes>
          <Route path="/orders" element={<OrderList />} />
          <Route path="/orders/:id" element={<OrderShow />} />
          <Route path="/orders/:id/edit" element={<OrderEdit />} />
          <Route path="/users" element={<UserList />} />
        </Routes>
      </ThemedLayoutV2>
    </Refine>
  );
}
```

### List Page with Filtering

```tsx
// src/pages/orders/list.tsx — Auto-generates table with CRUD
import { useTable, useSelect } from "@refinedev/antd";
import { Table, Tag, DatePicker, Select, Space, Button } from "antd";

export const OrderList: React.FC = () => {
  const { tableProps, searchFormProps } = useTable({
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
  );
};
```

### Data Providers

```typescript
// Refine works with any backend via data providers:
// Built-in: REST, GraphQL, Supabase, Strapi, Appwrite, Hasura,
//           NestJS, Airtable, Firebase, Directus, Medusa

// Custom data provider for your API
import { DataProvider } from "@refinedev/core";

export const myDataProvider: DataProvider = {
  getList: async ({ resource, pagination, sorters, filters }) => {
    const params = new URLSearchParams();
    params.set("page", String(pagination?.current ?? 1));
    params.set("limit", String(pagination?.pageSize ?? 20));
    if (sorters?.[0]) params.set("sort", `${sorters[0].field}:${sorters[0].order}`);

    const response = await fetch(`/api/${resource}?${params}`);
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

## Installation

```bash
npm create refine-app@latest        # Interactive setup
# Or manually:
npm install @refinedev/core @refinedev/antd @refinedev/react-router
```

## Examples

**Example 1: User asks to set up refine**

User: "Help me set up refine for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure refine
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with refine**

User: "Create a dashboard using refine"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Headless first** — Refine is UI-agnostic; choose Ant Design for speed, Material UI for familiarity, or go fully custom
2. **Data providers for any backend** — Use built-in providers for Supabase, Strapi, Hasura; write a custom one for your API in ~50 lines
3. **Hooks over components** — Use `useTable`, `useForm`, `useShow` hooks for full control; they handle data fetching, pagination, and caching
4. **Access control** — Implement `accessControlProvider` for role-based UI; Refine hides buttons/pages users can't access
5. **Inferencer for prototyping** — Use `@refinedev/inferencer` to auto-generate CRUD pages from API responses; replace with custom pages later
6. **Audit logs** — Enable `auditLogProvider` to track who changed what; critical for internal tools
7. **Real-time updates** — Add `liveProvider` for WebSocket updates; tables refresh when data changes
8. **i18n built-in** — Use `i18nProvider` for multi-language admin panels; Refine handles label translation
