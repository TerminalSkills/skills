---
name: webgl
description: >-
  Render 3D graphics in the browser with WebGL — set up rendering pipelines,
  write vertex and fragment shaders in GLSL, manage buffers and textures,
  handle camera transformations, and build interactive 3D scenes. Use when tasks
  involve 3D visualization, GPU-accelerated rendering, custom shaders, or
  building graphics-intensive web applications.
license: Apache-2.0
compatibility: "Modern browsers with WebGL 2.0 support"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  tags: "webgl, 3d, shaders, glsl, gpu"
  repository: https://github.com/KhronosGroup/WebGL
---

# WebGL

## Overview

WebGL 2 is the browser's low-level 3D graphics API (OpenGL ES 3.0 semantics, GLSL ES 3.00 shaders), available through `canvas.getContext("webgl2")` in all current browsers. You supply the shaders, buffers, textures and matrices yourself; for scenes with models, lights and loaders, use a library such as three.js instead. WebGPU is the successor API but WebGL remains the portable default.

## Instructions

### Initializing a WebGL Context

```typescript
// src/webgl/init.ts — Get a WebGL2 rendering context and configure it.
// Throws when WebGL2 is unavailable (no silent WebGL1 fallback).
export function initWebGL(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext("webgl2", { antialias: true });
  if (!gl) throw new Error("WebGL2 not supported");

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  resizeCanvasToDisplaySize(gl);
  return gl;
}

// Match the drawing buffer to the CSS size times devicePixelRatio, then set the viewport.
// Call it every frame (cheap when nothing changed) or from a ResizeObserver.
export function resizeCanvasToDisplaySize(gl: WebGL2RenderingContext): boolean {
  const canvas = gl.canvas as HTMLCanvasElement;
  const width = Math.round(canvas.clientWidth * devicePixelRatio);
  const height = Math.round(canvas.clientHeight * devicePixelRatio);
  const changed = canvas.width !== width || canvas.height !== height;
  if (changed) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  return changed;
}
```

### Compiling Shaders

```typescript
// src/webgl/shaders.ts — Compile vertex and fragment shaders, link into a program.
// Shaders run on the GPU and control how vertices and pixels are processed.
export function createShaderProgram(
  gl: WebGL2RenderingContext,
  vertexSrc: string,
  fragmentSrc: string
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSrc);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSrc);

  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Link error: ${gl.getProgramInfoLog(program)}`);
  }

  return program;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}
```

### GLSL Shaders

```glsl
#version 300 es
// shaders/vertex.glsl — Transform vertex positions and pass data to fragment shader.
// "#version 300 es" must stay the very first line of the shader string.
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat3 uNormalMatrix; // inverse-transpose of the model-view's upper 3x3

out vec3 vNormal;
out vec2 vTexCoord;

void main() {
  vNormal = mat3(uNormalMatrix) * aNormal;
  vTexCoord = aTexCoord;
  gl_Position = uProjection * uModelView * vec4(aPosition, 1.0);
}
```

```glsl
#version 300 es
// shaders/fragment.glsl — Calculate pixel color using lighting and texture.
precision highp float;

in vec3 vNormal;
in vec2 vTexCoord;

uniform sampler2D uTexture;
uniform vec3 uLightDir;

out vec4 fragColor;

void main() {
  vec3 normal = normalize(vNormal);
  float diffuse = max(dot(normal, normalize(uLightDir)), 0.0);
  vec4 texColor = texture(uTexture, vTexCoord);
  fragColor = vec4(texColor.rgb * (0.3 + 0.7 * diffuse), texColor.a);
}
```

### Buffers and VAOs

```typescript
// src/webgl/geometry.ts — Create vertex buffer objects and vertex array objects
// to upload geometry data to the GPU.
export function createTriangle(gl: WebGL2RenderingContext) {
  const vertices = new Float32Array([
    // x,    y,    z
     0.0,  0.5,  0.0,
    -0.5, -0.5,  0.0,
     0.5, -0.5,  0.0,
  ]);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  return { vao, vertexCount: 3 };
}
```

### Textures

```typescript
// src/webgl/texture.ts — Upload an image to the GPU. Call after the image has loaded.
export async function loadTexture(gl: WebGL2RenderingContext, url: string): Promise<WebGLTexture> {
  const response = await fetch(url);
  const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: "flipY" });

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  gl.generateMipmap(gl.TEXTURE_2D); // WebGL2 allows mipmaps on non-power-of-two sizes
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  bitmap.close();
  return texture;
}
```

Bind it to a texture unit and point the sampler uniform at the unit number: `gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture); gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);`. Textures loaded from another origin need CORS headers or the upload fails with a security error.

### Camera and Uniforms

Use `gl-matrix` (3.4.4) for matrix math: `npm install gl-matrix`.

```typescript
// src/webgl/camera.ts — Build projection, model-view and normal matrices and upload them.
import { mat3, mat4 } from "gl-matrix";

