---
title: Build an AI Legal Document Analyzer
slug: build-ai-legal-document-analyzer
description: Upload vendor contracts and get a plain-English breakdown of every key clause — termination terms, liability caps, IP ownership, NDA scope — with risk flags before you sign.
skills:
  - anthropic-sdk
tags:
  - legal
  - contracts
  - ai
  - risk-management
  - startups
---

## The Problem

Alex is a startup founder who just received a 47-page vendor contract from a SaaS tool they want to integrate. They can't afford to spend $800/hour on a lawyer for every vendor agreement. The last time they signed without reviewing properly, they discovered 6 months later that the contract included auto-renewal and 90-day cancellation notice — and they missed the window.

Alex needs a way to upload any contract PDF, get a structured breakdown of the clauses that actually matter, understand which terms are risky or unusual, and know what questions to ask before signing.

## The Solution

Use anthropic-sdk with Claude's large context window to analyze full contract text. Extract key clauses into structured output, score risk per clause against standard market terms, and produce a plain-English summary report for each section.

## Step-by-Step Walkthrough

### Step 1: Extract Text from Contract Documents

```typescript
// extractor/document.ts
import * as fs from 'fs';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export interface ExtractedDocument {
  text: string;
  pageCount?: number;
  filename: string;
  charCount: number;
}

export async function extractContractText(filePath: string): Promise<ExtractedDocument> {
  const filename = filePath.split('/').pop() || filePath;
  const ext = filename.split('.').pop()?.toLowerCase();

  let text = '';
  let pageCount: number | undefined;

  if (ext === 'pdf') {
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);
    text = data.text;
    pageCount = data.numpages;
  } else if (ext === 'docx' || ext === 'doc') {
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value;
  } else if (ext === 'txt') {
    text = fs.readFileSync(filePath, 'utf-8');
  } else {
    throw new Error(`Unsupported format: ${ext}. Use PDF, DOCX, or TXT.`);
  }

  // Clean up excessive whitespace while preserving structure
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return { text, pageCount, filename, charCount: text.length };
}
```

### Step 2: Identify and Extract Key Clauses

Use Claude to locate and extract the clauses that matter most in commercial contracts.

```typescript
// analyzer/clauses.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface ExtractedClause {
  type: string;               // 'termination', 'liability_cap', 'ip_ownership', etc.
  title: string;              // human-readable clause name
  rawText: string;            // verbatim text from contract
  summary: string;            // plain-English explanation
  location: string;           // "Section 12.3" or "Page 24"
  present: boolean;           // false if clause is missing from contract
}

export type ClauseType = 
  | 'termination'
  | 'auto_renewal'
  | 'liability_cap'
  | 'ip_ownership'
  | 'nda_scope'
  | 'indemnification'
  | 'governing_law'
  | 'dispute_resolution'
  | 'payment_terms'
  | 'data_processing';

/**
 * Extract specific clause types from the contract.
 * Claude handles the "find it in 47 pages" problem.
 */
export async function extractClauses(
  contractText: string
): Promise<ExtractedClause[]> {
  // For large contracts, Claude's 200K context window handles it directly
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: `You are a contract analyst. Extract the following key clauses from this contract.

For each clause type, find the relevant text and explain it in plain English.
If a clause type is missing from the contract, note that it's absent.

Clause types to extract:
1. termination — How can either party end the agreement? Notice period? Cause vs. convenience?
2. auto_renewal — Does it auto-renew? How long is the notice period to cancel?
3. liability_cap — What is the maximum liability? Is it capped at fees paid, annual amount, or unlimited?
4. ip_ownership — Who owns work product, integrations, custom code, data?
5. nda_scope — What is confidential? What are the exceptions? How long does it last?
6. indemnification — Who indemnifies whom? Under what circumstances?
7. governing_law — Which state/country law applies? Where are disputes heard?
8. dispute_resolution — Arbitration, mediation, or court? Class action waiver?
9. payment_terms — Net 30? Late fees? Price increase terms?
10. data_processing — How is data handled? GDPR/CCPA compliance? Data deletion?

CONTRACT:
${contractText}

Return a JSON array of objects:
[{
  type: string,          // one of the clause types above
  title: string,         // friendly name like "Termination for Convenience"
  rawText: string,       // verbatim quote from contract (max 500 chars)
  summary: string,       // plain English, 2-4 sentences
  location: string,      // "Section 12.3" or "Page 24, paragraph 2"
  present: boolean       // false if this clause type is missing
}]`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');
  
  // Strip markdown code fences if present
  const jsonText = content.text.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(jsonText) as ExtractedClause[];
}
```

