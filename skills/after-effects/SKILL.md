---
name: after-effects
description: >-
  Automate Adobe After Effects workflows. Use when a user asks to script
  After Effects with ExtendScript or CEP, batch render compositions,
  automate motion graphics templates (MOGRTs), build render pipelines with
  aerender, create expressions for animations, manage project files
  programmatically, automate text and image replacements in templates,
  build data-driven motion graphics, integrate After Effects with CI/CD,
  or control AE via command line. Covers ExtendScript, CEP panels,
  expressions, aerender CLI, and template automation.
license: Apache-2.0
compatibility: "After Effects 2023+, ExtendScript (ES3), Node.js for CEP"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: video
  tags: ["after-effects", "motion-graphics", "vfx", "scripting", "extendscript", "mogrt"]
---

# After Effects

## Overview

Automate Adobe After Effects — the industry-standard motion graphics and compositing tool. This skill covers ExtendScript for programmatic project manipulation, CEP/UXP panel development, expressions for procedural animation, aerender CLI for headless batch rendering, MOGRT template automation, data-driven graphics, and production pipeline integration. Build repeatable workflows for social media content, broadcast graphics, and VFX pipelines.

## Instructions

### Step 1: Scripting Overview

After Effects supports three scripting approaches:

1. **ExtendScript** (.jsx) — Full project DOM access, runs inside AE
2. **Expressions** — Per-property JavaScript-like code, runs per-frame
3. **CEP/UXP Panels** — HTML/JS panels with ExtendScript bridge
4. **aerender** — Command-line renderer (headless)

**Run an ExtendScript:**
```bash
# From AE: File → Scripts → Run Script File
# Or: Place in Scripts/Startup/ for auto-run
# Or via CLI (macOS):
osascript -e 'tell application "Adobe After Effects 2024" to DoScript "$.evalFile(\"/path/to/script.jsx\")"'
```

### Step 2: ExtendScript — Project Manipulation

**Basic project operations:**
```javascript
// Access the current project
var project = app.project;
var numItems = project.numItems;

// List all items in project
for (var i = 1; i <= numItems; i++) {
    var item = project.item(i);
    alert(item.name + " | Type: " + item.typeName);
}

// Create a new composition
var comp = project.items.addComp("Social Post", 1080, 1920, 1, 10, 30);
// (name, width, height, pixelAspect, duration, frameRate)

// Import footage
var importOptions = new ImportOptions(new File("/path/to/footage.mp4"));
var footage = project.importFile(importOptions);

// Import image sequence
importOptions = new ImportOptions(new File("/path/to/seq_0001.png"));
importOptions.sequence = true;
importOptions.forceAlphabetical = true;
var sequence = project.importFile(importOptions);

// Create folder
var folder = project.items.addFolder("Assets");

// Move item to folder
footage.parentFolder = folder;
```

**Layer operations:**
```javascript
var comp = app.project.activeItem; // Current composition

// Add footage to comp
var layer = comp.layers.add(footage);
layer.startTime = 0;

// Add solid
var solid = comp.layers.addSolid([0.1, 0.1, 0.1], "Background", 1920, 1080, 1, 10);
solid.moveToEnd();

// Add text layer
var textLayer = comp.layers.addText("Hello World");
var textProp = textLayer.property("Source Text");
var textDoc = textProp.value;
textDoc.fontSize = 72;
textDoc.fillColor = [1, 1, 1]; // White
textDoc.font = "Arial-BoldMT";
textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;
textProp.setValue(textDoc);

// Position and animate
var position = textLayer.property("Position");
position.setValueAtTime(0, [960, 540]);
position.setValueAtTime(1, [960, 300]);

// Add easing
var easeIn = new KeyframeEase(0, 75);
var easeOut = new KeyframeEase(0, 75);
position.setTemporalEaseAtKey(1, [easeIn, easeIn]);
position.setTemporalEaseAtKey(2, [easeOut, easeOut]);

// Opacity animation
var opacity = textLayer.property("Opacity");
opacity.setValueAtTime(0, 0);
opacity.setValueAtTime(0.5, 100);

// Scale
var scale = textLayer.property("Scale");
scale.setValue([100, 100]);

// Add effects
var blur = textLayer.property("Effects").addProperty("Gaussian Blur");
blur.property("Blurriness").setValue(5);
```