export function uploadCamera(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  angle: number
): void {
  const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
  const projection = mat4.perspective(mat4.create(), Math.PI / 4, aspect, 0.1, 100);

  const modelView = mat4.lookAt(mat4.create(), [0, 1.5, 4], [0, 0, 0], [0, 1, 0]);
  mat4.rotateY(modelView, modelView, angle);

  const normalMatrix = mat3.normalFromMat4(mat3.create(), modelView);

  gl.uniformMatrix4fv(gl.getUniformLocation(program, "uProjection"), false, projection);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "uModelView"), false, modelView);
  gl.uniformMatrix3fv(gl.getUniformLocation(program, "uNormalMatrix"), false, normalMatrix);
  gl.uniform3f(gl.getUniformLocation(program, "uLightDir"), 0.4, 0.8, 0.6);
}
```

Look uniform locations up once after linking and cache them; `getUniformLocation` in the frame loop is slow. `gl.useProgram(program)` must run before any `gl.uniform*` call.

### Render Loop

```typescript
// src/webgl/render.ts — Animation loop that clears the screen and draws geometry
// each frame, updating uniforms for animation.
import { resizeCanvasToDisplaySize } from "./init";

export function startRenderLoop(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  draw: (time: number) => void
) {
  gl.useProgram(program);

  function frame(time: number) {
    resizeCanvasToDisplaySize(gl);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    draw(time);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
```

Draw the triangle with `gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, vertexCount);` inside `draw`. Use `gl.drawElements` with an `ELEMENT_ARRAY_BUFFER` for indexed meshes and `gl.drawArraysInstanced` / `gl.drawElementsInstanced` for many copies of one mesh.

## Examples

### Example 1: Spinning textured model on a page
Request: "Show our product mesh spinning on the landing page canvas."

Create the context with `initWebGL(canvas)`, build the program from the two GLSL strings, load the mesh into a VAO (positions at location 0, normals at 1, UVs at 2), `await loadTexture(gl, "/img/espresso-machine.jpg")`, then in `draw(time)` call `uploadCamera(gl, program, time / 1000)` followed by `gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0)`. The canvas shows a lit, textured mesh rotating once every ~6 seconds; resizing the window keeps it sharp because `resizeCanvasToDisplaySize` runs each frame.

### Example 2: Diagnose a black canvas
Request: "My canvas is black and there are no errors."

Check in order: the shader info logs (`compileShader` throws them), `gl.getError()` right after the first draw (`gl.NO_ERROR` is 0), that `gl.useProgram` ran before the uniform calls, that attribute locations in `vertexAttribPointer` match the `layout(location = N)` qualifiers, that the canvas has non-zero `clientWidth`/`clientHeight` (CSS size 0 gives a 0x0 drawing buffer), and that `fragColor` alpha is not 0. For a quick look at state, the Spector.js browser extension captures one frame's calls.

## Guidelines
- Always check `COMPILE_STATUS` and `LINK_STATUS`; WebGL reports shader errors only through the info logs, never by throwing.
- `#version 300 es` must be the first line of the shader source string, with no leading newline or whitespace-only line; a template literal starting on a new line breaks it.
- Handle context loss in long-lived pages: listen for `webglcontextlost` (call `event.preventDefault()` to allow restoration) and `webglcontextrestored`, and recreate every buffer, texture and program in the restore handler.
- Free GPU memory explicitly with `gl.deleteBuffer`, `gl.deleteTexture`, `gl.deleteProgram`, `gl.deleteVertexArray`; garbage collection does not release it promptly.
- Do not read pixels (`gl.readPixels`) or call `gl.getError()` every frame in production; both stall the pipeline.
- Browsers cap the number of live WebGL contexts (Chrome loses the oldest one past 16; limits differ per browser); share one context for several views instead of one canvas per item.
- Use `precision highp float;` in fragment shaders only when needed on low-end mobile; `mediump` is faster there. Fragment shaders have no default float precision in GLSL ES.
- Do not use WebGL for ordinary charts or 2D UI; Canvas 2D or SVG is simpler. For GPU compute or very heavy scenes, look at WebGPU.
