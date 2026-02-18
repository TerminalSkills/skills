---
name: after-effects
description: >-
  Automate Adobe After Effects workflows. Use when a user asks to script After
  Effects with ExtendScript or CEP, batch render compositions, automate motion
  graphics templates (MOGRTs), build render pipelines with aerender, create
  expressions for animations, manage project files programmatically, automate
  text and image replacements in templates, build data-driven motion graphics,
  integrate After Effects with CI/CD, or control AE via command line. Covers
  ExtendScript, CEP panels, expressions, aerender CLI, and template automation.
license: Apache-2.0
compatibility: 'After Effects 2023+, ExtendScript (ES3), Node.js for CEP'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: content
  tags:
    - after-effects
    - motion-graphics
    - vfx
    - scripting
    - extendscript
---

# After Effects

## Overview

Automate Adobe After Effects — the industry-standard motion graphics and compositing tool. This skill covers ExtendScript for programmatic project manipulation, CEP/UXP panel development, expressions for procedural animation, aerender CLI for headless batch rendering, MOGRT template automation, data-driven graphics, and production pipeline integration. Build repeatable workflows for social media content, broadcast graphics, and VFX pipelines.

## Instructions

### Step 1: Scripting Approaches

1. **ExtendScript** (.jsx) — Full project DOM access, runs inside AE
2. **Expressions** — Per-property JavaScript-like code, runs per-frame
3. **CEP/UXP Panels** — HTML/JS panels with ExtendScript bridge
4. **aerender** — Command-line renderer (headless)

**Run an ExtendScript:**
```bash
# From AE: File > Scripts > Run Script File
# Or place in Scripts/Startup/ for auto-run
# macOS CLI:
osascript -e 'tell application "Adobe After Effects 2024" to DoScript "$.evalFile(\"/path/to/script.jsx\")"'
```

### Step 2: ExtendScript — Project & Layer Operations

```javascript
var project = app.project;

// Create composition
var comp = project.items.addComp("Social Post", 1080, 1920, 1, 10, 30);

// Import footage
var footage = project.importFile(new ImportOptions(new File("/path/to/footage.mp4")));

// Add layers to comp
var layer = comp.layers.add(footage);
var textLayer = comp.layers.addText("Hello World");

// Configure text
var textProp = textLayer.property("Source Text");
var textDoc = textProp.value;
textDoc.fontSize = 72;
textDoc.fillColor = [1, 1, 1];
textDoc.font = "Arial-BoldMT";
textProp.setValue(textDoc);

// Animate position with easing
var position = textLayer.property("Position");
position.setValueAtTime(0, [960, 540]);
position.setValueAtTime(1, [960, 300]);
var ease = new KeyframeEase(0, 75);
position.setTemporalEaseAtKey(1, [ease, ease]);
position.setTemporalEaseAtKey(2, [ease, ease]);

// Add effect
var blur = textLayer.property("Effects").addProperty("Gaussian Blur");
blur.property("Blurriness").setValue(5);
```

### Step 3: Template Automation (Data-Driven)

```javascript
// template-batch.jsx — Replace text layers in a template from CSV data
function processTemplate(comp, data) {
    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        if (layer instanceof TextLayer && data.hasOwnProperty(layer.name)) {
            var textProp = layer.property("Source Text");
            var textDoc = textProp.value;
            textDoc.text = data[layer.name];
            textProp.setValue(textDoc);
        }
    }
}

// CSV format: Title,Subtitle,Date
// Template has text layers named: Title, Subtitle, Date
var templateComp = app.project.activeItem;
var csvData = readCSV("/path/to/data.csv");  // Parse CSV into array of objects

for (var r = 0; r < csvData.length; r++) {
    var newComp = templateComp.duplicate();
    newComp.name = "Output_" + (r + 1);
    processTemplate(newComp, csvData[r]);
}
```

### Step 4: Expressions

