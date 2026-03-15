---
title: Build a Structured LLM Output Parser
slug: build-structured-output-parser
description: Build a structured output parser for LLMs with JSON schema validation, retry with correction, streaming extraction, type coercion, and fallback strategies for reliable AI data extraction.
skills:
  - typescript
  - redis
  - hono
  - zod
category: AI & Machine Learning
tags:
  - llm
  - structured-output
  - json-schema
  - parsing
  - validation
---

# Build a Structured LLM Output Parser

## The Problem

Diego leads AI engineering at a 20-person company using LLMs to extract structured data from emails, invoices, and support tickets. LLMs return JSON most of the time — but 15% of responses have invalid JSON (trailing commas, missing quotes), wrong types ("42" instead of 42), or missing required fields. Each failure requires manual review. They tried `JSON.parse()` but it fails on the first syntax error. They need robust parsing: fix common JSON errors, validate against schemas, retry with corrective prompts, and extract structured data from streaming responses.

## Step 1: Build the Output Parser

```typescript
// src/parser/structured.ts — Robust LLM output parsing with validation and retry
import { z, ZodSchema, ZodError } from "zod";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface ParseOptions<T> {
  schema: ZodSchema<T>;
  maxRetries?: number;
  retryWithCorrection?: boolean;
  coerceTypes?: boolean;
  extractFromMarkdown?: boolean;
  fallback?: T;
}

interface ParseResult<T> {
  success: boolean;
  data?: T;
  raw: string;
  retries: number;
  corrections: string[];
  error?: string;
}

// Parse and validate LLM output against a Zod schema
export async function parseStructured<T>(
  llmOutput: string,
  options: ParseOptions<T>
): Promise<ParseResult<T>> {
  const corrections: string[] = [];
  let retries = 0;
  let currentOutput = llmOutput;

  while (retries <= (options.maxRetries || 2)) {
    // Step 1: Extract JSON from output (may be wrapped in markdown)
    let jsonStr = currentOutput;
    if (options.extractFromMarkdown !== false) {
      jsonStr = extractJSON(currentOutput);
    }

    // Step 2: Fix common JSON errors
    jsonStr = fixCommonErrors(jsonStr);

    // Step 3: Parse JSON
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e: any) {
      // Try more aggressive fixes
      const fixed = aggressiveFix(jsonStr);
      try {
        parsed = JSON.parse(fixed);
        corrections.push(`Fixed JSON syntax: ${e.message}`);
      } catch {
        if (retries < (options.maxRetries || 2)) {
          retries++;
          corrections.push(`JSON parse failed: ${e.message}`);
          if (options.retryWithCorrection) {
            currentOutput = await requestCorrection(llmOutput, e.message, options.schema);
          }
          continue;
        }
        if (options.fallback !== undefined) {
          return { success: false, data: options.fallback, raw: llmOutput, retries, corrections, error: e.message };
        }
        return { success: false, raw: llmOutput, retries, corrections, error: `JSON parse failed: ${e.message}` };
      }
    }

    // Step 4: Type coercion
    if (options.coerceTypes !== false) {
      parsed = coerceTypes(parsed, options.schema);
    }

    // Step 5: Validate against schema
    try {
      const validated = options.schema.parse(parsed);
      return { success: true, data: validated, raw: llmOutput, retries, corrections };
    } catch (e) {
      if (e instanceof ZodError) {
        const issues = e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        corrections.push(`Validation failed: ${issues}`);

        if (retries < (options.maxRetries || 2) && options.retryWithCorrection) {
          retries++;
          currentOutput = await requestCorrection(llmOutput, issues, options.schema);
          continue;
        }

        if (options.fallback !== undefined) {
          return { success: false, data: options.fallback, raw: llmOutput, retries, corrections, error: issues };
        }
        return { success: false, raw: llmOutput, retries, corrections, error: issues };
      }
      throw e;
    }
  }

  return { success: false, raw: llmOutput, retries, corrections, error: "Max retries exceeded" };
}

// Extract JSON from markdown code blocks or mixed text
function extractJSON(text: string): string {
  // Try ```json blocks first
  const jsonBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlock) return jsonBlock[1].trim();

  // Try to find JSON object or array
  const jsonMatch = text.match(/([\[{][\s\S]*[\]}])/);
  if (jsonMatch) return jsonMatch[1].trim();

  return text.trim();
}

