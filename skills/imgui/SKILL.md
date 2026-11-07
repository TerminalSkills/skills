---
name: imgui
description: >-
  Dear ImGui is a C++ immediate-mode GUI library for building debug panels, tools and editors inside games, simulations and other real-time apps. Use when asked to "add a debug UI to my C++ app", "integrate Dear ImGui with GLFW and OpenGL", "add sliders and a live graph to my renderer", "fix ImGui widget ID conflicts", or "use ImGui fonts in version 1.92 or later". Covers setup with the bundled backends, the per-frame loop, common widgets and the pitfalls of immediate mode.
license: Apache-2.0
compatibility: "C++11 or newer compiler; a platform backend (GLFW, SDL3, Win32, ...) and a renderer backend (OpenGL3, Vulkan, DX11, Metal, ...) for your app"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "cpp, imgui, gui, debug-tools, game-development"
  repository: https://github.com/ocornut/imgui
---

# Dear ImGui — immediate-mode GUI for C++ tools and debug panels

## Overview

In an immediate-mode GUI you do not create and store widget objects. Every frame you call functions such as `ImGui::Button("Reset")` between `NewFrame()` and `Render()`; the call draws the widget and returns `true` when it was clicked. Your own variables hold the state: `ImGui::SliderFloat("Speed", &speed, 0.0f, 10.0f)` edits `speed` directly. This makes it a very quick way to expose parameters, profiling numbers and tools of a running program.

Dear ImGui itself has no dependencies and does not talk to the GPU or the operating system. It produces vertex buffers and draw commands. **Backends** (files `backends/imgui_impl_*.cpp`) feed it input and draw its output: a *platform* backend (GLFW, SDL2/3, Win32, ...) and a *renderer* backend (OpenGL3, Vulkan, DirectX 9-12, Metal, WebGPU, ...). You copy the core files plus one backend pair into your project; there is no library to install.

This skill is written for release **v1.93.0** (October 2026). The `docking` branch of the repository adds dockable windows and multi-viewports, but it is a separate branch; use the release tag unless the user asks for docking.

## Instructions

### Getting the sources

Pin a release tag so the core files and backends stay in sync:

```bash
git clone --depth 1 --branch v1.93.0 https://github.com/ocornut/imgui.git third_party/imgui
```

Core files (repository root): `imgui.cpp`, `imgui_draw.cpp`, `imgui_tables.cpp`, `imgui_widgets.cpp`, and `imgui_demo.cpp` (the demo window, very useful as a code reference; leave it out of release builds). Always compile the backend files from the same tag as the core, because they change together.

### Building with GLFW + OpenGL3

Install GLFW and OpenGL development packages with your package manager (on Ubuntu `libglfw3-dev` and `libgl1-mesa-dev`; ask the user to run the `sudo` command). The official example `examples/example_glfw_opengl3/` compiles these files plus `imgui_demo.cpp`:

```cmake
cmake_minimum_required(VERSION 3.16)
project(tool_panel CXX)
set(CMAKE_CXX_STANDARD 17)

find_package(glfw3 REQUIRED)
find_package(OpenGL REQUIRED)

set(IMGUI_DIR ${CMAKE_SOURCE_DIR}/third_party/imgui)
add_library(imgui STATIC
  ${IMGUI_DIR}/imgui.cpp ${IMGUI_DIR}/imgui_draw.cpp
  ${IMGUI_DIR}/imgui_tables.cpp ${IMGUI_DIR}/imgui_widgets.cpp
  ${IMGUI_DIR}/backends/imgui_impl_glfw.cpp
  ${IMGUI_DIR}/backends/imgui_impl_opengl3.cpp)
target_include_directories(imgui PUBLIC ${IMGUI_DIR} ${IMGUI_DIR}/backends)
target_link_libraries(imgui PUBLIC glfw OpenGL::GL)

add_executable(tool_panel main.cpp)
target_link_libraries(tool_panel PRIVATE imgui)
```

### The three phases: init, frame loop, shutdown

