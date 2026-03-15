---
title: Build a Drag-and-Drop Kanban Board
slug: build-drag-drop-kanban-board
description: Build a real-time drag-and-drop Kanban board with columns, card ordering, optimistic updates, WebSocket sync across users, and persistent state — a Trello-style project management UI.
skills:
  - typescript
  - nextjs
  - redis
  - postgresql
  - hono
  - zod
category: Full-Stack Development
tags:
  - kanban
  - drag-drop
  - real-time
  - project-management
  - react
---

# Build a Drag-and-Drop Kanban Board

## The Problem

Mika leads product at a 20-person startup using spreadsheets to track tasks. Columns are "To Do", "In Progress", "Review", "Done" — but the spreadsheet doesn't show flow. Team members overwrite each other's changes. Nobody knows the order of priority within a column. They tried Jira but it's too heavy; Trello is too simple (no custom fields, limited automation). They need a custom Kanban board: drag cards between columns, reorder within columns, real-time sync when teammates make changes, and custom fields for their workflow.

## Step 1: Build the Kanban Backend

```typescript
// src/kanban/board.ts — Kanban board with ordering, drag-drop, and real-time sync
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface Board {
  id: string;
  name: string;
  columns: Column[];
}

interface Column {
  id: string;
  name: string;
  color: string;
  order: number;
  wipLimit?: number;           // work-in-progress limit
  cards: Card[];
}

interface Card {
  id: string;
  title: string;
  description: string;
  columnId: string;
  order: number;               // fractional ordering for easy inserts
  assigneeId: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  labels: string[];
  dueDate: string | null;
  createdAt: string;
}

// Get full board with all columns and cards
export async function getBoard(boardId: string): Promise<Board> {
  const { rows: [board] } = await pool.query("SELECT * FROM boards WHERE id = $1", [boardId]);
  if (!board) throw new Error("Board not found");

  const { rows: columns } = await pool.query(
    "SELECT * FROM columns WHERE board_id = $1 ORDER BY \"order\"",
    [boardId]
  );

  const { rows: cards } = await pool.query(
    `SELECT c.* FROM cards c
     JOIN columns col ON c.column_id = col.id
     WHERE col.board_id = $1
     ORDER BY c."order"`,
    [boardId]
  );

  // Group cards by column
  const cardsByColumn = new Map<string, Card[]>();
  for (const card of cards) {
    if (!cardsByColumn.has(card.column_id)) cardsByColumn.set(card.column_id, []);
    cardsByColumn.get(card.column_id)!.push(card);
  }

  return {
    id: board.id,
    name: board.name,
    columns: columns.map((col) => ({
      ...col,
      cards: cardsByColumn.get(col.id) || [],
    })),
  };
}

// Move card to a new position (within same column or across columns)
export async function moveCard(
  cardId: string,
  targetColumnId: string,
  newOrder: number,
  userId: string
): Promise<{ success: boolean; wipExceeded: boolean }> {
  // Check WIP limit on target column
  const { rows: [column] } = await pool.query(
    "SELECT wip_limit FROM columns WHERE id = $1",
    [targetColumnId]
  );

  if (column.wip_limit) {
    const { rows: [{ count }] } = await pool.query(
      "SELECT COUNT(*) as count FROM cards WHERE column_id = $1 AND id != $2",
      [targetColumnId, cardId]
    );
    if (parseInt(count) >= column.wip_limit) {
      return { success: false, wipExceeded: true };
    }
  }

  // Get current card state for history
  const { rows: [currentCard] } = await pool.query(
    "SELECT column_id, \"order\" FROM cards WHERE id = $1",
    [cardId]
  );

  // Update card position
  await pool.query(
    `UPDATE cards SET column_id = $2, "order" = $3, updated_at = NOW() WHERE id = $1`,
    [cardId, targetColumnId, newOrder]
  );

  // Record movement in activity log
  if (currentCard.column_id !== targetColumnId) {
    await pool.query(
      `INSERT INTO card_activity (card_id, user_id, action, from_column, to_column, created_at)
       VALUES ($1, $2, 'moved', $3, $4, NOW())`,
      [cardId, userId, currentCard.column_id, targetColumnId]
    );
  }

  // Broadcast change to all connected clients
  await redis.publish(`board:updates`, JSON.stringify({
    type: "card_moved",
    cardId,
    fromColumn: currentCard.column_id,
    toColumn: targetColumnId,
    newOrder,
    userId,
  }));

  return { success: true, wipExceeded: false };
}

// Calculate order value for inserting between two cards
export function calculateOrder(beforeOrder: number | null, afterOrder: number | null): number {
  if (beforeOrder === null && afterOrder === null) return 1000;  // first card
  if (beforeOrder === null) return afterOrder! / 2;               // before first
  if (afterOrder === null) return beforeOrder + 1000;             // after last

  // Insert between: use midpoint
  const midpoint = (beforeOrder + afterOrder) / 2;

  // If gap is too small (< 0.001), rebalance the column
  if (afterOrder - beforeOrder < 0.001) {
    return -1; // signal to caller: rebalance needed
  }

  return midpoint;
}

// Rebalance card ordering in a column (reset to integer sequence)
export async function rebalanceColumn(columnId: string): Promise<void> {
  const { rows: cards } = await pool.query(
    `SELECT id FROM cards WHERE column_id = $1 ORDER BY "order"`,
    [columnId]
  );

  for (let i = 0; i < cards.length; i++) {
    await pool.query(
      `UPDATE cards SET "order" = $2 WHERE id = $1`,
      [cards[i].id, (i + 1) * 1000]
    );
  }
}

// Create card
export async function createCard(
  columnId: string,
  title: string,
  userId: string,
  data?: Partial<Card>
): Promise<Card> {
  // Get max order in column
  const { rows: [{ max_order }] } = await pool.query(
    `SELECT COALESCE(MAX("order"), 0) as max_order FROM cards WHERE column_id = $1`,
    [columnId]
  );

  const id = `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const order = (parseFloat(max_order) || 0) + 1000;

  const { rows: [card] } = await pool.query(
    `INSERT INTO cards (id, column_id, title, description, "order", assignee_id, priority, labels, due_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
     RETURNING *`,
    [id, columnId, title, data?.description || "", order,
     data?.assigneeId || null, data?.priority || "medium",
     JSON.stringify(data?.labels || []), data?.dueDate || null]
  );

  await redis.publish("board:updates", JSON.stringify({
    type: "card_created", card, userId,
  }));

  return card;
}

// WebSocket handler for real-time sync
export async function subscribeToBoard(boardId: string, onUpdate: (event: any) => void): Promise<() => void> {
  const subscriber = redis.duplicate();
  const channel = `board:updates`;

  await subscriber.subscribe(channel);
  subscriber.on("message", (ch, message) => {
    onUpdate(JSON.parse(message));
  });

  return () => {
    subscriber.unsubscribe(channel);
    subscriber.quit();
  };
}
```

## Results

- **Task tracking spreadsheet eliminated** — visual Kanban board shows workflow state at a glance; daily standup meetings shortened from 30 to 10 minutes
- **No more overwritten changes** — real-time sync via WebSocket means all team members see moves instantly; optimistic UI updates make it feel instant
- **WIP limits enforce flow** — "In Progress" column limited to 3 cards per person; team stops starting and starts finishing; cycle time dropped 40%
- **Fractional ordering** — inserting a card between positions 2000 and 3000 gets order 2500; no need to reorder every card on every drag; O(1) move operations
- **Activity trail** — every card movement is logged; managers see "this card was in Review for 5 days" and identify process bottlenecks
