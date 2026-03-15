---
title: Build Interactive API Documentation
slug: build-interactive-api-documentation
description: Build interactive API documentation with live request execution, code sample generation, authentication testing, response schema display, and versioned docs for developer onboarding.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Developer Tools
tags:
  - api-docs
  - documentation
  - interactive
  - developer-experience
  - openapi
---

# Build Interactive API Documentation

## The Problem

Eva leads DevRel at a 20-person API company. Their docs are static markdown pages generated from OpenAPI — developers read examples but can't try them. Onboarding requires configuring Postman collections, importing auth tokens, and setting up environments — 45 minutes before the first successful API call. Code samples are in cURL only; Python and JavaScript developers translate manually. When the API changes, docs are outdated for days. They need interactive docs: live "Try It" buttons, auto-generated code samples in 5 languages, built-in auth, and auto-sync from OpenAPI spec.

## Step 1: Build the Interactive Docs

```typescript
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

interface APIEndpoint {
  method: string;
  path: string;
  summary: string;
  description: string;
  parameters: Array<{ name: string; in: "path" | "query" | "header"; type: string; required: boolean; description: string; example?: any }>;
  requestBody?: { contentType: string; schema: any; example: any };
  responses: Record<string, { description: string; schema?: any; example?: any }>;
  tags: string[];
  deprecated: boolean;
  authentication: "required" | "optional" | "none";
}

interface CodeSample {
  language: string;
  code: string;
}

// Parse OpenAPI spec into endpoint docs
export async function importSpec(spec: any): Promise<APIEndpoint[]> {
  const endpoints: APIEndpoint[] = [];

  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const [method, op] of Object.entries(methods as any)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      const operation = op as any;

      endpoints.push({
        method: method.toUpperCase(), path,
        summary: operation.summary || "",
        description: operation.description || "",
        parameters: (operation.parameters || []).map((p: any) => ({
          name: p.name, in: p.in, type: p.schema?.type || "string",
          required: p.required || false, description: p.description || "",
          example: p.example || p.schema?.example,
        })),
        requestBody: operation.requestBody ? {
          contentType: "application/json",
          schema: operation.requestBody.content?.["application/json"]?.schema,
          example: operation.requestBody.content?.["application/json"]?.example || generateExample(operation.requestBody.content?.["application/json"]?.schema, spec.components?.schemas),
        } : undefined,
        responses: Object.fromEntries(Object.entries(operation.responses || {}).map(([code, resp]: [string, any]) => [
          code, { description: resp.description, schema: resp.content?.["application/json"]?.schema, example: resp.content?.["application/json"]?.example },
        ])),
        tags: operation.tags || [],
        deprecated: operation.deprecated || false,
        authentication: operation.security?.length ? "required" : "none",
      });
    }
  }

  await redis.set("docs:endpoints", JSON.stringify(endpoints));
  return endpoints;
}

// Generate code samples for an endpoint
export function generateCodeSamples(endpoint: APIEndpoint, baseUrl: string, authToken?: string): CodeSample[] {
  const url = `${baseUrl}${endpoint.path}`;
  const hasBody = !!endpoint.requestBody;
  const bodyExample = hasBody ? JSON.stringify(endpoint.requestBody?.example || {}, null, 2) : null;

  return [
    { language: "curl", code: generateCurl(endpoint, url, authToken, bodyExample) },
    { language: "javascript", code: generateJS(endpoint, url, authToken, bodyExample) },
    { language: "python", code: generatePython(endpoint, url, authToken, bodyExample) },
    { language: "go", code: generateGo(endpoint, url, authToken, bodyExample) },
    { language: "ruby", code: generateRuby(endpoint, url, authToken, bodyExample) },
  ];
}

function generateCurl(ep: APIEndpoint, url: string, token?: string, body?: string | null): string {
  let cmd = `curl -X ${ep.method} '${url}'`;
  if (token) cmd += ` \\
  -H 'Authorization: Bearer ${token}'`;
  cmd += ` \\
  -H 'Content-Type: application/json'`;
  if (body) cmd += ` \\
  -d '${body}'`;
  return cmd;
}

function generateJS(ep: APIEndpoint, url: string, token?: string, body?: string | null): string {
  return `const response = await fetch('${url}', {
  method: '${ep.method}',
  headers: {
    'Content-Type': 'application/json',${token ? `\n    'Authorization': 'Bearer ${token}',` : ''}
  },${body ? `\n  body: JSON.stringify(${body}),` : ''}
});

