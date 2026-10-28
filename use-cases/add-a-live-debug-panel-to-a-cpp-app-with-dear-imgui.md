---
title: Add a Live Debug Panel to a C++ App with Dear ImGui
slug: add-a-live-debug-panel-to-a-cpp-app-with-dear-imgui
description: Tune parameters and watch frame times inside a running C++ renderer or simulation, without recompiling after every change.
skills:
  - imgui
category: development
tags:
  - cpp
  - imgui
  - debug-tools
  - game-development
  - graphics
---

# Add a Live Debug Panel to a C++ App with Dear ImGui

## The Problem

Ingrid maintains a C++17 particle simulation rendered with OpenGL through GLFW. To tune it she edits a constant such as gravity or the spawn rate, rebuilds (40 seconds), restarts, and waits for the scene to reach the interesting state again. A tuning session takes 30 to 50 of these cycles. When the frame time spikes she has no way to see which setting caused it except by guessing and rebuilding.

She does not want a UI framework. The program is a render loop with a window, and she needs a few sliders, a checkbox, and a graph.

## The Solution

Dear ImGui adds a floating panel to the existing window with a few lines per control and no widget objects: the sliders edit her variables directly. The **imgui** skill carries the pinned release (v1.93.0), the correct call order of the GLFW and OpenGL3 backends, the build setup, and the handful of mistakes that waste an afternoon (duplicate widget labels, mismatched `End` calls, input leaking through to the app).

## Step-by-Step Walkthrough

### Step 1: Vendor Dear ImGui at a fixed version

> Add Dear ImGui to the particle simulation as a pinned dependency and wire it into CMake with the GLFW and OpenGL3 backends.

```bash
git submodule add https://github.com/ocornut/imgui.git third_party/imgui
git -C third_party/imgui checkout v1.93.0
```

The agent adds an `imgui` static library target to `CMakeLists.txt` that lists the four core files and `backends/imgui_impl_glfw.cpp` and `backends/imgui_impl_opengl3.cpp`, and links it into the simulation. Core and backends come from the same tag.

### Step 2: Initialise, run the frame, shut down

> Initialise ImGui after the window is created and draw it on top of the scene each frame.

The agent places `CreateContext`, `ImGui_ImplGlfw_InitForOpenGL(window, true)` and `ImGui_ImplOpenGL3_Init(nullptr)` after the GL context is current. In the loop it calls `ImGui_ImplOpenGL3_NewFrame()`, `ImGui_ImplGlfw_NewFrame()`, `ImGui::NewFrame()`, then builds the UI, calls `ImGui::Render()`, draws the particles, and finally `ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData())` so the panel appears on top. The shutdown calls run in reverse order after the loop.

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
./build/particles
```

The simulation runs as before with ImGui initialised and rendering after the scene; the next step puts the first controls on screen.

### Step 3: Expose the parameters

> Add sliders for gravity and particle count, a wireframe checkbox, and a graph of the last 120 frame times.

```cpp
ImGui::Begin("Particles");
ImGui::SliderFloat("Gravity", &sim.gravity, 0.0f, 30.0f);
ImGui::SliderInt("Count", &sim.particle_count, 1000, 200000);
ImGui::Checkbox("Wireframe", &sim.wireframe);
ImGui::PlotLines("Frame ms", frame_ms, 120, ring, nullptr, 0.0f, 33.0f, ImVec2(0, 60));
ImGui::End();
```

Dragging a slider now changes the simulation on the next frame. A frame-time spike shows up in the graph the moment it happens.

### Step 4: Stop the UI from fighting the camera

> Dragging a slider also rotates the camera. Fix it.

The agent keeps feeding all events to ImGui and wraps the camera control in `if (!io.WantCaptureMouse) { ... }`. Dragging a slider no longer moves the camera, while dragging on the empty scene still does.

### Step 5: Keep it out of release builds

> Make the panel available only in debug and profiling builds.

The agent guards the ImGui init, frame and shutdown calls with a `SIM_DEBUG_UI` compile definition set from a CMake option, and leaves `imgui_demo.cpp` out of the target.

## Real-World Example

Ingrid's first tuning session after the change took 12 minutes instead of an afternoon. She found that raising the particle count past 120,000 made the frame graph jump from 9 ms to 31 ms, because the spawn loop ran on the CPU; she moved it to a compute pass the next day. A teammate's mistake was also caught quickly: his list of emitters had a "Delete" button per row, and every click removed the first emitter, because the labels were identical. Wrapping each row in `ImGui::PushID(emitter.id)` fixed it.

## Related Skills

- [imgui](/skills/imgui) — release pinning, backend call order, widgets, widget IDs, input routing and the 1.92+ font changes
