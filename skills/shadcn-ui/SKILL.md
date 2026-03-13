---
name: shadcn-ui
description: >-
  You are an expert in shadcn/ui, the collection of reusable React components
  built with Radix UI and Tailwind CSS. You help developers build beautiful,
  accessible interfaces by copying components directly into their project (not
  installed as a dependency) — providing full ownership and customization of
  every component including buttons, dialogs, forms, tables, command palettes,
  toasts, and 40+ primitives.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Frontend Development
  tags:
    - ui
    - components
    - react
    - tailwind
    - radix
    - accessible
    - copy-paste
---

# shadcn/ui — Copy-Paste Component Library

You are an expert in shadcn/ui, the collection of reusable React components built with Radix UI and Tailwind CSS. You help developers build beautiful, accessible interfaces by copying components directly into their project (not installed as a dependency) — providing full ownership and customization of every component including buttons, dialogs, forms, tables, command palettes, toasts, and 40+ primitives.

## Core Capabilities

### Installation and Usage

```bash
# Initialize in your project
npx shadcn@latest init

# Add components (copies source code into your project)
npx shadcn@latest add button dialog card input form table
npx shadcn@latest add command toast dropdown-menu sheet tabs

# Components are now in your project at components/ui/
```

```tsx
// Full ownership — edit anything
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
});

function CreateUserDialog() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "" },
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Add User</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl><Input placeholder="john@example.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" className="w-full">Create</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

### Data Table

```tsx
import { DataTable } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

const columns: ColumnDef<User>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => <Badge variant={row.original.role === "admin" ? "default" : "secondary"}>{row.original.role}</Badge>,
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => editUser(row.original)}>Edit</DropdownMenuItem>
          <DropdownMenuItem className="text-red-600" onClick={() => deleteUser(row.original.id)}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

function UsersPage() {
  return <DataTable columns={columns} data={users} searchKey="name" />;
}
```

### Command Palette

```tsx
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => navigate("/dashboard")}>📊 Dashboard</CommandItem>
          <CommandItem onSelect={() => navigate("/settings")}>⚙️ Settings</CommandItem>
          <CommandItem onSelect={() => createNewProject()}>➕ New Project</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

## Installation

```bash
npx shadcn@latest init                     # Setup (adds tailwind config, utils, etc.)
npx shadcn@latest add [component]          # Add specific components
```

## Best Practices

1. **Not a dependency** — Components are copied into your project; you own the code, customize freely
2. **Radix primitives** — Built on Radix UI; fully accessible (ARIA, keyboard navigation) out of the box
3. **Tailwind styling** — All styles via Tailwind classes; customize with your design tokens in `globals.css`
4. **Variant system** — Uses `class-variance-authority` (cva) for component variants; extend with your own
5. **Form integration** — `Form` component wraps react-hook-form + zod; type-safe validation built-in
6. **Theme** — CSS variables in `globals.css`; switch light/dark by changing variables; `next-themes` for toggle
7. **Composition** — Components are composable primitives; build complex UIs by combining simple parts
8. **Registry** — Browse all components at ui.shadcn.com; preview before adding to your project
