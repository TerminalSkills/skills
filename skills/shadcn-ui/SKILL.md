---
name: shadcn-ui
description: >-
  shadcn/ui is a collection of accessible React components (built on Radix UI
  or Base UI and Tailwind CSS) that you add to your project as source code with
  a CLI instead of installing as a dependency. Use when the user asks to "add
  shadcn", "set up shadcn/ui", "add a shadcn dialog, form, data table, command
  palette or toast", "customize shadcn components", or build UI with
  components/ui in Next.js, Vite, Remix, Astro or React Router.
license: Apache-2.0
compatibility: "React project with Tailwind CSS (v4 for new projects); Node.js 20.18+; shadcn CLI 4.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  repository: https://github.com/shadcn-ui/ui
  tags: "ui, components, react, tailwind, radix"
---

# shadcn/ui

## Overview

shadcn/ui is not an npm component library. The `shadcn` CLI copies component source into your repo (usually `components/ui/`), so you own and edit every file. Components are styled with Tailwind CSS and CSS variables and sit on Radix UI primitives (newer projects can pick Base UI via `--base`). Checked against shadcn CLI 4.22.1 and the docs at ui.shadcn.com (October 2026).

## Instructions

### Set up

```bash
# existing project (Next.js, Vite, Remix, Astro, React Router, TanStack, Laravel)
npx shadcn@latest init

# new project from a template
npx shadcn@latest init --name billing-portal --template next
```

`init` writes `components.json`, adds the `cn()` helper in `lib/utils.ts`, installs dependencies and sets up theme CSS variables in your global CSS. Useful flags: `-t/--template` (next, vite, start, react-router, laravel, astro), `-b/--base` (radix, base, aria), `-p/--preset`, `--monorepo`, `-d/--defaults` (Next.js template with the Base UI `base-nova` preset, so `asChild` is replaced by `render`). `create` is an alias for `init`. Also available: `pnpm dlx shadcn@latest` and `bunx --bun shadcn@latest`.

### Add and inspect components

```bash
npx shadcn@latest add button dialog card input field table
npx shadcn@latest add sonner command dropdown-menu sheet tabs
npx shadcn@latest add dialog --dry-run     # preview files and dependencies
npx shadcn@latest add button --diff        # compare with upstream
npx shadcn@latest add button --overwrite   # replace your edited copy
npx shadcn@latest view button card         # print registry source
npx shadcn@latest search @shadcn -q "sidebar"
npx shadcn@latest info                     # show detected framework, aliases, installed components
npx shadcn@latest docs dialog              # docs and examples for a component
```

Components land in the `ui` alias from `components.json` (`@/components/ui`). `add` also accepts URLs, local paths and namespaced registries such as `@acme/auth`. `apply <preset>` re-themes an existing project and `migrate` runs codemods between versions.

### Forms with Field, React Hook Form and Zod

The old `Form`/`FormField` wrapper is replaced in the docs by the `Field` family (`Field`, `FieldGroup`, `FieldLabel`, `FieldError`, `FieldDescription`) used with react-hook-form's `Controller`. Install with `npx shadcn@latest add field input button` and `npm install react-hook-form zod @hookform/resolvers@5` (`@hookform/resolvers@6.0.0` currently fails npm's peer resolution with ERESOLVE).

```tsx
"use client";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
});

type InviteValues = { name: string; email: string };

export function InviteForm({ onInvite }: { onInvite: (v: InviteValues) => void }) {
  const form = useForm<InviteValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "" },
  });

  return (
    <form onSubmit={form.handleSubmit(onInvite)}>
      <FieldGroup>
        {(["name", "email"] as const).map((key) => (
          <Controller key={key} name={key} control={form.control} render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`invite-${key}`}>{key === "name" ? "Name" : "Email"}</FieldLabel>
              <Input {...field} id={`invite-${key}`} aria-invalid={fieldState.invalid}
                     placeholder={key === "name" ? "Priya Raman" : "priya@brightpath.io"} />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )} />
        ))}
        <Button type="submit">Send invite</Button>
      </FieldGroup>
    </form>
  );
}
```

Place this form inside `<DialogContent>` (with `Dialog`, `DialogTrigger asChild`, `DialogHeader`, `DialogTitle`) for a modal; with the Base UI variant, triggers use the `render` prop instead of `asChild`.

### Toasts

The Radix `toast` component is deprecated; use Sonner. Run `npx shadcn@latest add sonner`, render `<Toaster />` once in the root layout, then call `toast.success("Invite sent")` from `sonner` anywhere.

### Data table

There is no `data-table` item to add. The docs build it from the `table` component and TanStack Table v9: `npx shadcn@latest add table button dropdown-menu checkbox input` and `npm install @tanstack/react-table`. v9 is feature-based: export `features = tableFeatures({ rowPaginationFeature, paginatedRowModel: createPaginatedRowModel(), ... })` for the behavior you need, type columns as `ColumnDef<DataTableFeatures, User>[]`, and create the table with `useTable({ features, data, columns })` in a small `DataTable` component. The v8 `useReactTable`/`getCoreRowModel` API is not in v9. Copy the full structure from https://ui.shadcn.com/docs/components/data-table (`npx shadcn@latest docs data-table` does not work: it is a guide, not a registry item).

### Command palette

```tsx
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export function CommandPalette({ go }: { go: (path: string) => void }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((o) => !o); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => go("/dashboard")}>Dashboard</CommandItem>
          <CommandItem onSelect={() => go("/settings")}>Settings</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

### Theming

Colors are CSS variables (`--background`, `--primary`, `--radius`, ...) in your global CSS, with a `.dark` class override; edit them or apply a preset with `npx shadcn@latest apply <code>`. Use `next-themes` for the light/dark toggle. Variants use `class-variance-authority`; extend them in the component file.

## Examples

### Example 1: Add a confirmation dialog to a Next.js app

**Request:** "Set up shadcn in my Next.js app and add a delete-confirmation dialog."

```bash
npx shadcn@latest init
npx shadcn@latest add alert-dialog button
```

Result: `components.json`, `lib/utils.ts` and `components/ui/alert-dialog.tsx` appear; import `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogAction` and `AlertDialogCancel` from `@/components/ui/alert-dialog` and wire the action to your delete handler.

### Example 2: Replace a custom toast with Sonner

**Request:** "Show a success toast after saving settings."

```bash
npx shadcn@latest add sonner
```

Add `<Toaster />` to `app/layout.tsx`, then `import { toast } from "sonner"` and call `toast.success("Settings saved")` after the request resolves. A small toast appears bottom-right and dismisses itself.

## Guidelines

- Run `init` first; `add` fails without a `components.json`.
- Components are your code: after editing one, `add --overwrite` replaces your changes, so check `--diff` first.
- Pick the base (`radix` or `base`) at `init`; do not mix them in one project, because the trigger APIs differ (`asChild` vs `render`).
- Existing Tailwind v3 projects keep working; new `init` projects use Tailwind v4 with CSS-first config. Do not hand-edit `tailwind.config` for a v4 project.
- Third-party registries (`@acme/...`, URLs) install arbitrary code into your repo: review it with `view` or `--dry-run` before adding.
- Server Components: components using hooks or Radix state need `"use client"`; the CLI adds it where required.