This is the structure of the official GLFW + OpenGL3 example (v1.93.0):

```cpp
#include "imgui.h"
#include "imgui_impl_glfw.h"
#include "imgui_impl_opengl3.h"
#include <GLFW/glfw3.h>

// after creating the GLFW window and making its GL context current:
IMGUI_CHECKVERSION();
ImGui::CreateContext();
ImGuiIO& io = ImGui::GetIO();
io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
ImGui::StyleColorsDark();
ImGui_ImplGlfw_InitForOpenGL(window, true);   // true = install GLFW callbacks
ImGui_ImplOpenGL3_Init(nullptr);              // nullptr = backend picks a default GLSL version; pass e.g. "#version 130" to force one

while (!glfwWindowShouldClose(window)) {
    glfwPollEvents();

    ImGui_ImplOpenGL3_NewFrame();
    ImGui_ImplGlfw_NewFrame();
    ImGui::NewFrame();

    // ... build UI here ...

    ImGui::Render();
    glClear(GL_COLOR_BUFFER_BIT);
    // ... draw your own scene here, before the UI ...
    ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());
    glfwSwapBuffers(window);
}

ImGui_ImplOpenGL3_Shutdown();
ImGui_ImplGlfw_Shutdown();
ImGui::DestroyContext();
```

Order matters: the renderer `NewFrame` comes first, then the platform one, then `ImGui::NewFrame()`. Shutdown runs in the reverse order of the init.

For another stack, pick the matching pair from `backends/` (for example `imgui_impl_sdl3.cpp` + `imgui_impl_sdlrenderer3.cpp`, or `imgui_impl_win32.cpp` + `imgui_impl_dx11.cpp`) and copy the calls from the matching `examples/example_*/main.cpp` in the same tag. Do not invent backend function names.

### Common widgets

```cpp
ImGui::Begin("Simulation");                       // window; always pair with End()
ImGui::Text("Frame time: %.2f ms", 1000.0f / io.Framerate);
ImGui::SliderFloat("Gravity", &gravity, 0.0f, 20.0f);
ImGui::DragFloat3("Camera", cam_pos, 0.1f);       // float[3]
ImGui::Checkbox("Wireframe", &wireframe);
ImGui::Combo("Quality", &quality, quality_names, 3);  // const char* const[]
if (ImGui::Button("Reset")) world.reset();
ImGui::SameLine();
ImGui::PlotLines("ms", frame_ms, 120, ring_offset, nullptr, 0.0f, 33.0f, ImVec2(0, 60));
ImGui::End();
```

Tables: `if (ImGui::BeginTable("entities", 3, ImGuiTableFlags_Borders)) { ImGui::TableSetupColumn("Id"); ...; ImGui::TableHeadersRow(); for (...) { ImGui::TableNextColumn(); ImGui::Text(...); } ImGui::EndTable(); }`. Call `EndTable()` only if `BeginTable()` returned true; the same rule applies to `BeginCombo`, `BeginMenu` and `BeginPopup`, but not to `Begin()`, which always needs `End()`.

For `std::string` text input, include `misc/cpp/imgui_stdlib.h` and call `ImGui::InputText("Name", &name)`. The core `InputText` takes a `char*` buffer and its size.

### Widget identity

ImGui identifies a widget by its label. Two buttons both called `"Delete"` in one window collide. Add a hidden suffix with `##` or push an ID:

```cpp
for (int i = 0; i < entities.size(); i++) {
    ImGui::PushID(i);
    if (ImGui::Button("Delete")) remove_index = i;
    ImGui::PopID();
}
```

Use `"Label##unique"` when only the part after `##` should be invisible.

### Input routing

Always feed every input event to ImGui, then check `io.WantCaptureMouse` and `io.WantCaptureKeyboard` before acting on input in your own code. When they are true, the user is interacting with a UI window and your game should ignore that click or key.

### Fonts (1.92 and later)

