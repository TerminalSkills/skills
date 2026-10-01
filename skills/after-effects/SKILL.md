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
compatibility: 'After Effects 2023 or later (checked against 26.5), ExtendScript (ECMAScript 3), CEP 12 panels from After Effects 25.0'
metadata:
  author: terminal-skills
  version: 1.1.0
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

Automate Adobe After Effects — the industry-standard motion graphics and compositing tool. This skill covers ExtendScript for programmatic project manipulation, CEP panel development, expressions for procedural animation, aerender CLI for headless batch rendering, MOGRT template automation, data-driven graphics, and production pipeline integration. Build repeatable workflows for social media content, broadcast graphics, and VFX pipelines.

After Effects is commercial software; scripts and aerender need a licensed install (render-only machines can run aerender without signing in, see Step 5).

## Instructions

### Step 1: Scripting Approaches

1. **ExtendScript** (.jsx / .jsxbin) — Full project DOM access, runs inside AE
2. **Expressions** — JavaScript evaluated per frame on a single property
3. **CEP panels** — HTML/JS panels that call ExtendScript through `CSInterface.evalScript`
4. **aerender** — Command-line renderer (headless)
5. **UXP plugins** — Adobe documents an After Effects UXP API (`require("aftereffects")`, same object model) as a beta with minimum version 27.0; the released app is 26.5, so ship CEP + ExtendScript today

**Run an ExtendScript:**
```bash
# In the app: File > Scripts > Run Script File. Files in the Scripts folder appear in File > Scripts;
# Scripts/Startup and Scripts/Shutdown run automatically; "ScriptUI Panels" scripts appear in the Window menu.

# Windows: send a file (-r) or a script string (-s) to the running instance
"C:\Program Files\Adobe\Adobe After Effects 2025\Support Files\AfterFX.exe" -r "C:\motion\scripts\social-cards.jsx"

# macOS: the AppleScript command DoScript takes script text
osascript -e 'tell application "Adobe After Effects 2025" to DoScript "$.evalFile(\"/Users/maria/motion/scripts/social-cards.jsx\")"'
```

Adobe writes the install folder as `Adobe After Effects <version>`; `2025` is an example, so use the folder and application name on your machine. Scripts cannot write files or use the network until **Settings/Preferences > Scripting & Expressions > Allow Scripts To Write Files And Access Network** is enabled.

### Step 2: ExtendScript — Project & Layer Operations

```javascript
app.beginUndoGroup("Build social post");
var project = app.project;

// Create composition: name, width, height, pixel aspect, duration (s), frame rate
var comp = project.items.addComp("Social Post", 1080, 1920, 1, 10, 30);

// Import footage
var footage = project.importFile(new ImportOptions(new File("/Users/maria/motion/footage/skyline.mp4")));

// Add layers to comp
var layer = comp.layers.add(footage);
var textLayer = comp.layers.addText("Hello World");

// Configure text
var textProp = textLayer.property("Source Text");
var textDoc = textProp.value;
textDoc.fontSize = 72;
textDoc.fillColor = [1, 1, 1];
textDoc.font = "Arial-BoldMT";          // PostScript name
textProp.setValue(textDoc);

// Animate position with easing
var position = textLayer.property("Position");
position.setValueAtTime(0, [540, 1100]);
position.setValueAtTime(1, [540, 960]);
var ease = new KeyframeEase(0, 75);      // speed, influence (0.1–100)
// Position is a spatial property: the ease array holds ONE KeyframeEase.
// Non-spatial 2D/3D properties need one per dimension (the scripting guide's Scale example passes three).
position.setTemporalEaseAtKey(1, [ease]);
position.setTemporalEaseAtKey(2, [ease]);

// Add an expression control and drive an expression with it
var slider = textLayer.property("Effects").addProperty("Slider Control");
slider.property("Slider").setValue(12);
position.expression = 'wiggle(2, effect("Slider Control")("Slider"))';
app.endUndoGroup();
```

### Step 3: Template Automation (Data-Driven)

```javascript
// template-batch.jsx — one comp per CSV row, text layers replaced by column name
// CSV header: Title,Subtitle,Date — the template has text layers with those names
function readCSV(path) {                 // simple parser: no quoted commas
    var file = new File(path), rows = [], header, line, cells, row, i;
    if (!file.open("r")) throw new Error("Cannot open " + path);
    header = file.readln().split(",");
    while (!file.eof) {
        line = file.readln();
        if (line === "") continue;
        cells = line.split(",");
        row = {};
        for (i = 0; i < header.length; i++) row[header[i]] = cells[i];
        rows.push(row);
    }
    file.close();
    return rows;
}

function processTemplate(comp, data) {
    for (var i = 1; i <= comp.numLayers; i++) {      // collections are 1-based
        var layer = comp.layer(i);
        if (layer instanceof TextLayer && data.hasOwnProperty(layer.name)) {
            var textProp = layer.property("Source Text");
            var textDoc = textProp.value;
            textDoc.text = data[layer.name];
            textProp.setValue(textDoc);
        }
    }
}

app.beginUndoGroup("Batch from CSV");
var templateComp = app.project.activeItem;
var csvData = readCSV("/Users/maria/motion/data/events.csv");
for (var r = 0; r < csvData.length; r++) {
    var newComp = templateComp.duplicate();
    newComp.name = "Output_" + (r + 1);
    processTemplate(newComp, csvData[r]);
    var rqItem = app.project.renderQueue.items.add(newComp);
    rqItem.outputModule(1).applyTemplate("Lossless");            // name of an existing template
    rqItem.outputModule(1).file = new File("/Users/maria/motion/renders/" + newComp.name + ".mov");
}
app.endUndoGroup();
app.project.save();                      // then render the queue with aerender or renderQueue.render()
```

