---
title: Build an Internal Admin Panel Without Coding from Scratch
slug: build-internal-admin-panel-without-coding-from-scratch
description: Build a production admin panel for managing users, orders, and refunds using Retool for the visual interface connected to PostgreSQL, with Refine as a code-first alternative for teams that need full customization and Git-based version control.
skills: [retool, refine]
category: Internal Tools & Low-Code
tags: [admin-panel, internal-tools, crud, low-code, dashboard]
---

# Build an Internal Admin Panel Without Coding from Scratch

Dana is head of operations at a 25-person e-commerce company. The support team handles 200 customer requests daily — refunds, order modifications, account issues. Currently, they SSH into the database server and run SQL queries. Last week, a junior support agent accidentally ran an UPDATE without a WHERE clause and modified 3,000 orders. The engineering team doesn't have bandwidth to build a proper admin tool.

Dana evaluates two approaches: Retool for a no-code solution that her ops team can build themselves, and Refine for a code-first admin panel that engineering can own long-term.

## Option A: Retool (Visual Builder — Ship in Hours)

The support team needs three capabilities immediately: search customers, view order history, and process refunds. Dana builds this in Retool in a single afternoon.

### Customer Search and Order Management

The main screen has a search bar at the top, a customer table on the left, and order details on the right. Everything is connected with bindings — selecting a customer automatically loads their orders.

```sql
-- Query: searchCustomers
-- Runs when search input changes (debounced)
SELECT
  c.id, c.email, c.name, c.plan,
  c.created_at, c.stripe_customer_id,
  COUNT(o.id) as total_orders,
  COALESCE(SUM(o.amount), 0) / 100.0 as total_spent
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE
  c.email ILIKE '%' || {{ searchInput.value || '' }} || '%'
  OR c.name ILIKE '%' || {{ searchInput.value || '' }} || '%'
  OR c.id::text = {{ searchInput.value || '' }}
GROUP BY c.id
ORDER BY c.created_at DESC
LIMIT 50
```

```sql
-- Query: getCustomerOrders
-- Runs when a customer row is selected
SELECT
  o.id, o.amount / 100.0 as amount, o.currency,
  o.status, o.created_at, o.stripe_charge_id,
  o.refunded_at, o.refund_reason,
  array_agg(oi.product_name) as products
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.customer_id = {{ customersTable.selectedRow.id }}
GROUP BY o.id
ORDER BY o.created_at DESC
```

### Refund Processing with Guardrails

```javascript
// Retool JavaScript query: processRefund
// Runs when the "Process Refund" button is clicked

const order = ordersTable.selectedRow;

// Guardrail 1: Can't refund already-refunded orders
if (order.status === 'refunded') {
  utils.showNotification({
    title: "Already Refunded",
    description: "This order was refunded on " + order.refunded_at,
    notificationType: "warning"
  });
  return;
}

// Guardrail 2: Confirm with details
const confirmed = await utils.openConfirmDialog({
  title: "Process Refund",
  body: `Refund $${order.amount} to ${customersTable.selectedRow.email}?\n\nOrder #${order.id}\nProducts: ${order.products.join(", ")}`,
  confirmText: "Yes, Process Refund",
  cancelText: "Cancel"
});
if (!confirmed) return;

// Step 1: Stripe refund
await stripeRefundQuery.trigger({
  additionalScope: { chargeId: order.stripe_charge_id, amount: order.amount * 100 }
});

// Step 2: Update database
await updateOrderStatusQuery.trigger({
  additionalScope: {
    orderId: order.id,
    status: "refunded",
    reason: refundReasonSelect.value,
    processedBy: currentUser.email
  }
});

// Step 3: Audit log
await insertAuditLogQuery.trigger({
  additionalScope: {
    action: "refund_processed",
    entity: "order",
    entityId: order.id,
    performedBy: currentUser.email,
    details: JSON.stringify({
      amount: order.amount,
      reason: refundReasonSelect.value,
      stripeChargeId: order.stripe_charge_id
    })
  }
});

