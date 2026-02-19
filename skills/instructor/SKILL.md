---
name: instructor
description: >-
  Assists with extracting structured, validated data from LLM responses using Instructor.
  Use when converting unstructured text into typed objects, classifying content, extracting
  entities, or building reliable data extraction pipelines with automatic retries.
  Trigger words: instructor, structured output, pydantic, llm extraction, entity extraction,
  structured data, response model.
license: Apache-2.0
compatibility: "Python 3.9+ or TypeScript/Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["instructor", "structured-output", "llm", "extraction", "validation"]
---

# Instructor

## Overview

Instructor extracts structured, validated data from LLM responses using Pydantic models (Python) or Zod schemas (TypeScript). It handles prompt engineering, retries, and validation automatically, turning unreliable LLM text into reliable typed data with support for OpenAI, Anthropic, Google, and other providers.

## Instructions

- When defining output schemas, use Pydantic models (Python) or Zod schemas (TypeScript) with descriptive field descriptions that guide the LLM, and include `Optional` fields for data that may not be present in the input.
- When extracting data, use `client.chat.completions.create(response_model=Schema, ...)` and set `max_retries=3` for production since most validation failures self-correct on the first retry.
- When improving accuracy, include a `reasoning` or `chain_of_thought` field in the schema to force the model to think before outputting structured fields.
- When validating business rules, add field validators and model validators for cross-field constraints (e.g., "end_date must be after start_date", "amount must be positive").
- When extracting multiple objects, use `create_iterable()` for variable-length extractions instead of `List[Item]` for better streaming and pagination support.
- When streaming results, use `create_partial()` (Python) or `{ stream: true }` (TypeScript) to display incomplete results as the model generates them.
- When monitoring quality, log extraction attempts and retry counts; high retry rates indicate schema or prompt issues that need refinement.

## Examples

### Example 1: Extract structured entities from text

**User request:** "Parse customer support emails into structured tickets"

**Actions:**
1. Define a Pydantic model with fields: subject, category, urgency, customer_name, issue_description
2. Add a `reasoning` field for the model to analyze the email before structuring
3. Patch the OpenAI client with Instructor and call with `response_model=SupportTicket`
4. Add field validators for category and urgency enums with descriptive error messages

**Output:** Structured support tickets with consistent categorization and validated fields.

### Example 2: Classify documents with confidence scores

**User request:** "Classify legal documents by type with confidence scoring"

**Actions:**
1. Define classification schema with `document_type`, `confidence`, and `key_indicators` fields
2. Add validation that confidence is between 0 and 1
3. Use `create_iterable()` to process a batch of documents
4. Log retry counts to monitor classification quality over time

**Output:** Typed classification results with confidence scores and supporting evidence.

## Guidelines

- Define output models with descriptive field descriptions; the LLM reads them as schema guidance.
- Include a `reasoning` field for complex extractions to improve accuracy.
- Set `max_retries=3` for production; most validation failures self-correct on the first retry.
- Use `Optional` types for fields that may not be present in the input.
- Validate business logic in model validators, not just type checks.
- Use `create_iterable()` for variable-length extractions instead of `List[Item]`.
- Log extraction attempts and retry counts for monitoring; high retry rates indicate schema or prompt issues.