Swap an image layer with `layer.replaceSource(newFootageItem, false)`.

### Step 4: Expressions

```javascript
// Wiggle: wiggle(5, 50)   — 5 times/sec, 50px amplitude
// Loop: loopOut("cycle")
// Fade in (Opacity): linear(time, 0, 1, 0, 100)

// Overshoot / bounce after each keyframe (apply to Position)
var amp = 40, freq = 30, decay = 50;
var nK = nearestKey(time);
var n = (nK.time <= time) ? nK.index : nK.index - 1;
var t = (n === 0) ? 0 : time - key(n).time;
if (n > 0 && t < 1) {
    var v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);
    value + v * amp * 0.001 * Math.sin(freq * 0.1 * t * 2 * Math.PI) / Math.exp(decay * 0.1 * t);
} else { value; }

// Counter (on Source Text): Math.round(linear(time, 0, 3, 0, 1000));

// Follow null with delay
var delay = 0.5;
thisComp.layer("Null 1").position.valueAtTime(time - delay);

// Data-driven: read a JSON file imported into the project
var data = footage("scores.json").sourceData;
data[0].homeTeam;
```

New projects use the JavaScript expression engine (Project Settings > Expressions); projects saved by old versions default to Legacy ExtendScript. In the JavaScript engine an expression must not end in an `if` without `else`, and `this` must be written `thisLayer`.

### Step 5: aerender — Command-Line Rendering

```bash
# Render one comp (added to the render queue if it is not there yet)
aerender -project "/Volumes/render/projects/promo.aep" -comp "Main Comp" -output "/Volumes/render/out/promo.mov"

# With templates, a frame range and Multi-Frame Rendering capped at 85% CPU
aerender \
  -project "/Volumes/render/projects/promo.aep" \
  -comp "Main Comp" \
  -RStemplate "Best Settings" \
  -OMtemplate "Multi-Machine Sequence" \
  -output "/Volumes/render/out/promo_[####].psd" \
  -s 0 -e 300 -mfr ON 85 \
  -v ERRORS_AND_PROGRESS -log "/Volumes/render/logs/promo.log"

# Render the whole queue exactly as saved in the project
aerender -project "/Volumes/render/projects/promo.aep"

# macOS: /Applications/Adobe After Effects 2025/aerender
# Windows: "C:\Program Files\Adobe\Adobe After Effects 2025\Support Files\aerender.exe"
```

Other options: `-rqindex 2` (render one queue item), `-i 2` (frame increment), `-mem_usage 50 80` (image cache %, max memory %), `-reuse` (use the running instance), `-continueOnMissingFootage`, `-close DO_NOT_SAVE_CHANGES|SAVE_CHANGES|DO_NOT_CLOSE`, `-sound ON`, `-version`, `-help`. `-e` is inclusive. Without `-comp` or `-rqindex`, the template, output, frame-range and `-i` options are ignored. The old `-mp` flag is not in the current option list — use `-mfr`.

Template names must exist on the render machine. Adobe ships render settings templates such as "Best Settings", "Draft Settings" and "Multi-Machine Settings" and output module templates such as "Lossless"; create others (H.264, ProRes) under **Edit > Templates > Output Module** and pass the name you saved. `rqItem.outputModule(1).templates` lists the names available to a script.

A complete batch script that loops over projects is in Example 2.

A render-only machine needs no sign-in: install After Effects, sign out, and place an empty `ae_render_only_node.txt` in the user's Documents folder or in `/Users/Shared/Adobe/` (macOS) or `C:\Users\Public\Documents\Adobe` (Windows).

### Step 6: MOGRT & CEP Panels

**Build and export a Motion Graphics template from a script:**
```javascript
var comp = app.project.activeItem;
var sourceText = comp.layer("Title").property("Source Text");
if (sourceText.canAddToMotionGraphicsTemplate(comp)) {
    sourceText.addToMotionGraphicsTemplate(comp);          // adds it to the Essential Graphics panel
}
comp.motionGraphicsTemplateName = "Lower Third";           // becomes "Lower Third.mogrt"
app.project.save();                                        // otherwise AE prompts to save
comp.exportAsMotionGraphicsTemplate(true, "/Users/maria/motion/mogrt");   // overwrite, target folder
```

