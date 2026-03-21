---
title: "Build an AI-Powered Form Builder"
description: "Describe a form in plain English and AI generates the fields, validation rules, and conditional logic. Analyze responses with AI and embed anywhere with a JS snippet."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "5 hours"
tags: [forms, ai, claude, form-builder, survey, prisma, no-code, conditional-logic, analytics]
---

# Build an AI-Powered Form Builder

**Persona:** You're running operations at a 50-person startup. Every month someone needs a new internal form: onboarding surveys, IT requests, feedback forms, expense reports. You're not a developer, and asking engineering takes 2 weeks. You want to describe what you need and have it built instantly.

---

## What You'll Build

- **AI form generator:** describe → get fields + validation
- **Form types:** survey, quiz, registration, feedback
- **Conditional logic:** show/hide fields based on answers
- **Response analysis:** AI summarizes patterns across submissions
- **Embeddable:** generate a JS snippet to embed anywhere

---

## Data Model (Prisma)

```prisma
// prisma/schema.prisma
model Form {
  id          String   @id @default(cuid())
  title       String
  description String?
  fields      Json     // FormField[]
  settings    Json     // FormSettings
  slug        String   @unique
  published   Boolean  @default(false)
  createdAt   DateTime @default(now())
  responses   Response[]
}

model Response {
  id        String   @id @default(cuid())
  formId    String
  data      Json     // { fieldId: value }
  metadata  Json?    // IP, user agent, referrer
  createdAt DateTime @default(now())
  form      Form     @relation(fields: [formId], references: [id])
}
```

---

## Step 1: AI Form Generator

```ts
// lib/form-generator.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export type FieldType = 'text' | 'email' | 'number' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'rating' | 'file';

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];       // for select/radio/checkbox
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  conditions?: {
    showIf: { fieldId: string; operator: 'equals' | 'not_equals' | 'contains'; value: string };
  };
}

export interface GeneratedForm {
  title: string;
  description: string;
  fields: FormField[];
  settings: {
    submitButtonText: string;
    successMessage: string;
    type: 'survey' | 'quiz' | 'registration' | 'feedback';
  };
}

export async function generateForm(prompt: string): Promise<GeneratedForm> {
  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Generate a form based on this description: "${prompt}"

Return a JSON object with this exact structure:
{
  "title": "Form title",
  "description": "Short description",
  "settings": {
    "submitButtonText": "Submit",
    "successMessage": "Thank you for your response!",
    "type": "survey|quiz|registration|feedback"
  },
  "fields": [
    {
      "id": "field_1",
      "type": "text|email|number|textarea|select|radio|checkbox|date|rating|file",
      "label": "Field label",
      "placeholder": "Optional placeholder",
      "required": true,
      "options": ["Option 1", "Option 2"],  // only for select/radio/checkbox
      "validation": { "min": 0, "max": 100, "pattern": "regex", "message": "Error message" },
      "conditions": {
        "showIf": { "fieldId": "field_1", "operator": "equals", "value": "Yes" }
      }
    }
  ]
}

Rules:
- Use appropriate field types (email for emails, number for numeric, rating for 1-5 stars)
- Add conditional logic where it makes sense (e.g., show details if user selects "Other")
- Include validation for emails, required fields, numeric ranges
- 5-12 fields is ideal, not too short, not overwhelming
- Return ONLY the JSON, no explanation`,
    }],
  });

  const text = (message.content[0] as any).text;
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
}
```

---

## Step 2: Create Form API

```ts
// app/api/forms/route.ts
import { prisma } from '@/lib/prisma';
import { generateForm } from '@/lib/form-generator';
import { nanoid } from 'nanoid';

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const generated = await generateForm(prompt);
  const slug = nanoid(10);

  const form = await prisma.form.create({
    data: {
      title: generated.title,
      description: generated.description,
      fields: generated.fields,
      settings: generated.settings,
      slug,
      published: true,
    },
  });

  return Response.json({ form, url: `https://yourapp.com/f/${slug}` });
}
```

---

## Step 3: Render Form with Conditional Logic

```tsx
// components/FormRenderer.tsx
'use client';
import { useState } from 'react';
import type { FormField } from '@/lib/form-generator';

interface Props {
  fields: FormField[];
  onSubmit: (data: Record<string, any>) => void;
  settings: { submitButtonText: string };
}

