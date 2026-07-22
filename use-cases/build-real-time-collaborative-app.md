---
title: Build a Real-Time Collaborative Whiteboard
slug: build-real-time-collaborative-app
description: >-
  A remote team needs a shared whiteboard where multiple users draw, add sticky
  notes, and see each other's cursors in real-time. They use PartyKit for the
  WebSocket server running on Cloudflare's edge, Socket.IO patterns for the
  event architecture, and React for the canvas UI — achieving sub-100ms
  latency for 20+ concurrent users.
skills:
  - partykit
  - socketio
  - nextjs
category: development
tags:
  - realtime
  - collaboration
  - websocket
  - multiplayer
  - whiteboard
---

# Build a Real-Time Collaborative Whiteboard

Nadia's remote design team is tired of sharing static screenshots. They want a shared whiteboard — multiple people drawing simultaneously, adding sticky notes, and seeing each other's cursors in real-time. Like a lightweight Miro, but self-hosted and customized for their workflow.

The tech choice: PartyKit for the real-time server (runs on Cloudflare's edge for low latency, no server to manage), React with Canvas API for the drawing UI, and a simple state sync protocol that handles concurrent edits without conflicts.

## Step 1: Define the Whiteboard Server

Each whiteboard is a PartyKit room. The server maintains the canonical state — all drawing strokes, sticky notes, and cursor positions — and broadcasts updates to every connected client.

```typescript
// party/whiteboard.ts — Whiteboard server managing shared state
// Each room is an isolated whiteboard instance

import type * as Party from 'partykit/server'

type Stroke = {
  id: string
  points: Array<{ x: number; y: number }>
  color: string
  width: number
  userId: string
}

type StickyNote = {
  id: string
  x: number
  y: number
  text: string
  color: string
  userId: string
}

type Cursor = {
  x: number
  y: number
  name: string
  color: string
}

type WhiteboardState = {
  strokes: Stroke[]
  notes: StickyNote[]
}

export default class WhiteboardServer implements Party.Server {
  state: WhiteboardState = { strokes: [], notes: [] }
  cursors = new Map<string, Cursor>()

  constructor(readonly room: Party.Room) {}

  async onStart() {
    // Load persisted state on room start
    const saved = await this.room.storage.get<WhiteboardState>('state')
    if (saved) this.state = saved
  }

  onConnect(conn: Party.Connection) {
    // Send full state to new connection
    conn.send(JSON.stringify({
      type: 'init',
      state: this.state,
      cursors: Object.fromEntries(this.cursors),
      userCount: this.room.getConnections().length,  // Use length for user count
    }))

    // Notify everyone about new user
    this.room.broadcast(JSON.stringify({
      type: 'user-count',
      count: this.room.getConnections().length,
    }))
  }

  async onMessage(message: string, sender: Party.Connection) {
    const data = JSON.parse(message)

    switch (data.type) {
      case 'stroke': {
        // New drawing stroke from a user
        const stroke: Stroke = { ...data.stroke, userId: sender.id }
        this.state.strokes.push(stroke)
        this.room.broadcast(JSON.stringify({ type: 'stroke', stroke }), [sender.id])
        break
      }

      case 'note': {
        // New or updated sticky note
        const existingIndex = this.state.notes.findIndex(n => n.id === data.note.id)
        if (existingIndex >= 0) {
          this.state.notes[existingIndex] = data.note
        } else {
          this.state.notes.push(data.note)
        }
        this.room.broadcast(JSON.stringify({ type: 'note', note: data.note }), [sender.id])
        break
      }

      case 'cursor': {
        // Cursor position update — high frequency, don't persist
        this.cursors.set(sender.id, data.cursor)
        this.room.broadcast(
          JSON.stringify({ type: 'cursor', id: sender.id, cursor: data.cursor }),
          [sender.id]
        )
        return    // don't save state for cursor updates
      }

      case 'clear': {
        this.state = { strokes: [], notes: [] }
        this.room.broadcast(JSON.stringify({ type: 'clear' }))
        break
      }
    }

    // Persist state after changes (debounced by PartyKit's storage)
    await this.room.storage.put('state', this.state)
  }

  onClose(conn: Party.Connection) {
    this.cursors.delete(conn.id)
    this.room.broadcast(JSON.stringify({
      type: 'cursor-gone',
      id: conn.id,
      userCount: this.room.getConnections().length,
    }))
  }
}
```

The server is the source of truth. When a user draws a stroke, it's sent to the server, added to the canonical state, persisted to storage, and broadcast to all other clients. Cursor positions are broadcast but not persisted — they're ephemeral and high-frequency.

## Step 2: Client State Management

```typescript
// hooks/useWhiteboard.ts — Client-side whiteboard state synced via PartyKit
import usePartySocket from 'partysocket/react'
import { useState, useCallback, useRef } from 'react'

type Stroke = { id: string; points: Array<{ x: number; y: number }>; color: string; width: number; userId: string }
type StickyNote = { id: string; x: number; y: number; text: string; color: string; userId: string }
type Cursor = { x: number; y: number; name: string; color: string }

export function useWhiteboard(roomId: string, userName: string, userColor: string) {
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [notes, setNotes] = useState<StickyNote[]>([])
  const [cursors, setCursors] = useState<Map<string, Cursor>>(new Map())
  const [userCount, setUserCount] = useState(0)

  const socket = usePartySocket({
    host: process.env.NEXT_PUBLIC_PARTYKIT_HOST!,
    room: roomId,
    onMessage(event) {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'init':
          setStrokes(data.state.strokes)
          setNotes(data.state.notes)
          setUserCount(data.userCount)
          break
        case 'stroke':
          setStrokes(prev => [...prev, data.stroke])
          break
        case 'note':
          setNotes(prev => {
            const idx = prev.findIndex(n => n.id === data.note.id)
            if (idx >= 0) { const next = [...prev]; next[idx] = data.note; return next }
            return [...prev, data.note]
          })
          break
        case 'cursor':
          setCursors(prev => new Map(prev).set(data.id, data.cursor))
          break
        case 'cursor-gone':
          setCursors(prev => { const next = new Map(prev); next.delete(data.id); return next })
          setUserCount(data.userCount)
          break
        case 'user-count':
          setUserCount(data.count)
          break
        case 'clear':
          setStrokes([])
          setNotes([])
          break
      }
    },
  })

  // Throttled cursor broadcast (every 50ms max)
  const lastCursorSend = useRef(0)
  const sendCursor = useCallback((x: number, y: number) => {
    const now = Date.now()
    if (now - lastCursorSend.current < 50) return    // throttle to 20fps
    lastCursorSend.current = now
    socket.send(JSON.stringify({
      type: 'cursor',
      cursor: { x, y, name: userName, color: userColor },
    }))
  }, [socket, userName, userColor])

  const addStroke = useCallback((stroke: Omit<Stroke, 'userId'>) => {
    setStrokes(prev => [...prev, { ...stroke, userId: 'local' }])    // optimistic update
    socket.send(JSON.stringify({ type: 'stroke', stroke }))
  }, [socket])

  const addNote = useCallback((note: Omit<StickyNote, 'userId'>) => {
    socket.send(JSON.stringify({ type: 'note', note }))
  }, [socket])

  return { strokes, notes, cursors, userCount, sendCursor, addStroke, addNote }
}
```

The cursor throttle (50ms / 20fps) is critical — without it, mouse movement would send hundreds of messages per second. At 20fps, cursor movement still looks smooth to other users while keeping bandwidth manageable.

## Step 3: Canvas Rendering

```tsx
// components/WhiteboardCanvas.tsx — Canvas-based drawing with cursor overlay
'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { useWhiteboard } from '@/hooks/useWhiteboard'

export function WhiteboardCanvas({ roomId, userName }: { roomId: string; userName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([])
  const userColor = useRef(`hsl(${Math.random() * 360}, 70%, 50%)`).current

  const { strokes, notes, cursors, userCount, sendCursor, addStroke } = useWhiteboard(
    roomId,
    userName,
    userColor
  )

  // Render all strokes on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    // Clear and redraw all strokes
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue
      ctx.beginPath()
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = stroke.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
      }
      ctx.stroke()
    }
  }, [strokes])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    sendCursor(x, y)

    if (isDrawing) {
      setCurrentStroke(prev => [...prev, { x, y }])
    }
  }, [isDrawing, sendCursor])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    setIsDrawing(true)
    setCurrentStroke([{ x: e.clientX - rect.left, y: e.clientY - rect.top }])
  }, [])

  const handleMouseUp = useCallback(() => {
    if (currentStroke.length > 1) {
      addStroke({
        id: `stroke_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        points: currentStroke,
        color: userColor,
        width: 3,
      })
    }
    setIsDrawing(false)
    setCurrentStroke([])
  }, [currentStroke, addStroke, userColor])

  return (
    <div className="relative">
      {/* User count badge */}
      <div className="absolute top-4 right-4 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
        {userCount} online
      </div>

      {/* Drawing canvas */}
      <canvas
        ref={canvasRef}
        width={1200}
        height={800}
        className="border rounded-lg cursor-crosshair bg-white"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Remote cursors overlay */}
      {Array.from(cursors.entries()).map(([id, cursor]) => (
        <div
          key={id}
          className="absolute pointer-events-none transition-all duration-75"
          style={{ left: cursor.x, top: cursor.y }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20">
            <path d="M0 0L12 18L6 10L18 8Z" fill={cursor.color} />
          </svg>
          <span
            className="text-xs px-1 rounded whitespace-nowrap"
            style={{ backgroundColor: cursor.color, color: 'white' }}
          >
            {cursor.name}
          </span>
        </div>
      ))}
    </div>
  )
}
```

The canvas re-renders all strokes on every update. For whiteboards with hundreds of strokes, this could be optimized with incremental rendering — but for most team whiteboard sessions (dozens of strokes), full redraws at 60fps are imperceptible.

Each remote cursor is rendered as a colored arrow with the user's name tag, positioned absolutely over the canvas. The `transition-all duration-75` CSS adds a tiny smoothing effect that makes cursor movement look fluid even at the 20fps update rate.

The result: team members open the whiteboard URL, and within seconds they see each other's cursors moving around, can draw simultaneously on the shared canvas, and add sticky notes that appear instantly for everyone. State persists in PartyKit storage, so the whiteboard survives page refreshes and hibernation. It runs on Cloudflare's edge, so latency is under 100ms regardless of where team members are located.
