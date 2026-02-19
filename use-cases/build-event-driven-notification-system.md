---
title: Build an Event-Driven Notification System
slug: build-event-driven-notification-system
description: >-
  A SaaS project management tool needs to notify users about task assignments,
  mentions, and deadlines across email, push, and in-app channels. They use
  Novu for multi-channel delivery with subscriber preferences, and Inngest
  for reliable event processing — handling workflow orchestration, digest
  batching, and deadline reminders.
skills:
  - novu
  - inngest
  - nextjs
category: backend
tags:
  - notifications
  - events
  - email
  - push
  - in-app
  - workflows
---

# Build an Event-Driven Notification System

Kai is building a project management SaaS. Users create tasks, assign them to team members, leave comments, and set deadlines. Every action needs to trigger notifications — but the notification requirements are complex:

- Task assignments should fire immediately on all channels (email + in-app + push).
- Comments in active threads should be batched into a 15-minute digest to avoid notification spam.
- Deadline reminders should fire 24 hours and 1 hour before a task is due.
- Users should control which channels they receive each notification type on.

A simple "send email on event" approach won't handle digests, delays, or multi-channel with preferences. Kai combines Inngest (event processing and workflow orchestration) with Novu (multi-channel delivery with subscriber preferences).

## Step 1: Set Up the Event Architecture

Events flow through a clear pipeline: app action → Inngest event → workflow logic → Novu notification delivery.

```typescript
// lib/events.ts — Central event definitions and the Inngest client
// Every user action that might trigger a notification emits an event

import { Inngest } from 'inngest'

export const inngest = new Inngest({ id: 'project-manager' })

// Type-safe event definitions
export type Events = {
  'task/assigned': {
    data: {
      taskId: string
      taskTitle: string
      assigneeId: string
      assigneeName: string
      assignerId: string
      assignerName: string
      projectName: string
      dueDate: string | null
    }
  }
  'task/commented': {
    data: {
      taskId: string
      taskTitle: string
      commenterId: string
      commenterName: string
      commentText: string
      mentionedUserIds: string[]
      projectName: string
    }
  }
  'task/deadline.approaching': {
    data: {
      taskId: string
      taskTitle: string
      assigneeId: string
      dueDate: string
      hoursRemaining: number
    }
  }
}
```

## Step 2: Emit Events from Application Code

```typescript
// app/api/tasks/[id]/assign/route.ts — Task assignment API route
// Emits an event that triggers the notification workflow

import { inngest } from '@/lib/events'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { assigneeId } = await req.json()
  const task = await db.tasks.findById(params.id)
  const assignee = await db.users.findById(assigneeId)
  const assigner = await getAuthenticatedUser(req)

  // Update the task in the database
  await db.tasks.update(params.id, { assigneeId })

  // Emit event — Inngest handles everything from here
  await inngest.send({
    name: 'task/assigned',
    data: {
      taskId: task.id,
      taskTitle: task.title,
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      assignerId: assigner.id,
      assignerName: assigner.name,
      projectName: task.project.name,
      dueDate: task.dueDate,
    },
  })

  return Response.json({ success: true })
}
```

The API route doesn't know or care about notifications. It updates the database and emits an event. This decoupling means you can add new notification types, change channels, or modify batching logic without touching any API code.

## Step 3: Build Notification Workflows with Inngest

```typescript
// inngest/functions/task-assigned.ts — Workflow for task assignment notifications
// Sends immediate notification + schedules deadline reminders if task has a due date

import { inngest } from '@/lib/events'
import { novu } from '@/lib/novu'

export const taskAssignedWorkflow = inngest.createFunction(
  { id: 'task-assigned-notification', retries: 3 },
  { event: 'task/assigned' },
  async ({ event, step }) => {
    const { data } = event

    // Step 1: Send immediate notification via Novu (all channels)
    await step.run('notify-assignee', async () => {
      await novu.trigger('task-assigned', {
        to: { subscriberId: data.assigneeId },
        payload: {
          taskTitle: data.taskTitle,
          assignerName: data.assignerName,
          projectName: data.projectName,
          taskUrl: `https://app.example.com/tasks/${data.taskId}`,
        },
      })
    })

    // Step 2: If there's a deadline, schedule reminders
    if (data.dueDate) {
      const dueDate = new Date(data.dueDate)
      const now = new Date()

      // 24-hour reminder (only if due date is more than 25 hours away)
      const twentyFourHoursBefore = new Date(dueDate.getTime() - 24 * 60 * 60 * 1000)
      if (twentyFourHoursBefore > now) {
        await step.sleepUntil('wait-for-24h-reminder', twentyFourHoursBefore)

        await step.run('send-24h-reminder', async () => {
          // Check if task is still assigned and not completed
          const task = await db.tasks.findById(data.taskId)
          if (task.assigneeId === data.assigneeId && task.status !== 'completed') {
            await novu.trigger('deadline-reminder', {
              to: { subscriberId: data.assigneeId },
              payload: {
                taskTitle: data.taskTitle,
                hoursRemaining: 24,
                dueDate: data.dueDate,
                taskUrl: `https://app.example.com/tasks/${data.taskId}`,
              },
            })
          }
        })
      }

      // 1-hour reminder
      const oneHourBefore = new Date(dueDate.getTime() - 60 * 60 * 1000)
      if (oneHourBefore > now) {
        await step.sleepUntil('wait-for-1h-reminder', oneHourBefore)

        await step.run('send-1h-reminder', async () => {
          const task = await db.tasks.findById(data.taskId)
          if (task.assigneeId === data.assigneeId && task.status !== 'completed') {
            await novu.trigger('deadline-urgent', {
              to: { subscriberId: data.assigneeId },
              payload: {
                taskTitle: data.taskTitle,
                hoursRemaining: 1,
                taskUrl: `https://app.example.com/tasks/${data.taskId}`,
              },
            })
          }
        })
      }
    }
  }
)
```

The `step.sleepUntil` calls are the key insight — Inngest handles the scheduling durably. The function suspends (consuming no resources) and resumes exactly when the deadline approaches. Each step checks if the task is still relevant before sending.

## Step 4: Comment Digest (Batching)

```typescript
// inngest/functions/comment-digest.ts — Batch comments into 15-minute digests
// Prevents notification spam when a thread gets active discussion

