---
title: Build an Internal Admin Panel Without Coding from Scratch
slug: build-internal-admin-panel-without-coding-from-scratch
description: >-
  Build a production admin panel for managing users, orders, and refunds using Retool or Refine connected to PostgreSQL.
skills: [retool, refine]
category: development
tags: [admin-panel, internal-tools, crud, low-code, dashboard]
---

# Build an Internal Admin Panel Without Coding from Scratch

Dana is head of operations at a 25-person e-commerce company. Her support team handles 200 customer requests daily — refunds, order modifications, account issues — by SSHing into the database and running raw SQL. Last week, a junior agent ran an UPDATE without a WHERE clause and modified 3,000 orders.

## The Problem

The engineering team does not have bandwidth to build a proper admin tool. Support agents run raw SQL against production, which is slow, error-prone, and dangerous. There are no guardrails on refunds, no audit logs, and no way to limit what each agent can do. Every month brings another near-miss data incident, and the team is one bad query away from a catastrophic mistake.

## The Solution

Dana evaluates two approaches: Retool for a no-code solution her ops team can build in hours, and Refine for a code-first admin panel engineering can own long-term. Both connect to the existing PostgreSQL database.

## Step-by-Step Walkthrough

### 1. Build the Quick Admin Panel in Retool

Dana builds a Retool app in a single afternoon with three capabilities: customer search, order history, and refund processing. The main screen has a search bar, customer table, and order details panel connected with bindings:

```sql
-- Query: searchCustomers (runs on search input change, debounced)
SELECT
  c.id, c.email, c.name, c.plan, c.created_at,
  COUNT(o.id) as total_orders,
  COALESCE(SUM(o.amount), 0) / 100.0 as total_spent
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE c.email ILIKE '%' || {{ searchInput.value }} || '%'
  OR c.name ILIKE '%' || {{ searchInput.value }} || '%'
GROUP BY c.id
ORDER BY c.created_at DESC
LIMIT 50
```

Refund processing includes guardrails: confirmation dialogs showing order details, prevention of double-refunds, Stripe API integration, database status updates, and automatic audit logging with the agent's email.

### 2. Add Refund Guardrails and Audit Logging

```javascript
// Retool JavaScript query: processRefund
const order = ordersTable.selectedRow;

if (order.status === 'refunded') {
  utils.showNotification({
    title: "Already Refunded",
    description: "This order was refunded on " + order.refunded_at,
    notificationType: "warning"
  });
  return;
}

const confirmed = await utils.openConfirmDialog({
  title: "Process Refund",
  body: `Refund $${order.amount} to ${customersTable.selectedRow.email}?`
});
if (!confirmed) return;

await stripeRefundQuery.trigger({
  additionalScope: { chargeId: order.stripe_charge_id }
});
await updateOrderStatusQuery.trigger({
  additionalScope: { orderId: order.id, status: "refunded",
    reason: refundReasonSelect.value, processedBy: currentUser.email }
});
await insertAuditLogQuery.trigger({
  additionalScope: { action: "refund_processed", entityId: order.id,
    performedBy: currentUser.email }
});
```

### 3. Rebuild with Refine for Long-Term Ownership

Six months later, the team outgrows Retool and needs custom workflows, complex permissions, and Git-based version control. Engineering rebuilds with Refine — a React framework that generates CRUD interfaces from existing APIs:

```tsx
// src/pages/orders/list.tsx
import { useTable } from "@refinedev/antd";
import { Table, Tag, Space } from "antd";

export const OrderList: React.FC = () => {
  const { tableProps } = useTable({
    resource: "orders",
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    meta: { populate: ["customer", "items"] },
  });

  return (
    <Table {...tableProps} rowKey="id">
      <Table.Column dataIndex="id" title="Order #" />
      <Table.Column dataIndex={["customer", "email"]} title="Customer" />
      <Table.Column dataIndex="amount" title="Amount"
        render={(v) => `$${(v / 100).toFixed(2)}`} sorter />
      <Table.Column dataIndex="status" title="Status"
        render={(s) => <Tag color={
          {paid:"green", pending:"blue", refunded:"red"}[s]
        }>{s}</Tag>} />
    </Table>
  );
};
```

The Refine version lives in the same Git repo as the API. When the API changes, the admin panel updates in the same PR, with unit tests for refund validation and audit logging.

## Real-World Example

Dana, head of ops at ShopStream (a 25-person e-commerce company), follows this path:

1. She builds the Retool admin panel on a Friday afternoon — customer search, order lookup, and guarded refund processing
2. The support team stops using raw SQL the following Monday morning
3. Over six months, Retool handles 36,000 support requests without a single accidental data modification
4. When the team needs complex multi-step workflows and role-based permissions, engineering rebuilds in Refine over 2 weeks
5. The SQL queries and business logic from Retool translate directly to Refine's data provider — nothing is wasted
6. Accidental data incidents drop from monthly occurrences to zero

## Related Skills

No matching skills are currently available in the marketplace for this use case.