```javascript
// Wiggle: wiggle(5, 50)   — 5 times/sec, 50px amplitude
// Loop: loopOut("cycle")
// Fade in: linear(time, 0, 1, 0, 100)

// Bounce expression (apply to Position)
amplitude = 15; frequency = 3; decay = 5; n = 0;
if (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }
if (n > 0) {
    t = time - key(n).time;
    value + amplitude * Math.sin(frequency * t * 2 * Math.PI) / Math.exp(decay * t);
} else { value; }

// Typewriter (on Source Text)
str = value; n = Math.round(time * 20); str.substr(0, n);

// Counter: Math.round(linear(time, 0, 3, 0, 1000));

// Follow null with delay
delay = 0.5;
thisComp.layer("Null 1").position.valueAtTime(time - delay);
```

### Step 5: aerender — Command-Line Rendering

```bash
# Basic render
aerender -project "/path/to/project.aep" -comp "Main Comp" -output "/renders/output.mov"

# With settings
aerender \
  -project "/path/to/project.aep" \
  -comp "Main Comp" \
  -output "/renders/output_[####].png" \
  -RStemplate "Best Settings" \
  -OMtemplate "PNG Sequence" \
  -s 0 -e 300 -mp

# macOS path: /Applications/Adobe\ After\ Effects\ 2024/aerender
# Windows: "C:\Program Files\Adobe\Adobe After Effects 2024\Support Files\aerender.exe"
```

**Batch render script:**
```bash
#!/bin/bash
AERENDER="/Applications/Adobe After Effects 2024/aerender"
for aep in /projects/*.aep; do
    name=$(basename "$aep" .aep)
    "$AERENDER" -project "$aep" -RStemplate "Best Settings" -OMtemplate "H.264" \
        -output "/renders/${name}.mp4" -mp
done
```

### Step 6: MOGRT & CEP Panels

**Automate MOGRT property setup:**
```javascript
var comp = app.project.activeItem;
var textLayer = comp.layer("Title");
var sourceText = textLayer.property("Source Text");
comp.addMotionGraphicsTemplateController(sourceText);
// Then export via Essential Graphics panel
```

**CEP panel bridge** (call ExtendScript from panel JS):
```javascript
const csInterface = new CSInterface();
function runInAE(script) {
    return new Promise((resolve, reject) => {
        csInterface.evalScript(script, (result) => {
            if (result === "EvalScript error.") reject(result);
            else resolve(result);
        });
    });
}
// Example: get comp names from AE
const result = await runInAE(`
    var names = [];
    for (var i = 1; i <= app.project.numItems; i++) {
        if (app.project.item(i) instanceof CompItem) names.push(app.project.item(i).name);
    }
    JSON.stringify(names);
`);
```

## Examples

### Example 1: Batch-generate 50 social media cards from a spreadsheet
**User prompt:** "I have a CSV with 50 rows of product names, prices, and image paths. Write an ExtendScript that duplicates my 'Product Card' template comp for each row, replaces the Title, Price, and Photo layers, and queues them all for rendering."

The agent will create a `.jsx` script that reads the CSV file, iterates over each row, duplicates the template composition, replaces text layer values using `property("Source Text")`, swaps the Photo layer source via `replaceSource()` with imported images, adds each comp to the render queue with H.264 output settings, and logs progress to the ExtendScript console.

### Example 2: Set up a nightly render pipeline with aerender
**User prompt:** "Create a bash script that finds all .aep files in /projects/daily-renders/, renders the 'Export' comp from each one as ProRes 422 to /output/YYYY-MM-DD/, and sends a Slack notification when done."

The agent will write a shell script that iterates over `.aep` files using a for loop, calls `aerender` with `-comp "Export"` and `-OMtemplate "Apple ProRes 422"` targeting a date-stamped output directory, captures exit codes to track successes and failures, and posts a summary to a Slack webhook with `curl` when all renders complete.

## Guidelines

- ExtendScript uses ES3 syntax (no `let`/`const`, no arrow functions, no template literals) so always use `var` and string concatenation
- Always close clips and release file handles in batch scripts to avoid AE running out of memory on large jobs
- Use `app.beginUndoGroup()` and `app.endUndoGroup()` around ExtendScript modifications so the entire operation can be reverted with a single undo
- Test aerender commands with a short frame range (`-s 0 -e 10`) before running full batch renders to catch template or path errors early
- MOGRT templates must have properties added to the Essential Graphics panel before export; scripting can add controllers but cannot create the MOGRT file itself