### Step 3: Score Risk Per Clause

```typescript
// analyzer/risk.ts
import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedClause } from './clauses';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ClauseRisk {
  clauseType: string;
  riskLevel: RiskLevel;
  riskScore: number;       // 0-100
  flags: string[];         // specific issues found
  standardMarket: string;  // what's normal in the market
  recommendation: string;  // what to do about it
}

const RISK_BENCHMARKS: Record<string, string> = {
  termination: 'Standard: 30-day notice, termination for cause only, or termination for convenience with 30-90 days notice.',
  auto_renewal: 'Standard: annual renewal with 30-90 day cancellation window.',
  liability_cap: 'Standard: capped at 12 months of fees paid in the preceding year.',
  ip_ownership: 'Standard: vendor owns their platform IP; customer owns their data and custom work product.',
  indemnification: 'Standard: mutual indemnification for IP infringement and gross negligence.',
  nda_scope: 'Standard: 2-3 year term, excludes publicly known info and independent development.',
  governing_law: 'Standard: Delaware or your home state. Watch for vendor-favorable jurisdictions.',
  dispute_resolution: 'Standard: binding arbitration with class action waiver is common in SaaS.',
  payment_terms: 'Standard: Net 30, no more than 1.5%/month late fees, max 5% annual price increase.',
  data_processing: 'Standard: SOC 2 certified, GDPR-compliant, 30-day deletion upon termination.',
};

export async function assessClauseRisk(clause: ExtractedClause): Promise<ClauseRisk> {
  if (!clause.present) {
    return {
      clauseType: clause.type,
      riskLevel: 'medium',
      riskScore: 40,
      flags: [`${clause.title} clause is missing from the contract`],
      standardMarket: RISK_BENCHMARKS[clause.type] || 'Standard terms vary by contract type.',
      recommendation: 'Add this clause explicitly before signing. Absence creates ambiguity.',
    };
  }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `Assess the risk of this ${clause.type} clause for a startup signing as the customer.

CLAUSE TEXT: ${clause.rawText}

MARKET STANDARD: ${RISK_BENCHMARKS[clause.type] || 'Standard SaaS terms'}

Score the risk and identify specific issues. Return JSON:
{
  riskLevel: "low" | "medium" | "high" | "critical",
  riskScore: 0-100,
  flags: string[],          // specific problematic terms (empty if low risk)
  standardMarket: string,   // one sentence on what's normal
  recommendation: string    // one sentence: what to negotiate or accept
}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response');
  const result = JSON.parse(content.text.replace(/```json\n?|\n?```/g, '').trim());

  return {
    clauseType: clause.type,
    ...result,
  } as ClauseRisk;
}
```

### Step 4: Generate the Summary Report

```typescript
// report/generate.ts
import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedClause } from '../analyzer/clauses';
import type { ClauseRisk } from '../analyzer/risk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface AnalysisReport {
  filename: string;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  overallScore: number;
  executiveSummary: string;
  criticalIssues: string[];
  clauseAnalysis: Array<ExtractedClause & { risk: ClauseRisk }>;
  negotiationPriorities: string[];
  missingClauses: string[];
}

export function generateReport(
  filename: string,
  clauses: ExtractedClause[],
  risks: ClauseRisk[]
): AnalysisReport {
  // Combine clauses with their risks
  const clauseAnalysis = clauses.map(clause => ({
    ...clause,
    risk: risks.find(r => r.clauseType === clause.type) || {
      clauseType: clause.type,
      riskLevel: 'medium' as const,
      riskScore: 50,
      flags: [],
      standardMarket: '',
      recommendation: '',
    },
  }));

  const riskScores = risks.map(r => r.riskScore);
  const overallScore = Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length);
  
  const overallRisk: 'low' | 'medium' | 'high' | 'critical' =
    overallScore >= 75 ? 'critical' :
    overallScore >= 50 ? 'high' :
    overallScore >= 25 ? 'medium' : 'low';

  const criticalIssues = risks
    .filter(r => r.riskLevel === 'critical' || r.riskLevel === 'high')
    .flatMap(r => r.flags);

  const missingClauses = clauses
    .filter(c => !c.present)
    .map(c => c.title);

  const negotiationPriorities = risks
    .filter(r => r.riskLevel !== 'low')
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5)
    .map(r => `${r.clauseType}: ${r.recommendation}`);

  const executiveSummary = criticalIssues.length
    ? `This contract has ${criticalIssues.length} high-risk issues requiring negotiation before signing. Key concerns: ${criticalIssues.slice(0, 3).join('; ')}.`
    : `This contract is generally reasonable with minor points to clarify. Overall risk: ${overallRisk}.`;

  return {
    filename,
    overallRisk,
    overallScore,
    executiveSummary,
    criticalIssues,
    clauseAnalysis,
    negotiationPriorities,
    missingClauses,
  };
}