### Step 3: Template Automation (Data-Driven)

**Batch text replacement from CSV:**
```javascript
// template-batch.jsx
// Replaces text layers in a template comp from a data source

function processTemplate(comp, data) {
    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        
        if (layer instanceof TextLayer) {
            var layerName = layer.name;
            if (data.hasOwnProperty(layerName)) {
                var textProp = layer.property("Source Text");
                var textDoc = textProp.value;
                textDoc.text = data[layerName];
                textProp.setValue(textDoc);
            }
        }
    }
}

// Read CSV
function readCSV(filePath) {
    var file = new File(filePath);
    file.open("r");
    var content = file.read();
    file.close();
    
    var lines = content.split("\n");
    var headers = lines[0].split(",");
    var rows = [];
    
    for (var i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "") continue;
        var values = lines[i].split(",");
        var row = {};
        for (var j = 0; j < headers.length; j++) {
            row[headers[j].trim()] = values[j] ? values[j].trim() : "";
        }
        rows.push(row);
    }
    return rows;
}

// Main
var templateComp = app.project.activeItem;
var csvData = readCSV("/path/to/data.csv");

// CSV format: Title,Subtitle,Date,ImagePath
// Template has text layers named: Title, Subtitle, Date

for (var r = 0; r < csvData.length; r++) {
    // Duplicate comp
    var newComp = templateComp.duplicate();
    newComp.name = "Output_" + (r + 1);
    
    // Replace text
    processTemplate(newComp, csvData[r]);
    
    // Replace image if ImagePath column exists
    if (csvData[r].ImagePath) {
        for (var i = 1; i <= newComp.numLayers; i++) {
            if (newComp.layer(i).name === "Photo") {
                var newSource = app.project.importFile(
                    new ImportOptions(new File(csvData[r].ImagePath))
                );
                newComp.layer(i).replaceSource(newSource, false);
            }
        }
    }
}

alert("Created " + csvData.length + " compositions from template");
```

### Step 4: Expressions (Per-Frame Code)

```javascript
// Wiggle position
wiggle(5, 50)  // 5 times/sec, 50px amplitude

// Smooth loop
loopOut("cycle")

// Time-based fade in
linear(time, 0, 1, 0, 100)  // Fade opacity from 0→100 over 1 second

// Link to slider control
effect("Slider Control")("Slider")

// Bounce expression
amplitude = 15;
frequency = 3;
decay = 5;
n = 0;
if (numKeys > 0) {
    n = nearestKey(time).index;
    if (key(n).time > time) n--;
}
if (n > 0) {
    t = time - key(n).time;
    value + amplitude * Math.sin(frequency * t * 2 * Math.PI) / Math.exp(decay * t);
} else {
    value;
}

// Typewriter effect (on Source Text)
str = value;
n = Math.round(time * 20); // 20 chars per second
str.substr(0, n);

// Counter (number counting up)
start = 0;
end = 1000;
duration = 3; // seconds
Math.round(linear(time, 0, duration, start, end));

// Follow null's position with delay
delay = 0.5; // seconds
thisComp.layer("Null 1").position.valueAtTime(time - delay);

// Random color per frame
seedRandom(index, true);
[random(), random(), random(), 1];
```

### Step 5: aerender — Command-Line Rendering

```bash
# Basic render
aerender -project "/path/to/project.aep" -comp "Main Comp" -output "/renders/output.mov"

# Render with settings
aerender \
  -project "/path/to/project.aep" \
  -comp "Main Comp" \
  -output "/renders/output_[####].png" \
  -RStemplate "Best Settings" \
  -OMtemplate "PNG Sequence" \
  -s 0 -e 300 \          # Start/end frame
  -mp                     # Multi-process (uses all cores)

# Render all queued items
aerender -project "/path/to/project.aep"

# macOS path
/Applications/Adobe\ After\ Effects\ 2024/aerender -project "/path/to/project.aep"

# Windows path
"C:\Program Files\Adobe\Adobe After Effects 2024\Support Files\aerender.exe" -project "C:\projects\my_project.aep"
```

