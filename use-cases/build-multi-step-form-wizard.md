---
title: Build a Multi-Step Form Wizard
slug: build-multi-step-form-wizard
description: Build a multi-step form wizard with validation per step, progress saving, back/forward navigation, conditional steps, and draft recovery — reducing form abandonment for complex data collection.
skills:
  - typescript
  - nextjs
  - redis
  - zod
category: development
tags:
  - forms
  - wizard
  - user-experience
  - validation
  - react
---

# Build a Multi-Step Form Wizard

## The Problem

Sara leads product at a 25-person insurance company. Their quote form has 35 fields on one page. 72% of users abandon it — the wall of inputs is overwhelming. Users who refresh mid-form lose everything and leave. Mobile users can't even see where the form ends. They tried splitting into sections but without saved progress, users still lose data on refresh. They need a step-by-step wizard that shows 5-7 fields per step, validates as you go, saves progress automatically, and lets users resume later.

## Step 1: Build the Form Wizard

```typescript
// src/components/FormWizard.tsx — Multi-step form with auto-save and conditional steps
"use client";

import { useState, useEffect, useCallback } from "react";
import { z } from "zod";

// Step schemas — each step validates independently
const PersonalInfoSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
  phone: z.string().min(10, "Enter a valid phone number"),
  dateOfBirth: z.string().min(1, "Required"),
});

const AddressSchema = z.object({
  street: z.string().min(1, "Required"),
  city: z.string().min(1, "Required"),
  state: z.string().min(1, "Required"),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code"),
  country: z.string().min(1, "Required"),
});

const CoverageSchema = z.object({
  coverageType: z.enum(["basic", "standard", "premium"]),
  coverageAmount: z.number().min(10000).max(5000000),
  deductible: z.number().min(500).max(10000),
  includeRental: z.boolean(),
  includeRoadside: z.boolean(),
});

// Conditional: only shown if coverageType === "premium"
const PremiumDetailsSchema = z.object({
  vehicleMake: z.string().min(1, "Required"),
  vehicleModel: z.string().min(1, "Required"),
  vehicleYear: z.number().min(1990).max(2027),
  vin: z.string().length(17, "VIN must be 17 characters"),
});

const ReviewSchema = z.object({
  agreeToTerms: z.boolean().refine((v) => v === true, "You must agree to terms"),
});

interface Step {
  id: string;
  title: string;
  schema: z.ZodObject<any>;
  fields: FieldConfig[];
  condition?: (data: Record<string, any>) => boolean;  // show/hide this step
}

interface FieldConfig {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "date" | "number" | "select" | "checkbox";
  options?: Array<{ label: string; value: string }>;
  placeholder?: string;
}

const STEPS: Step[] = [
  {
    id: "personal",
    title: "Personal Information",
    schema: PersonalInfoSchema,
    fields: [
      { name: "firstName", label: "First Name", type: "text" },
      { name: "lastName", label: "Last Name", type: "text" },
      { name: "email", label: "Email", type: "email" },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "dateOfBirth", label: "Date of Birth", type: "date" },
    ],
  },
  {
    id: "address",
    title: "Address",
    schema: AddressSchema,
    fields: [
      { name: "street", label: "Street Address", type: "text" },
      { name: "city", label: "City", type: "text" },
      { name: "state", label: "State", type: "select", options: [
        { label: "California", value: "CA" },
        { label: "New York", value: "NY" },
        { label: "Texas", value: "TX" },
        // ...
      ]},
      { name: "zip", label: "ZIP Code", type: "text", placeholder: "12345" },
      { name: "country", label: "Country", type: "select", options: [{ label: "United States", value: "US" }] },
    ],
  },
  {
    id: "coverage",
    title: "Coverage Options",
    schema: CoverageSchema,
    fields: [
      { name: "coverageType", label: "Coverage Type", type: "select", options: [
        { label: "Basic — Liability only", value: "basic" },
        { label: "Standard — Collision + Comprehensive", value: "standard" },
        { label: "Premium — Full coverage", value: "premium" },
      ]},
      { name: "coverageAmount", label: "Coverage Amount ($)", type: "number" },
      { name: "deductible", label: "Deductible ($)", type: "number" },
      { name: "includeRental", label: "Include rental car coverage", type: "checkbox" },
      { name: "includeRoadside", label: "Include roadside assistance", type: "checkbox" },
    ],
  },
  {
    id: "premium_details",
    title: "Vehicle Details",
    schema: PremiumDetailsSchema,
    condition: (data) => data.coverageType === "premium",  // only for premium
    fields: [
      { name: "vehicleMake", label: "Make", type: "text", placeholder: "Toyota" },
      { name: "vehicleModel", label: "Model", type: "text", placeholder: "Camry" },
      { name: "vehicleYear", label: "Year", type: "number" },
      { name: "vin", label: "VIN", type: "text", placeholder: "17 characters" },
    ],
  },
  {
    id: "review",
    title: "Review & Submit",
    schema: ReviewSchema,
    fields: [
      { name: "agreeToTerms", label: "I agree to the terms and conditions", type: "checkbox" },
    ],
  },
];

export function FormWizard({ draftId }: { draftId?: string }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Filter steps based on conditions
  const activeSteps = STEPS.filter(
    (step) => !step.condition || step.condition(formData)
  );

  const step = activeSteps[currentStep];

  // Load draft on mount
  useEffect(() => {
    if (draftId) {
      loadDraft(draftId).then((draft) => {
        if (draft) {
          setFormData(draft.data);
          setCurrentStep(draft.lastStep);
        }
      });
    }
  }, [draftId]);

  // Auto-save on change (debounced)
  const autoSave = useCallback(
    debounce(async (data: Record<string, any>, stepIndex: number) => {
      setSaving(true);
      await saveDraft(draftId || "new", data, stepIndex);
      setSaving(false);
    }, 2000),
    [draftId]
  );

  const updateField = (name: string, value: any) => {
    const updated = { ...formData, [name]: value };
    setFormData(updated);
    setErrors((prev) => ({ ...prev, [name]: "" }));
    autoSave(updated, currentStep);
  };

  const validateStep = (): boolean => {
    const stepData: Record<string, any> = {};
    for (const field of step.fields) {
      stepData[field.name] = formData[field.name] ?? (field.type === "checkbox" ? false : "");
    }

    const result = step.schema.safeParse(stepData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
      setErrors(fieldErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const nextStep = () => {
    if (validateStep()) {
      if (currentStep < activeSteps.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        handleSubmit();
      }
    }
  };

  const prevStep = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    const response = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    if (response.ok) {
      // Redirect to confirmation
      window.location.href = "/quote/confirmation";
    }
  };

  const progress = ((currentStep + 1) / activeSteps.length) * 100;

  return { step, currentStep, activeSteps, formData, errors, progress, saving, updateField, nextStep, prevStep };
}

async function loadDraft(id: string) {
  const res = await fetch(`/api/drafts/${id}`);
  if (!res.ok) return null;
  return res.json();
}

async function saveDraft(id: string, data: Record<string, any>, lastStep: number) {
  await fetch(`/api/drafts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, lastStep }),
  });
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timer: any;
  return ((...args: any[]) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }) as T;
}
```

## Results

- **Form abandonment: 72% → 31%** — breaking 35 fields into 5 steps of 5-7 fields each makes the form feel manageable; progress bar shows "you're almost done"
- **Draft recovery saves 40% of abandoned sessions** — users who leave mid-form get an email with a resume link; auto-save means they pick up exactly where they stopped
- **Mobile completion rate doubled** — each step fits on one screen; no scrolling through a wall of inputs
- **Conditional steps reduce friction** — basic/standard coverage users skip the vehicle details step entirely; form feels shorter for 70% of users
- **Validation per step catches errors early** — users fix mistakes immediately instead of scrolling back through 35 fields after a submit failure