Scriptable property types are Checkbox, Color, numerical Slider (single-value properties such as Opacity) and Source Text.

**CEP panel bridge** (call ExtendScript from panel JS):
```javascript
const csInterface = new CSInterface();
function runInAE(script) {
    return new Promise((resolve, reject) => {
        csInterface.evalScript(script, (result) => {
            if (result === "EvalScript error.") reject(new Error(result));
            else resolve(result);
        });
    });
}
// Example (inside an async function): get comp names from AE. ExtendScript is ES3 — no JSON object, so join a string.
const result = await runInAE(`
    var names = [];
    for (var i = 1; i <= app.project.numItems; i++) {
        if (app.project.item(i) instanceof CompItem) names.push(app.project.item(i).name);
    }
    names.join("\\n");
`);
const compNames = result ? result.split("\n") : [];
```

Unsigned panels load only in debug mode: `defaults write com.adobe.CSXS.12 PlayerDebugMode 1` on macOS, or the string value `PlayerDebugMode=1` under `HKEY_CURRENT_USER/Software/Adobe/CSXS.12` on Windows.

## Examples

### Example 1: Batch-generate 50 social media cards from a spreadsheet
**User prompt:** "I have a CSV with 50 rows of product names, prices, and image paths. Write an ExtendScript that duplicates my 'Product Card' template comp for each row, replaces the Title, Price, and Photo layers, and queues them all for rendering."

Use `template-batch.jsx` from Step 3 with the header `Title,Price,Photo` and add the image swap inside the row loop:

```javascript
var photo = app.project.importFile(new ImportOptions(new File(csvData[r].Photo)));
newComp.layer("Photo").replaceSource(photo, false);
```

Open the project, select the "Product Card" comp, enable Allow Scripts To Write Files, and run the script from File > Scripts > Run Script File. Result: 50 comps named `Output_1` … `Output_50` in the Project panel and 50 queued items in the Render Queue, each writing `/Users/maria/motion/renders/Output_N.mov`; one Edit > Undo removes the whole batch. Render them with `aerender -project "/Users/maria/motion/cards.aep"`.

### Example 2: Set up a nightly render pipeline with aerender
**User prompt:** "Create a bash script that finds all .aep files in /projects/daily-renders/, renders the 'Export' comp from each one as ProRes 422 to /output/YYYY-MM-DD/, and sends a Slack notification when done."

```bash
#!/bin/bash
# nightly-render.sh — needs an output module template saved as "ProRes 422" on this machine
AERENDER="/Applications/Adobe After Effects 2025/aerender"
OUT="/output/$(date +%F)"
mkdir -p "$OUT"
ok=0; failed=0
for aep in /projects/daily-renders/*.aep; do
    [ -e "$aep" ] || continue            # no projects: the glob stays literal
    name=$(basename "$aep" .aep)
    "$AERENDER" -project "$aep" -comp "Export" -OMtemplate "ProRes 422" \
        -output "$OUT/${name}.mov" -mfr ON 100 -v ERRORS -log "$OUT/${name}.log"
    if [ -s "$OUT/${name}.mov" ]; then ok=$((ok + 1)); else failed=$((failed + 1)); fi
done
curl -fsS -X POST -H 'Content-Type: application/json' \
    -d "{\"text\":\"Nightly renders: ${ok} done, ${failed} failed (${OUT})\"}" "$SLACK_WEBHOOK_URL"
```

Schedule it with `0 1 * * * /opt/render/nightly-render.sh` in a crontab that also defines `SLACK_WEBHOOK_URL` (cron does not load your shell profile). Result: files such as `/output/2026-10-01/promo_spring.mov` with a log next to each, and a Slack message "Nightly renders: 12 done, 0 failed (/output/2026-10-01)".

## Guidelines

- ExtendScript implements ECMAScript 3 (no `let`/`const`, no arrow functions, no template literals, no `JSON`) so always use `var` and string concatenation
- Close every `File` you open, and render long batches through aerender (a fresh process per project) rather than inside the interactive app
- Use `app.beginUndoGroup()` and `app.endUndoGroup()` around ExtendScript modifications so the entire operation can be reverted with a single undo
- Test aerender commands with a short frame range (`-s 0 -e 10`) before running full batch renders to catch template or path errors early
- Check the output file and the `-log` file after each render; Adobe's option list does not define exit codes, so do not rely on them alone
- `setTemporalEaseAtKey` needs an ease array whose length matches the property: 1 for spatial and one-dimensional properties, 2 or 3 for other two- and three-dimensional ones
- Project items and layers are indexed from 1; `comp.layers.byName("Title")` returns the topmost layer with that name, or null
- Treat the Slack webhook URL and any paths with client data as secrets: read them from the environment, not from the script
- Fonts, effects and third-party plug-ins used by a project must be installed on every render machine, with a licence that allows it
- Not for server-side video generation without an After Effects install — aerender cannot run without the application
