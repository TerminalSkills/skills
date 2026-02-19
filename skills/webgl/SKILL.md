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
  version: "1.0.0"
  category: design
  tags: ["webgl", "3d", "shaders", "glsl", "gpu", "graphics"]
---

# WebGL

Low-level 3D graphics API for the browser. Direct GPU access through shaders, buffers, and textures.

## Initializing a WebGL Context

```typescript
// src/webgl/init.ts — Get a WebGL2 rendering context and configure it.
// Falls back to WebGL1 if WebGL2 is unavailable.
export function initWebGL(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 not supported");

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  return gl;
}
```

## Compiling Shaders

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

## GLSL Shaders

```glsl
// shaders/vertex.glsl — Transform vertex positions and pass data to fragment shader.
#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;

out vec3 vNormal;
out vec2 vTexCoord;

void main() {
  vNormal = mat3(uModelView) * aNormal;
  vTexCoord = aTexCoord;
  gl_Position = uProjection * uModelView * vec4(aPosition, 1.0);
}
```

```glsl
// shaders/fragment.glsl — Calculate pixel color using lighting and texture.
#version 300 es
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

## Buffers and VAOs

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

## Render Loop

```typescript
// src/webgl/render.ts — Animation loop that clears the screen and draws geometry
// each frame, updating uniforms for animation.
export function startRenderLoop(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  draw: (time: number) => void
) {
  gl.useProgram(program);

  function frame(time: number) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    draw(time);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
```
