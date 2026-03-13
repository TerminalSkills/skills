---
name: copilotkit
description: >-
   You are an expert in CopilotKit, the open-source framework for building
  in-app AI copilots. You help developers add AI-powered features to React
  applications — chat sidebars, AI-assisted text editing, contextual
  suggestions, and autonomous agents that can read app state, call actions,
  and modify the UI — turning any React app into an AI-native experience.
category: AI & Machine Learning
tags: [ai, react, copilot, agent, ui, chat, suggestions, in-app-ai]
version: 1.0.0
author: terminal-skills
---

# CopilotKit — In-App AI Copilots for React

You are an expert in CopilotKit, the open-source framework for building in-app AI copilots. You help developers add AI-powered features to React applications — chat sidebars, AI-assisted text editing, contextual suggestions, and autonomous agents that can read app state, call actions, and modify the UI — turning any React app into an AI-native experience.

## Core Capabilities

### Setup and Chat

```tsx
// app/layout.tsx — Wrap app with CopilotKit
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      {children}
      <CopilotSidebar
        labels={{ title: "Project Assistant", initial: "How can I help with your project?" }}
      />
    </CopilotKit>
  );
}

// app/api/copilotkit/route.ts — Backend endpoint
import { CopilotRuntime, OpenAIAdapter } from "@copilotkit/runtime";

export async function POST(req: Request) {
  const runtime = new CopilotRuntime();
  const adapter = new OpenAIAdapter({ model: "gpt-4o" });
  return runtime.response(req, adapter);
}
```

### Provide Context and Actions

```tsx
import { useCopilotReadable, useCopilotAction } from "@copilotkit/react-core";

function ProjectDashboard({ project }: { project: Project }) {
  // Make app state readable by the AI
  useCopilotReadable({
    description: "Current project details",
    value: {
      name: project.name,
      tasks: project.tasks.map(t => ({ title: t.title, status: t.status, assignee: t.assignee })),
      dueDate: project.dueDate,
      completionRate: project.tasks.filter(t => t.status === "done").length / project.tasks.length,
    },
  });

  // Define actions the AI can take
  useCopilotAction({
    name: "createTask",
    description: "Create a new task in the current project",
    parameters: [
      { name: "title", type: "string", description: "Task title", required: true },
      { name: "assignee", type: "string", description: "Who to assign the task to" },
      { name: "priority", type: "string", enum: ["low", "medium", "high"] },
    ],
    handler: async ({ title, assignee, priority }) => {
      await api.tasks.create({ projectId: project.id, title, assignee, priority });
      revalidate();
      return `Created task: ${title}`;
    },
  });

  useCopilotAction({
    name: "generateReport",
    description: "Generate a project status report",
    parameters: [{ name: "format", type: "string", enum: ["summary", "detailed"] }],
    handler: async ({ format }) => {
      const report = await api.reports.generate({ projectId: project.id, format });
      return report.content;
    },
  });

  return <div>{/* Dashboard UI */}</div>;
}
```

### AI Text Editing

```tsx
import { CopilotTextarea } from "@copilotkit/react-textarea";

function DocumentEditor() {
  const [content, setContent] = useState("");

  return (
    <CopilotTextarea
      value={content}
      onValueChange={setContent}
      placeholder="Start writing..."
      autosuggestionsConfig={{
        textareaPurpose: "A project update document for stakeholders",
        chatApiConfigs: { suggestionsApiConfig: { forwardedParams: { model: "gpt-4o-mini" } } },
      }}
      className="w-full h-96 p-4 border rounded-lg"
    />
  );
  // AI autocompletes as you type, context-aware
}
```

## Installation

```bash
npm install @copilotkit/react-core @copilotkit/react-ui @copilotkit/react-textarea @copilotkit/runtime
```

## Best Practices

1. **useCopilotReadable** — Provide app state as context; AI answers based on actual data, not guesses
2. **useCopilotAction** — Define what AI can DO; create tasks, generate reports, modify data
3. **CopilotSidebar** — Drop-in chat UI; contextual to current page via readables
4. **CopilotTextarea** — Replace `<textarea>` for AI-powered writing; autocomplete, rewrite, translate
5. **AG-UI protocol** — CopilotKit uses AG-UI under the hood; connect any agent framework
6. **Multi-page context** — Readables update as user navigates; AI always has current page context
7. **Action confirmation** — Add `renderAndWait` for destructive actions; user confirms before execution
8. **LangGraph agents** — Connect LangGraph agents as CopilotKit backends for complex multi-step workflows
