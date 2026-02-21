---
title: "Organize Terabytes of Project Files Automatically"
slug: organize-terabytes-of-project-files-automatically
description: "Sort, rename, and structure thousands of disorganized project files across directories using rule-based automation and batch processing."
skills:
  - file-organizer
  - batch-processor
category: automation
tags:
  - file-management
  - organization
  - batch-processing
  - cleanup
---

# Organize Terabytes of Project Files Automatically

## The Problem

A video production company has 2.3 TB of files across 14,000 items dumped into a flat "Downloads" and "Projects" folder over two years. Camera footage sits next to client contracts, temporary exports next to final deliverables, and five versions of the same file have names like "final_v2_REAL_final.mp4". Finding a specific client's raw footage means scrolling through thousands of files. Last week, an editor accidentally sent a client the wrong project's footage because the filenames were so similar.

## The Solution

Using **file-organizer** to classify and sort files by type, date, and naming patterns, combined with **batch-processor** to handle the volume efficiently, the company transforms a chaotic flat directory into a structured archive in under 20 minutes.

## Step-by-Step Walkthrough

### 1. Scan and classify all files

Analyze the entire directory to build a manifest of file types, sizes, dates, and naming patterns.

> Scan /data/projects/ recursively and classify all 14,000 files. Group them by: file type (video, audio, image, document, project file), creation date, detected client name from filename patterns, and file size. Output a manifest to /reports/file_manifest.csv with columns for path, type, size, date, and suggested destination folder.

### 2. Define organization rules and folder structure

Create a rule set that maps file classifications to a clean directory hierarchy.

> Set up file organization rules: video files (.mp4, .mov, .mxf) go to /archive/{client}/{year}/{project}/footage/, audio files go to /archive/{client}/{year}/{project}/audio/, project files (.prproj, .aep, .blend) go to /archive/{client}/{year}/{project}/projects/, documents (.pdf, .docx) go to /archive/{client}/{year}/contracts/. Extract client name from the first segment of the filename before the underscore. Rename files to follow the pattern {client}_{project}_{type}_{sequence}.{ext}.

### 3. Execute the batch move with conflict resolution

Process all 14,000 files through the rules, handling duplicates and edge cases.

> Use batch-processor to move all 14,000 files according to the rules. For duplicates: compare file hashes and skip exact duplicates (log them to /reports/duplicates.csv), keep the newer version for near-duplicates with similar names. Process in batches of 500 files with a dry-run first that outputs planned moves to /reports/dry_run.csv. After review, execute the actual moves.

### 4. Generate a searchable index and cleanup report

Build a final index of the organized archive and report on space recovered from duplicates.

> Generate a searchable JSON index of the final archive structure at /archive/index.json. Include a summary report: total files organized, duplicates removed, space recovered, files that could not be classified (moved to /archive/_unsorted/), and a breakdown by client showing total storage used per client.

## Real-World Example

The production company ran the pipeline on a Saturday morning. The scan identified 14,000 files totaling 2.3 TB, of which 1,800 were exact duplicates consuming 340 GB. After the dry-run review confirmed the moves looked correct, the batch processor reorganized everything into a clean client/year/project hierarchy in 18 minutes. The team recovered 340 GB of duplicate storage, and the editor who had been spending 15 minutes per day searching for files now finds anything in seconds using the searchable index.