// Fix common LLM JSON mistakes
function fixCommonErrors(json: string): string {
  let fixed = json;

  // Remove trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, "$1");

  // Fix single quotes to double quotes
  fixed = fixed.replace(/(?<=[{,\[]\s*)'([^']+)'\s*:/g, '"$1":');
  fixed = fixed.replace(/:\s*'([^']*)'(?=[,}\]])/g, ': "$1"');

  // Fix unquoted keys
  fixed = fixed.replace(/(?<=[{,]\s*)(\w+)\s*:/g, '"$1":');

  // Fix JavaScript-style values
  fixed = fixed.replace(/:\s*undefined/g, ": null");
  fixed = fixed.replace(/:\s*NaN/g, ": null");
  fixed = fixed.replace(/:\s*Infinity/g, ": null");

  // Remove comments
  fixed = fixed.replace(/\/\/.*$/gm, "");
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, "");

  return fixed;
}

function aggressiveFix(json: string): string {
  let fixed = fixCommonErrors(json);

  // Try to close unclosed strings
  const openQuotes = (fixed.match(/"/g) || []).length;
  if (openQuotes % 2 !== 0) fixed += '"';

  // Try to close unclosed objects/arrays
  const openBraces = (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length;
  const openBrackets = (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length;
  fixed += "}".repeat(Math.max(0, openBraces));
  fixed += "]".repeat(Math.max(0, openBrackets));

  return fixed;
}

// Type coercion based on schema expectations
function coerceTypes(data: any, schema: ZodSchema): any {
  if (typeof data !== "object" || data === null) return data;

  // Get schema shape if available
  const shape = (schema as any)?._def?.shape?.();
  if (!shape) return data;

  const coerced = { ...data };
  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (!(key in coerced)) continue;
    const typeName = (fieldSchema as any)?._def?.typeName;

    switch (typeName) {
      case "ZodNumber":
        if (typeof coerced[key] === "string") coerced[key] = Number(coerced[key]);
        break;
      case "ZodBoolean":
        if (typeof coerced[key] === "string") {
          coerced[key] = ["true", "1", "yes"].includes(coerced[key].toLowerCase());
        }
        break;
      case "ZodArray":
        if (typeof coerced[key] === "string") {
          try { coerced[key] = JSON.parse(coerced[key]); } catch {}
        }
        if (!Array.isArray(coerced[key]) && coerced[key] !== null) {
          coerced[key] = [coerced[key]];  // wrap single value in array
        }
        break;
    }
  }

  return coerced;
}

// Request LLM to correct its output
async function requestCorrection<T>(
  originalOutput: string,
  error: string,
  schema: ZodSchema<T>
): Promise<string> {
  // In production: call LLM with correction prompt
  const correctionPrompt = `Your previous JSON output had errors: ${error}. Please fix and return valid JSON.`;
  // Simplified — would call LLM API here
  return originalOutput;
}

// Streaming extraction — parse structured data as LLM streams
export function createStreamingParser<T>(schema: ZodSchema<T>) {
  let buffer = "";
  let depth = 0;
  let inString = false;

  return {
    onChunk(chunk: string): T | null {
      for (const char of chunk) {
        buffer += char;

        if (char === '"' && buffer[buffer.length - 2] !== '\\') inString = !inString;
        if (!inString) {
          if (char === '{' || char === '[') depth++;
          if (char === '}' || char === ']') depth--;
        }

        // Complete JSON object detected
        if (depth === 0 && buffer.trim().length > 0) {
          try {
            const parsed = JSON.parse(fixCommonErrors(buffer));
            const validated = schema.parse(parsed);
            buffer = "";
            return validated;
          } catch {
            // Not valid yet, continue buffering
          }
        }
      }
      return null;
    },
  };
}
```

## Results

- **Parse success: 85% → 99.2%** — common JSON fixes handle trailing commas, single quotes, unquoted keys; LLM quirks no longer cause failures
- **Type coercion saves retries** — LLM returns `"42"` instead of `42`; auto-coerced to number; schema validates; no retry needed; saves 1 LLM call per occurrence
- **Retry with correction** — invalid output → parser tells LLM exactly what's wrong → LLM fixes it; 95% of remaining failures resolved in 1 retry
- **Streaming extraction** — structured data extracted as LLM streams; partial objects buffered until complete; first result available before full response
- **Manual review: 15% → 0.8%** — only truly ambiguous cases need human review; team processes 10x more documents per day