export function FormRenderer({ fields, onSubmit, settings }: Props) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isVisible = (field: FormField) => {
    if (!field.conditions) return true;
    const { fieldId, operator, value } = field.conditions.showIf;
    const currentValue = values[fieldId] ?? '';
    if (operator === 'equals') return currentValue === value;
    if (operator === 'not_equals') return currentValue !== value;
    if (operator === 'contains') return String(currentValue).includes(value);
    return true;
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    fields.filter(isVisible).forEach(field => {
      const val = values[field.id];
      if (field.required && !val) newErrors[field.id] = 'This field is required';
      if (field.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        newErrors[field.id] = 'Enter a valid email address';
      }
      if (field.validation?.min && Number(val) < field.validation.min) {
        newErrors[field.id] = field.validation.message ?? `Minimum value is ${field.validation.min}`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {fields.filter(isVisible).map(field => (
        <div key={field.id}>
          <label className="block text-sm font-medium mb-1">
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </label>

          {field.type === 'textarea' ? (
            <textarea className="w-full border rounded-lg p-2" rows={4} placeholder={field.placeholder}
              value={values[field.id] ?? ''} onChange={e => setValues(v => ({ ...v, [field.id]: e.target.value }))} />
          ) : field.type === 'select' ? (
            <select className="w-full border rounded-lg p-2"
              value={values[field.id] ?? ''} onChange={e => setValues(v => ({ ...v, [field.id]: e.target.value }))}>
              <option value="">Select an option</option>
              {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : field.type === 'radio' ? (
            <div className="space-y-2">
              {field.options?.map(opt => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name={field.id} value={opt}
                    checked={values[field.id] === opt}
                    onChange={() => setValues(v => ({ ...v, [field.id]: opt }))} />
                  {opt}
                </label>
              ))}
            </div>
          ) : field.type === 'rating' ? (
            <div className="flex gap-2">
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button"
                  className={`w-10 h-10 rounded-full border-2 font-bold ${values[field.id] >= n ? 'bg-indigo-500 text-white border-indigo-500' : 'border-gray-300'}`}
                  onClick={() => setValues(v => ({ ...v, [field.id]: n }))}>
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <input type={field.type} className="w-full border rounded-lg p-2" placeholder={field.placeholder}
              value={values[field.id] ?? ''} onChange={e => setValues(v => ({ ...v, [field.id]: e.target.value }))} />
          )}

          {errors[field.id] && <p className="text-red-500 text-sm mt-1">{errors[field.id]}</p>}
        </div>
      ))}

      <button type="submit" className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700">
        {settings.submitButtonText}
      </button>
    </form>
  );
}
```

---

## Step 4: AI Response Analysis

```ts
// app/api/forms/[id]/analyze/route.ts
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const form = await prisma.form.findUnique({ where: { id: params.id }, include: { responses: true } });
  if (!form || form.responses.length < 3) return Response.json({ error: 'Not enough responses' }, { status: 400 });

  const sample = form.responses.slice(-50).map(r => r.data);

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Analyze these form responses and provide a concise summary.

Form: ${form.title}
Total responses: ${form.responses.length}
Sample (last 50):
${JSON.stringify(sample, null, 2).slice(0, 3000)}

Provide:
1. Key patterns and trends
2. Most common answers per question
3. Notable outliers or concerns
4. 2-3 actionable recommendations

Be specific, not generic. Use numbers where possible.`,
    }],
  });

  return Response.json({ analysis: (message.content[0] as any).text, totalResponses: form.responses.length });
}
```

---

## Step 5: Embeddable Snippet

```html
<!-- Embed in any website -->
<div id="ts-form-container"></div>
<script>
  (function(w, d, s, id) {
    var js = d.createElement(s); js.src = 'https://yourapp.com/embed.js';
    js.setAttribute('data-form-id', id);
    js.setAttribute('data-container', 'ts-form-container');
    d.head.appendChild(js);
  })(window, document, 'script', 'YOUR_FORM_SLUG');
</script>
```

---

## Key Outcomes

- Any form built in under 30 seconds with a plain text description
- Conditional logic generated automatically
- Responses analyzed with AI — spot patterns instantly
- Embeds in any website, no developer needed
- Full submission history in Prisma