**Batch render script:**
```bash
#!/bin/bash
# batch-render.sh — render all .aep files in a directory
RENDER_DIR="/renders"
AERENDER="/Applications/Adobe After Effects 2024/aerender"

for aep in /projects/*.aep; do
    name=$(basename "$aep" .aep)
    echo "Rendering: $name"
    
    "$AERENDER" \
        -project "$aep" \
        -RStemplate "Best Settings" \
        -OMtemplate "H.264" \
        -output "$RENDER_DIR/${name}.mp4" \
        -mp
    
    echo "✅ Done: $name"
done
```

**Node.js render orchestrator:**
```javascript
const { execSync } = require("child_process");
const fs = require("fs");

const AERENDER = "/Applications/Adobe After Effects 2024/aerender";

function render(projectPath, compName, outputPath, options = {}) {
    const args = [
        `-project "${projectPath}"`,
        `-comp "${compName}"`,
        `-output "${outputPath}"`,
        options.template ? `-RStemplate "${options.template}"` : "",
        options.outputModule ? `-OMtemplate "${options.outputModule}"` : "",
        options.startFrame !== undefined ? `-s ${options.startFrame}` : "",
        options.endFrame !== undefined ? `-e ${options.endFrame}` : "",
        "-mp",
    ].filter(Boolean).join(" ");

    console.log(`Rendering: ${compName}`);
    execSync(`"${AERENDER}" ${args}`, { stdio: "inherit" });
    console.log(`Done: ${outputPath}`);
}

// Render all variations
const variations = JSON.parse(fs.readFileSync("variations.json", "utf-8"));
for (const v of variations) {
    render(v.project, v.comp, v.output, { template: "Best Settings" });
}
```

### Step 6: MOGRT (Motion Graphics Templates)

**Create MOGRT from AE for Premiere Pro:**
```javascript
// In After Effects:
// 1. Set up Essential Graphics panel (Window → Essential Graphics)
// 2. Add editable properties (text, colors, images)
// 3. Export: Essential Graphics → Export Motion Graphics Template

// Automate MOGRT property setup via script:
var comp = app.project.activeItem;
var essentialProps = comp.motionGraphicsTemplateControllerCount;

// Add text layer to Essential Graphics
var textLayer = comp.layer("Title");
var sourceText = textLayer.property("Source Text");

// Make it editable in MOGRT
comp.addMotionGraphicsTemplateController(sourceText);
```

### Step 7: CEP Panel Development

**Panel structure:**
```
my-panel/
├── CSXS/
│   └── manifest.xml      # Panel config
├── index.html            # Panel UI
├── main.js              # Panel logic
├── host/
│   └── host.jsx         # ExtendScript (runs in AE)
└── .debug               # Debug config
```

**manifest.xml (minimal):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="8.0">
    <ExtensionList>
        <Extension Id="com.mycompany.mypanel" Version="1.0.0" />
    </ExtensionList>
    <ExecutionEnvironment>
        <HostList>
            <Host Name="AEFT" Version="[23.0,99.9]" />
        </HostList>
    </ExecutionEnvironment>
    <DispatchInfoList>
        <Extension Id="com.mycompany.mypanel">
            <DispatchInfo>
                <Resources>
                    <MainPath>./index.html</MainPath>
                </Resources>
                <UI>
                    <Type>Panel</Type>
                    <Menu>My Panel</Menu>
                    <Geometry>
                        <Size><Height>400</Height><Width>300</Width></Size>
                    </Geometry>
                </UI>
            </DispatchInfo>
        </Extension>
    </DispatchInfoList>
</ExtensionManifest>
```

**Bridge between panel JS and ExtendScript:**
```javascript
// main.js — Panel side
const csInterface = new CSInterface();

// Call ExtendScript function
function runInAE(script) {
    return new Promise((resolve, reject) => {
        csInterface.evalScript(script, (result) => {
            if (result === "EvalScript error.") reject(result);
            else resolve(result);
        });
    });
}

// Example: get comp names
async function getComps() {
    const result = await runInAE(`
        var names = [];
        for (var i = 1; i <= app.project.numItems; i++) {
            if (app.project.item(i) instanceof CompItem) {
                names.push(app.project.item(i).name);
            }
        }
        JSON.stringify(names);
    `);
    return JSON.parse(result);
}

document.getElementById("renderBtn").addEventListener("click", async () => {
    const comps = await getComps();
    comps.forEach(name => console.log("Comp:", name));
});
```