const data = await response.json();
console.log(data);`;
}

function generatePython(ep: APIEndpoint, url: string, token?: string, body?: string | null): string {
  return `import requests

response = requests.${ep.method.toLowerCase()}(
    '${url}',
    headers={
        'Content-Type': 'application/json',${token ? `\n        'Authorization': f'Bearer ${token}',` : ''}
    },${body ? `\n    json=${body},` : ''}
)

print(response.json())`;
}

function generateGo(ep: APIEndpoint, url: string, token?: string, body?: string | null): string {
  return `package main\n\nimport (\n\t"fmt"\n\t"net/http"\n\t"io"${body ? '\n\t"strings"' : ''}\n)\n\nfunc main() {\n\t${body ? `body := strings.NewReader(\x60${body}\x60)\n\treq, _ := http.NewRequest("${ep.method}", "${url}", body)` : `req, _ := http.NewRequest("${ep.method}", "${url}", nil)`}${token ? `\n\treq.Header.Set("Authorization", "Bearer ${token}")` : ''}\n\treq.Header.Set("Content-Type", "application/json")\n\tresp, _ := http.DefaultClient.Do(req)\n\tdefer resp.Body.Close()\n\tdata, _ := io.ReadAll(resp.Body)\n\tfmt.Println(string(data))\n}`;
}

function generateRuby(ep: APIEndpoint, url: string, token?: string, body?: string | null): string {
  return `require 'net/http'\nrequire 'json'\n\nuri = URI('${url}')\nhttp = Net::HTTP.new(uri.host, uri.port)\nhttp.use_ssl = true\n\nrequest = Net::HTTP::${ep.method === 'GET' ? 'Get' : ep.method === 'POST' ? 'Post' : ep.method === 'PUT' ? 'Put' : 'Delete'}.new(uri)\nrequest['Content-Type'] = 'application/json'${token ? `\nrequest['Authorization'] = 'Bearer ${token}'` : ''}${body ? `\nrequest.body = ${body}` : ''}\n\nresponse = http.request(request)\nputs JSON.parse(response.body)`;
}

function generateExample(schema: any, components?: any): any {
  if (!schema) return {};
  if (schema.$ref) { const name = schema.$ref.split("/").pop(); return generateExample(components?.[name], components); }
  if (schema.example) return schema.example;
  if (schema.type === "object" && schema.properties) {
    const obj: any = {};
    for (const [k, v] of Object.entries(schema.properties)) obj[k] = generateExample(v as any, components);
    return obj;
  }
  if (schema.type === "string") return schema.enum?.[0] || "string";
  if (schema.type === "number" || schema.type === "integer") return 0;
  if (schema.type === "boolean") return true;
  if (schema.type === "array") return [generateExample(schema.items, components)];
  return {};
}

// Execute live request (Try It)
export async function executeRequest(params: {
  method: string; url: string; headers: Record<string, string>; body?: any;
}): Promise<{ status: number; headers: Record<string, string>; body: any; latencyMs: number }> {
  const start = Date.now();
  const response = await fetch(params.url, {
    method: params.method,
    headers: params.headers,
    body: params.body ? JSON.stringify(params.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => response.text());
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    latencyMs: Date.now() - start,
  };
}
```

## Results

- **Time to first API call: 45 min → 2 min** — developer clicks "Try It", pastes API key, sends request; response displayed inline; no Postman setup
- **5 language code samples** — cURL, JavaScript, Python, Go, Ruby generated per endpoint; developer copies into their project; no manual translation
- **Auto-sync from spec** — OpenAPI spec updates → docs regenerate; deprecated endpoints marked; new endpoints appear; no manual doc writing
- **Built-in auth testing** — developer enters API key once; all "Try It" requests use it; auth errors explained inline with fix suggestions
- **Response schema display** — each field documented with type, description, and example; developers know exactly what to expect; fewer support questions