// Step 4: Refresh data
utils.showNotification({ title: "Refund Processed", notificationType: "success" });
await getCustomerOrders.trigger();
```

Dana finishes the Retool app in 4 hours. The support team stops using SQL the next morning.

## Option B: Refine (Code-First — Own It Long-Term)

Six months later, the team has outgrown Retool. They need custom business logic, complex multi-step workflows, and full version control. The engineering team rebuilds the admin panel with Refine — a React framework that generates CRUD interfaces from their existing API.

```tsx
// src/pages/orders/list.tsx — Order management with Refine
import { useTable, useSelect, ShowButton, EditButton, DeleteButton } from "@refinedev/antd";
import { Table, Tag, Space, Input, DatePicker, Select, Card, Statistic, Row, Col } from "antd";
import { useCustom } from "@refinedev/core";

export const OrderList: React.FC = () => {
  // useTable handles data fetching, pagination, sorting, and filtering
  const { tableProps, searchFormProps } = useTable({
    resource: "orders",
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    filters: {
      permanent: [{ field: "archived", operator: "eq", value: false }],
    },
    meta: {
      // Include customer data in the query (Refine passes to data provider)
      populate: ["customer", "items"],
    },
  });

  // Fetch dashboard stats
  const { data: stats } = useCustom({
    url: "/api/orders/stats",
    method: "get",
  });

  return (
    <>
      {/* Dashboard stats */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card><Statistic title="Today's Orders" value={stats?.data?.todayCount ?? 0} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="Today's Revenue" value={stats?.data?.todayRevenue ?? 0} prefix="$" precision={2} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="Pending Refunds" value={stats?.data?.pendingRefunds ?? 0} valueStyle={{ color: "#cf1322" }} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="Avg Order Value" value={stats?.data?.avgOrderValue ?? 0} prefix="$" precision={2} /></Card>
        </Col>
      </Row>

      {/* Order table with auto-fetching and pagination */}
      <Table {...tableProps} rowKey="id" scroll={{ x: 1200 }}>
        <Table.Column dataIndex="id" title="Order #" width={100} />
        <Table.Column
          dataIndex={["customer", "email"]}
          title="Customer"
          filterDropdown={() => <Input.Search placeholder="Search email..." />}
        />
        <Table.Column
          dataIndex="amount"
          title="Amount"
          render={(v) => `$${(v / 100).toFixed(2)}`}
          sorter
        />
        <Table.Column
          dataIndex="status"
          title="Status"
          render={(status) => {
            const colors = { paid: "green", pending: "blue", refunded: "red", failed: "orange" };
            return <Tag color={colors[status]}>{status}</Tag>;
          }}
          filters={[
            { text: "Paid", value: "paid" },
            { text: "Pending", value: "pending" },
            { text: "Refunded", value: "refunded" },
          ]}
        />
        <Table.Column dataIndex="created_at" title="Date" render={(d) => new Date(d).toLocaleDateString()} sorter />
        <Table.Column
          title="Actions"
          render={(_, record: any) => (
            <Space>
              <ShowButton size="small" recordItemId={record.id} />
              {record.status === "paid" && (
                <RefundButton orderId={record.id} amount={record.amount} />
              )}
            </Space>
          )}
        />
      </Table>
    </>
  );
};
```

The Refine version lives in the same Git repo as the API. When the API changes, the admin panel updates in the same PR. The team writes unit tests for custom business logic (refund validation, audit logging) — something that wasn't possible with Retool.

## When to Choose Which

Retool works best when the ops team needs a tool today and can't wait for engineering. The drag-and-drop builder is fast — Dana shipped a working admin panel in 4 hours. But as complexity grows (custom workflows, multi-step processes, complex permissions), Retool's JavaScript becomes harder to maintain than actual code.

Refine works best when engineering owns the tool and needs full control — version control, testing, custom components, and deployment to their own infrastructure. The tradeoff is speed: the Refine version took 2 weeks instead of 4 hours.

The common pattern: start with Retool for immediate relief, rebuild in Refine when the tool becomes critical infrastructure. The SQL queries and business logic from Retool translate directly to Refine's data provider — nothing is wasted.