Since 1.92 the font size is no longer baked into the atlas. Load a TTF with `io.Fonts->AddFontFromFileTTF("assets/fonts/Inter-Regular.ttf")` and change the size at any time with `ImGui::PushFont(nullptr, 20.0f)` / `ImGui::PopFont()`. Code written for older versions that passes a size to `AddFontFromFileTTF` and builds the atlas by hand needs updating; read `docs/FONTS.md` in the tag.

### Testing UI code without a window

The core library can run with no backend, which is useful for checking that new widget code compiles and runs. This was built and run with `g++ -std=c++17 main.cpp imgui.cpp imgui_draw.cpp imgui_tables.cpp imgui_widgets.cpp -I.` against v1.93.0:

```cpp
ImGui::CreateContext();
ImGuiIO& io = ImGui::GetIO();
io.DisplaySize = ImVec2(800, 600);
io.BackendFlags |= ImGuiBackendFlags_RendererHasTextures;
io.IniFilename = nullptr;
for (int frame = 0; frame < 3; frame++) {
    ImGui::NewFrame();
    ImGui::Begin("Mixer");
    ImGui::SliderFloat("Volume", &volume, 0.0f, 1.0f);
    ImGui::End();
    ImGui::Render();
    printf("vtx=%d\n", ImGui::GetDrawData()->TotalVtxCount);
}
ImGui::DestroyContext();
```

The first frame produces no vertices because a new window sizes itself on its first appearance; frames two and three draw it. You cannot click anything this way, so use it only as a smoke test.

## Examples

### Example 1: Live tuning panel for a particle simulation

**Request:** "I have a GLFW + OpenGL particle sim in C++. Add a panel where I can change gravity and particle count and see frame time."

The agent adds ImGui as a pinned submodule, adds the CMake block above, and inserts into the render loop:

```cpp
static float gravity = 9.81f;
static int particle_count = 20000;
static float frame_ms[120] = {};
static int ring = 0;
frame_ms[ring] = 1000.0f / io.Framerate;
ring = (ring + 1) % 120;

ImGui::Begin("Particles");
ImGui::SliderFloat("Gravity", &gravity, 0.0f, 30.0f);
ImGui::SliderInt("Count", &particle_count, 1000, 200000);
ImGui::PlotLines("Frame ms", frame_ms, 120, ring, nullptr, 0.0f, 33.0f, ImVec2(0, 60));
ImGui::End();
```

After `cmake -S . -B build && cmake --build build`, running `build/tool_panel` shows a floating window with two sliders and a rolling graph; dragging the sliders changes the simulation on the next frame without a rebuild.

### Example 2: Fix buttons in a list that all react together

**Request:** "Clicking any Delete button in my entity list deletes the first one."

All the buttons share the label `"Delete"`, so they share one ID and only the first receives the click. The agent wraps each row in `ImGui::PushID(entity.id)` / `ImGui::PopID()` (using a stable id, not a loop index, if the list can be reordered) and the click now affects the intended row.

## Guidelines

- Pin the release tag; core and backend files from different versions will not compile or behave correctly together.
- Never keep per-widget objects. State lives in your own variables, and the UI is rebuilt each frame. Do not call UI functions from outside `NewFrame()`/`Render()`.
- Match every `Begin*` with its `End*` according to the rule for that function; a mismatch asserts in debug builds.
- Duplicate labels are the most common bug. Use `##suffix` or `PushID`.
- `imgui.ini` is written next to the executable by default and stores window positions. Set `io.IniFilename = nullptr` to disable it, or set a path.
- Leave out `imgui_demo.cpp` and the debug windows in shipped builds of end-user software; ImGui is aimed at tools and developer UI. It is a poor fit for accessible, localised, retained-style application UI.
- Use `io.WantCaptureMouse` and `io.WantCaptureKeyboard`, not `IsWindowHovered`, to decide whether input belongs to the app.
- Configuration (`imconfig.h`) is edited by copying the file into your own include path or by defining `IMGUI_USER_CONFIG`; do not edit vendored files in place if you plan to update.
