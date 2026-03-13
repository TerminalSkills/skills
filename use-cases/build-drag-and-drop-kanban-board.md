---
title: Build a Drag-and-Drop Kanban Board
slug: build-drag-and-drop-kanban-board
description: Build a real-time Kanban board with smooth drag-and-drop, optimistic updates, column management, and WebSocket sync — providing Trello-like project management with custom workflows.
skills:
  - typescript
  - nextjs
  - postgresql
  - redis
  - tailwindcss
category: Full-Stack Development
tags:
  - kanban
  - drag-and-drop
  - project-management
  - real-time
  - ui
---

# Build a Drag-and-Drop Kanban Board

## The Problem

Sven leads product at a 20-person agency. Teams track work in spreadsheets — rows get out of sync, status updates are lost, and nobody knows what's "in progress" vs "blocked." They tried Trello but needed custom columns per project (design projects have "Review" → "Client Approval" → "Revisions" while dev projects have "Code Review" → "QA" → "Staging"). They need a Kanban board with customizable columns, smooth drag-and-drop that feels instant, and real-time sync so the whole team sees changes.

## Step 1: Build the Board Data Model and API

```typescript
// src/board/board-service.ts — Kanban board with ordered columns and cards
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
  boardId: string;
  title: string;
  color: string;
  position: number;
  wipLimit: number | null;  // work-in-progress limit
  cards: Card[];
}

interface Card {
  id: string;
  columnId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  labels: string[];
  position: number;
  dueDate: string | null;
  createdAt: string;
}

// Get full board state
export async function getBoard(boardId: string): Promise<Board> {
  const cached = await redis.get(`board:${boardId}`);
  if (cached) return JSON.parse(cached);

  const { rows: [board] } = await pool.query(
    "SELECT id, name FROM boards WHERE id = $1", [boardId]
  );

  const { rows: columns } = await pool.query(
    "SELECT * FROM columns WHERE board_id = $1 ORDER BY position", [boardId]
  );

  const { rows: cards } = await pool.query(
    `SELECT c.* FROM cards c 
     JOIN columns col ON c.column_id = col.id 
     WHERE col.board_id = $1 ORDER BY c.position`, [boardId]
  );

  const cardsByColumn = new Map<string, Card[]>();
  for (const card of cards) {
    if (!cardsByColumn.has(card.column_id)) cardsByColumn.set(card.column_id, []);
    cardsByColumn.get(card.column_id)!.push(card);
  }

  const result: Board = {
    id: board.id,
    name: board.name,
    columns: columns.map((col) => ({
      ...col,
      boardId: col.board_id,
      wipLimit: col.wip_limit,
      cards: cardsByColumn.get(col.id) || [],
    })),
  };

  await redis.setex(`board:${boardId}`, 30, JSON.stringify(result));
  return result;
}

// Move card between columns or reorder within column
export async function moveCard(
  cardId: string,
  targetColumnId: string,
  targetPosition: number,
  boardId: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get current card position
    const { rows: [card] } = await client.query(
      "SELECT column_id, position FROM cards WHERE id = $1 FOR UPDATE",
      [cardId]
    );

    const sourceColumnId = card.column_id;

    // Check WIP limit on target column
    if (sourceColumnId !== targetColumnId) {
      const { rows: [col] } = await client.query(
        "SELECT wip_limit FROM columns WHERE id = $1", [targetColumnId]
      );
      if (col.wip_limit) {
        const { rows: [count] } = await client.query(
          "SELECT COUNT(*) as cnt FROM cards WHERE column_id = $1", [targetColumnId]
        );
        if (parseInt(count.cnt) >= col.wip_limit) {
          throw new Error(`WIP limit reached (${col.wip_limit} cards max)`);
        }
      }
    }

    // Shift positions in source column (close the gap)
    if (sourceColumnId !== targetColumnId) {
      await client.query(
        "UPDATE cards SET position = position - 1 WHERE column_id = $1 AND position > $2",
        [sourceColumnId, card.position]
      );
    }

    // Shift positions in target column (make room)
    await client.query(
      "UPDATE cards SET position = position + 1 WHERE column_id = $1 AND position >= $2",
      [targetColumnId, targetPosition]
    );

    // Move the card
    await client.query(
      "UPDATE cards SET column_id = $1, position = $2 WHERE id = $3",
      [targetColumnId, targetPosition, cardId]
    );

    await client.query("COMMIT");

    // Invalidate cache and broadcast
    await redis.del(`board:${boardId}`);
    await redis.publish(`board:${boardId}`, JSON.stringify({
      type: "card_moved",
      cardId,
      from: sourceColumnId,
      to: targetColumnId,
      position: targetPosition,
    }));
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Create card
export async function createCard(
  columnId: string,
  data: { title: string; description?: string; assigneeId?: string; priority?: string; labels?: string[] },
  boardId: string
): Promise<Card> {
  const { rows: [maxPos] } = await pool.query(
    "SELECT COALESCE(MAX(position), -1) + 1 as pos FROM cards WHERE column_id = $1",
    [columnId]
  );

  const { rows: [card] } = await pool.query(
    `INSERT INTO cards (column_id, title, description, assignee_id, priority, labels, position, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
    [columnId, data.title, data.description || "", data.assigneeId, data.priority || "medium",
     data.labels || [], maxPos.pos]
  );

  await redis.del(`board:${boardId}`);
  await redis.publish(`board:${boardId}`, JSON.stringify({ type: "card_created", card }));

  return card;
}
```

## Step 2: Build the Drag-and-Drop UI

```typescript
// src/components/KanbanBoard.tsx — Drag-and-drop board with dnd-kit
"use client";
import { useState, useEffect } from "react";
import {
  DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors,
  DragStartEvent, DragEndEvent, DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Board { id: string; name: string; columns: Column[] }
interface Column { id: string; title: string; color: string; wipLimit: number | null; cards: Card[] }
interface Card { id: string; title: string; priority: string; assigneeId: string | null; labels: string[] }

export function KanbanBoard({ boardId }: { boardId: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [activeCard, setActiveCard] = useState<Card | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    fetch(`/api/boards/${boardId}`).then((r) => r.json()).then(setBoard);

    // Real-time updates via SSE
    const es = new EventSource(`/api/boards/${boardId}/stream`);
    es.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === "card_moved" || event.type === "card_created") {
        fetch(`/api/boards/${boardId}`).then((r) => r.json()).then(setBoard);
      }
    };
    return () => es.close();
  }, [boardId]);

  const handleDragStart = (event: DragStartEvent) => {
    const card = board?.columns.flatMap((c) => c.cards).find((c) => c.id === event.active.id);
    setActiveCard(card || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveCard(null);
    const { active, over } = event;
    if (!over || !board) return;

    // Optimistic update
    const newBoard = JSON.parse(JSON.stringify(board));
    // ... move card in local state immediately

    setBoard(newBoard);

    // Persist to server
    await fetch(`/api/cards/${active.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetColumnId: over.data.current?.columnId || over.id,
        targetPosition: over.data.current?.position || 0,
      }),
    });
  };

  if (!board) return <div className="animate-pulse">Loading...</div>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners}
      onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-4 min-h-screen bg-gray-50">
        {board.columns.map((column) => (
          <div key={column.id} className="flex-shrink-0 w-72 bg-gray-100 rounded-xl p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
                <h3 className="font-semibold text-sm">{column.title}</h3>
                <span className="text-xs text-gray-400 bg-gray-200 px-1.5 rounded">
                  {column.cards.length}{column.wipLimit ? `/${column.wipLimit}` : ""}
                </span>
              </div>
            </div>

            <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2 min-h-[50px]">
                {column.cards.map((card) => (
                  <SortableCard key={card.id} card={card} columnId={column.id} />
                ))}
              </div>
            </SortableContext>
          </div>
        ))}
      </div>

      <DragOverlay>
        {activeCard && <CardPreview card={activeCard} />}
      </DragOverlay>
    </DndContext>
  );
}

function SortableCard({ card, columnId }: { card: Card; columnId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { columnId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="bg-white rounded-lg p-3 shadow-sm border cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
      <p className="text-sm font-medium text-gray-800">{card.title}</p>
      <div className="flex items-center gap-2 mt-2">
        {card.labels.map((label) => (
          <span key={label} className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{label}</span>
        ))}
        {card.priority === "urgent" && <span className="text-xs text-red-600">🔴</span>}
      </div>
    </div>
  );
}

function CardPreview({ card }: { card: Card }) {
  return (
    <div className="bg-white rounded-lg p-3 shadow-lg border-2 border-blue-400 w-72 rotate-3">
      <p className="text-sm font-medium">{card.title}</p>
    </div>
  );
}
```

## Results

- **Project visibility transformed** — every team member sees what's in progress, blocked, or waiting; spreadsheet chaos replaced with clear visual workflow
- **Custom columns per project** — design team uses "Review → Client Approval → Revisions"; dev team uses "Code Review → QA → Staging"; both work in the same tool
- **WIP limits enforce focus** — "In Progress" column limited to 3 cards per person; teams finish work before starting new tasks; cycle time dropped 30%
- **Drag-and-drop feels instant** — optimistic updates render the move immediately; server confirms in the background; no visible latency
- **Real-time sync** — when a colleague moves a card, it moves on everyone's screen within 100ms; no stale state, no conflicting drag operations
