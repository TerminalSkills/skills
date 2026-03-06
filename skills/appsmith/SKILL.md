---
name: appsmith
description: >-
  Build internal tools, admin panels, and dashboards with Appsmith. Use when a user asks to create CRUD interfaces, connect to databases or APIs with drag-and-drop widgets, write JSObjects for business logic, or self-host Appsmith with Docker or Kubernetes.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["internal-tools", "low-code", "open-source", "admin-panel", "self-hosted"]
---
# Appsmith — Open-Source Internal Tool Builder

## Overview

You are an expert in Appsmith, the open-source low-code platform for building internal tools, admin panels, and dashboards. You help developers connect to databases and APIs, build CRUD interfaces with drag-and-drop widgets, write custom JavaScript, and self-host the platform for full data control.

## Instructions

### Data Queries

```javascript
// PostgreSQL query with bindings
// Appsmith uses {{ }} for dynamic bindings to widget values
SELECT * FROM orders
WHERE status = {{ StatusDropdown.selectedOptionValue }}
  AND created_at BETWEEN {{ DateRange.startDate }} AND {{ DateRange.endDate }}
  AND ({{ SearchInput.text }} = '' OR customer_email ILIKE '%' || {{ SearchInput.text }} || '%')
ORDER BY created_at DESC
LIMIT 50 OFFSET {{ (Table1.pageNo - 1) * 50 }}

// REST API datasource
// URL: https://api.example.com/users/{{ Table1.selectedRow.id }}
// Method: PUT
// Body: {
//   "plan": {{ PlanSelect.selectedOptionValue }},
//   "note": {{ NoteInput.text }}
// }
```

### JavaScript Objects (JSObjects)

```javascript
// JSObject — reusable business logic
export default {
  // Transform query data for charts
  getRevenueByMonth() {
    return OrdersQuery.data.reduce((acc, order) => {
      const month = moment(order.created_at).format("YYYY-MM");
      acc[month] = (acc[month] || 0) + order.amount;
      return acc;
    }, {});
  },

  // Multi-step workflow
  async processRefund() {
    const order = Table1.selectedRow;
    if (!order) {
      showAlert("Select an order first", "warning");
      return;
    }

    const confirmed = await showModal("ConfirmRefundModal");
    if (!confirmed) return;

    // Step 1: Create refund in Stripe
    await StripeRefundAPI.run({ chargeId: order.stripe_charge_id });

    // Step 2: Update order status
    await UpdateOrderQuery.run({
      orderId: order.id,
      status: "refunded",
    });

    // Step 3: Send notification
    await SlackNotifyAPI.run({
      message: `Refund processed for order #${order.id} ($${order.amount})`,
    });

    showAlert("Refund processed successfully", "success");
    await OrdersQuery.run(); // Refresh table
  },

  // Form validation
  validateForm() {
    const errors = {};
    if (!EmailInput.text?.includes("@")) errors.email = "Invalid email";
    if (AmountInput.text <= 0) errors.amount = "Amount must be positive";
    if (!ReasonSelect.selectedOptionValue) errors.reason = "Select a reason";
    return errors;
  },
};
```

### Deployment

```bash
# Self-hosted with Docker (recommended)
curl -L https://bit.ly/docker-compose-appsmith -o docker-compose.yml
docker compose up -d
# Dashboard at http://localhost:80

# Kubernetes with Helm
helm repo add appsmith https://helm.appsmith.com
helm install appsmith appsmith/appsmith -n appsmith --create-namespace
```

### Git Sync

```bash
# Connect Appsmith to Git for version control
# Settings → Git Connection → Connect to Git Repository
# Supports: GitHub, GitLab, Bitbucket

# Workflow:
# 1. Develop on feature branch
# 2. Commit changes from Appsmith UI
# 3. Create PR for review
# 4. Merge → auto-deploy to production instance
```

## Examples

**Example 1: User asks to set up appsmith**

User: "Help me set up appsmith for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure appsmith
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with appsmith**

User: "Create a dashboard using appsmith"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Self-host for security** — Appsmith is open-source; self-host on your infrastructure when data can't leave your network
2. **JSObjects for logic** — Keep business logic in JSObjects, not in widget event handlers; easier to test and reuse
3. **Git sync for teams** — Connect to Git for version control; review app changes in PRs like code
4. **Prepared statements** — Appsmith uses prepared statements by default for SQL; prevents SQL injection
5. **Environments** — Use Appsmith's environment variables for dev/staging/prod database URLs
6. **Granular permissions** — Use role-based access control; limit who can view/edit/run destructive queries
7. **Reusable widgets** — Extract common patterns (search + table + pagination) into reusable templates
8. **Audit trail** — Enable audit logging for compliance; track who did what and when