export function formatReportMarkdown(report: AnalysisReport): string {
  const riskEmoji = { low: '🟢', medium: '🟡', high: '🔴', critical: '🚨' };
  
  let md = `# Contract Analysis: ${report.filename}\n\n`;
  md += `**Overall Risk:** ${riskEmoji[report.overallRisk]} ${report.overallRisk.toUpperCase()} (${report.overallScore}/100)\n\n`;
  md += `## Executive Summary\n${report.executiveSummary}\n\n`;

  if (report.criticalIssues.length) {
    md += `## ⚠️ Critical Issues\n`;
    report.criticalIssues.forEach(issue => { md += `- ${issue}\n`; });
    md += '\n';
  }

  if (report.missingClauses.length) {
    md += `## Missing Clauses\n`;
    report.missingClauses.forEach(c => { md += `- ${c}\n`; });
    md += '\n';
  }

  md += `## Negotiation Priorities\n`;
  report.negotiationPriorities.forEach((p, i) => { md += `${i + 1}. ${p}\n`; });
  md += '\n';

  md += `## Clause-by-Clause Analysis\n\n`;
  report.clauseAnalysis.forEach(clause => {
    md += `### ${riskEmoji[clause.risk.riskLevel]} ${clause.title}\n`;
    md += `**Risk:** ${clause.risk.riskLevel} | **Location:** ${clause.location}\n\n`;
    md += `**What it says:** ${clause.summary}\n\n`;
    if (clause.risk.flags.length) {
      md += `**Issues:**\n`;
      clause.risk.flags.forEach(f => { md += `- ${f}\n`; });
      md += '\n';
    }
    md += `**Recommendation:** ${clause.risk.recommendation}\n\n`;
  });

  return md;
}
```

### Step 5: Run the Full Analysis

```typescript
// index.ts
import * as fs from 'fs';
import { extractContractText } from './extractor/document';
import { extractClauses } from './analyzer/clauses';
import { assessClauseRisk } from './analyzer/risk';
import { generateReport, formatReportMarkdown } from './report/generate';

async function analyzeContract(filePath: string) {
  console.log(`Analyzing: ${filePath}`);
  
  const doc = await extractContractText(filePath);
  console.log(`Extracted ${doc.charCount} chars from ${doc.pageCount || '?'} pages`);

  console.log('Identifying key clauses...');
  const clauses = await extractClauses(doc.text);
  console.log(`Found ${clauses.filter(c => c.present).length}/${clauses.length} clause types`);

  console.log('Assessing risk...');
  const risks = await Promise.all(clauses.map(c => assessClauseRisk(c)));

  const report = generateReport(doc.filename, clauses, risks);
  const markdown = formatReportMarkdown(report);
  
  // Save report
  const outputPath = filePath.replace(/\.(pdf|docx?)$/, '-analysis.md');
  fs.writeFileSync(outputPath, markdown);
  
  console.log(`\nReport saved to: ${outputPath}`);
  console.log(`Overall Risk: ${report.overallRisk.toUpperCase()}`);
  console.log(`Critical Issues: ${report.criticalIssues.length}`);
  console.log(`Negotiation Priorities: ${report.negotiationPriorities.length}`);
  
  return report;
}

analyzeContract('./contracts/vendor-agreement.pdf');
```

## What You've Built

A contract analyzer that turns 47-page PDFs into a 10-minute read — clause-by-clause risk breakdown, plain-English summaries, and specific negotiation recommendations.

**Next steps:** Add a web UI to drag-and-drop contracts. Build a template library of your company's standard terms to compare against. Add email integration to receive contracts directly and return analyses automatically.