import { inngest } from '@/lib/events'
import { novu } from '@/lib/novu'

export const commentDigest = inngest.createFunction(
  {
    id: 'comment-digest',
    // Debounce: wait 15 minutes after the last comment before processing
    // If new comments arrive during the window, the timer resets
    debounce: { period: '15m', key: 'event.data.taskId' },
  },
  { event: 'task/commented' },
  async ({ events, step }) => {
    /**
     * Receives a batch of comments on the same task (collected over 15 minutes).
     * Sends a single digest notification instead of one per comment.
     */
    // events is an array of all comments in the debounce window
    const taskId = events[0].data.taskId
    const taskTitle = events[0].data.taskTitle
    const projectName = events[0].data.projectName

    // Collect unique commenters and their comments
    const comments = events.map(e => ({
      author: e.data.commenterName,
      text: e.data.commentText,
    }))

    // Find all users who should be notified (task assignee + mentioned users)
    const notifyUserIds = new Set<string>()
    for (const event of events) {
      // Get task assignee
      const task = await db.tasks.findById(taskId)
      if (task.assigneeId) notifyUserIds.add(task.assigneeId)

      // Add mentioned users
      event.data.mentionedUserIds.forEach(id => notifyUserIds.add(id))
    }

    // Remove commenters from notification list (don't notify yourself)
    const commenterIds = new Set(events.map(e => e.data.commenterId))
    const recipientIds = [...notifyUserIds].filter(id => !commenterIds.has(id))

    // Send digest via Novu
    await step.run('send-digest', async () => {
      for (const userId of recipientIds) {
        await novu.trigger('comment-digest', {
          to: { subscriberId: userId },
          payload: {
            taskTitle,
            projectName,
            commentCount: comments.length,
            comments: comments.slice(0, 5),    // show first 5 in preview
            taskUrl: `https://app.example.com/tasks/${taskId}`,
          },
        })
      }
    })
  }
)
```

## Step 5: Add the In-App Notification Center

```tsx
// components/NotificationCenter.tsx — In-app notification bell using Novu React SDK
'use client'
import { Inbox } from '@novu/react'
import { useRouter } from 'next/navigation'

export function NotificationCenter({ userId }: { userId: string }) {
  const router = useRouter()

  return (
    <Inbox
      applicationIdentifier={process.env.NEXT_PUBLIC_NOVU_APP_ID!}
      subscriberId={userId}
      appearance={{
        elements: {
          notification: { borderRadius: '8px' },
        },
      }}
      onNotificationClick={(notification) => {
        // Navigate to the relevant page when user clicks a notification
        if (notification.redirect?.url) {
          router.push(notification.redirect.url)
        }
      }}
    />
  )
}
```

The Novu `<Inbox>` component handles everything: unread count badge, notification list with read/unread state, and real-time updates via WebSocket. Users see new notifications appear instantly without page refresh.

## Step 6: Register Everything

```typescript
// app/api/inngest/route.ts — Inngest endpoint serving all workflow functions
import { serve } from 'inngest/next'
import { inngest } from '@/lib/events'
import { taskAssignedWorkflow } from '@/inngest/functions/task-assigned'
import { commentDigest } from '@/inngest/functions/comment-digest'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [taskAssignedWorkflow, commentDigest],
})
```

The result: task assignments fire instantly on all channels (with user-controlled preferences), comments batch into 15-minute digests so active threads don't spam, and deadline reminders fire at exactly 24h and 1h before due dates — even if the server restarts between scheduling and firing. The notification logic lives entirely in workflow code, decoupled from the application's API layer.
