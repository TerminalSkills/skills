#!/usr/bin/env node

/**
 * Generates skills/index.json from all SKILL.md files.
 * Run from the skills repo root: node scripts/generate-index.js
 */

import { readFileSync, readdirSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(__dirname, '..', 'skills');

function parseDescription(frontmatter) {
  // Handle multiline description (>- or >)
  const lines = frontmatter.split('\n');
  let desc = '';
  let inDescription = false;

  for (const line of lines) {
    if (line.match(/^description:\s*/)) {
      const value = line.replace(/^description:\s*/, '').trim();
      if (value === '>-' || value === '>' || value === '|') {
        inDescription = true;
        continue;
      }
      desc = value.replace(/^["']|["']$/g, '');
      break;
    }
    if (inDescription) {
      if (line.match(/^\S/) && line.trim() !== '') {
        break; // New top-level key
      }
      if (line.trim()) {
        desc += (desc ? ' ' : '') + line.trim();
      }
    }
  }
  return desc;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fm = match[1];
  const result = { name: '', description: '', category: '', tags: [] };

  // Name
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  if (nameMatch) result.name = nameMatch[1].trim().replace(/^["']|["']$/g, '');

  // Description (multiline-aware)
  result.description = parseDescription(fm);

  // Category (may be nested under metadata)
  const catMatch = fm.match(/^\s*category:\s*(.+)$/m);
  if (catMatch) result.category = catMatch[1].trim().replace(/^["']|["']$/g, '');

  // Tags
  const tagsMatch = fm.match(/^\s*tags:\s*\[([^\]]*)\]/m);
  if (tagsMatch) {
    result.tags = tagsMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, ''));
  }

  return result;
}

const entries = [];
const categories = new Set();

const dirs = readdirSync(skillsDir).filter(d => {
  try {
    return statSync(join(skillsDir, d)).isDirectory();
  } catch {
    return false;
  }
});

for (const dir of dirs.sort()) {
  const skillFile = join(skillsDir, dir, 'SKILL.md');
  try {
    const content = readFileSync(skillFile, 'utf-8');
    const meta = parseFrontmatter(content);
    if (!meta || !meta.name) continue;

    entries.push({
      name: meta.name,
      slug: dir,
      description: meta.description,
      category: meta.category,
      tags: meta.tags,
    });

    if (meta.category) categories.add(meta.category);
  } catch {
    // Skip directories without SKILL.md
  }
}

const index = {
  skills: entries,
  categories: [...categories].sort(),
  updatedAt: new Date().toISOString(),
};

const outPath = join(skillsDir, 'index.json');
writeFileSync(outPath, JSON.stringify(index, null, 2) + '\n');
console.log(`Generated index.json with ${entries.length} skills and ${index.categories.length} categories`);
