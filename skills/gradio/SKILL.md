---
name: gradio
description: >-
  Gradio is a Python library that turns a function into a web UI and an API,
  used for machine-learning demos. Use it when a user asks to build a demo for a
  model, make a chatbot UI, accept image, audio or file input, share a prototype
  through a temporary public link, call a Gradio app from code, or deploy a
  demo to Hugging Face Spaces.
license: Apache-2.0
compatibility: 'Python 3.10+, gradio 6.x, Linux/macOS/Windows; Hugging Face account for Spaces'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/gradio-app/gradio
  tags: "ml-demos, web-ui, huggingface-spaces, interactive, prototyping"
---

# Gradio

## Overview

Gradio wraps a Python function in a browser UI (`gr.Interface`), a chat UI (`gr.ChatInterface`) or a custom layout (`gr.Blocks`), and exposes every event as an HTTP API that `gradio_client` can call. This skill targets Gradio 6 (6.30 at the time of writing); older code examples that use `history` as a list of pairs, `file.name`, or `api_name="/predict"` no longer match.

## Instructions

### Install and run

```bash
python -m venv .venv && source .venv/bin/activate
pip install gradio
python hello.py        # serves http://127.0.0.1:7860
```

Use `gradio hello.py` instead of `python` for auto-reload while editing. Inside a container set `GRADIO_SERVER_NAME=0.0.0.0`; by default the app listens on localhost only.

### Simple interface

```python
# hello.py
import gradio as gr


def greet(name: str, intensity: int) -> str:
    return "Hello, " + name + "!" * intensity


demo = gr.Interface(
    fn=greet,
    inputs=["text", gr.Slider(1, 10, value=1, step=1, label="Excitement")],
    outputs="text",
    title="Greeting Generator",
)

demo.launch()
```

### Chatbot with streaming

`ChatInterface` passes `history` as a list of `{"role", "content"}` dicts. Yield the growing reply to stream it. The model name below is an example; use one your provider currently offers.

```python
# chatbot.py
import os

import gradio as gr
from openai import OpenAI

client = OpenAI()  # reads OPENAI_API_KEY


def chat(message: str, history: list[dict]):
    messages = [{"role": "system", "content": "You are a helpful assistant."}]
    messages += [{"role": h["role"], "content": h["content"]} for h in history]
    messages.append({"role": "user", "content": message})
    stream = client.chat.completions.create(model=os.getenv("CHAT_MODEL", "gpt-4.1-mini"), messages=messages, stream=True)
    partial = ""
    for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            partial += chunk.choices[0].delta.content
            yield partial


demo = gr.ChatInterface(
    fn=chat,
    title="Support assistant",
    examples=["Where is my order?", "How do I reset my password?"],
)
demo.launch()
```

Tested with a stub function: the history seen by the second message is `[{"role": "user", ...}, {"role": "assistant", ...}]`. Run `pip install openai` first and set `OPENAI_API_KEY` in the environment.

### Image classifier (documentation-checked, needs `pip install transformers torch`)

```python
import gradio as gr
from transformers import pipeline

classifier = pipeline("image-classification", model="google/vit-base-patch16-224")


def classify(image):
    return {r["label"]: r["score"] for r in classifier(image)}


gr.Interface(fn=classify, inputs=gr.Image(type="pil"), outputs=gr.Label(num_top_classes=5)).launch()
```

### Blocks for custom layouts

Pass `api_name` to a listener to give its endpoint a stable name. In Gradio 6 the theme is a `launch()` argument.

```python
# blocks_app.py
import gradio as gr

def process_text(text: str, operation: str) -> str:
    if operation == "Uppercase":
        return text.upper()
    if operation == "Word count":
        return f"Word count: {len(text.split())}"
    return text.lower()

with gr.Blocks(title="Text Processor") as demo:
    gr.Markdown("# Text Processing Tool")
    with gr.Row():
        with gr.Column(scale=2):
            text_input = gr.Textbox(label="Input text", lines=5)
            operation = gr.Radio(["Uppercase", "Lowercase", "Word count"], value="Uppercase", label="Operation")
            submit_btn = gr.Button("Process", variant="primary")
        with gr.Column(scale=1):
            output = gr.Textbox(label="Result", lines=5)
    submit_btn.click(process_text, [text_input, operation], output, api_name="process")

demo.launch(theme=gr.themes.Soft())
```

### File upload and download

With `type="filepath"` the function receives a path string (not a file object), and returning a path makes a download link. Write outputs to a fresh temporary directory, not a fixed path.

```python
# csv_summary.py
import os, tempfile
import gradio as gr
import pandas as pd

def analyze_csv(path: str):
    df = pd.read_csv(path)
    summary = f"Rows: {len(df)}, Columns: {len(df.columns)}\n\n" + df.describe().to_string()
    out = os.path.join(tempfile.mkdtemp(), "summary.csv")
    df.describe().to_csv(out)
    return summary, out

demo = gr.Interface(fn=analyze_csv, inputs=gr.File(label="Upload CSV", type="filepath", file_types=[".csv"]),
    outputs=[gr.Textbox(label="Summary"), gr.File(label="Download summary")])

demo.launch()
```

### Authentication and sharing

```python
import os

demo.launch(auth=("admin", os.environ["DEMO_PASSWORD"]))   # basic login page
demo.launch(share=True)                                    # temporary public gradio.live URL
```

Share links proxy your local machine and expire after one week; anyone with the link can use your app, so combine `share=True` with `auth` when the function touches private data. For permanent hosting use Spaces or your own server.

### Call the app as an API

Endpoint names default to the function name (`/greet`, `/chat`, `/analyze_csv`), or the `api_name` you set.

```python
from gradio_client import Client, handle_file

client = Client("http://127.0.0.1:7860/")      # or "owner/space-name" for a Space
print(client.predict("Priya", 3, api_name="/greet"))
print(client.predict(handle_file("sales.csv"), api_name="/analyze_csv"))
client.view_api()                              # lists endpoints and parameters
```

### Deploy to Hugging Face Spaces (account and login needed; not run here)

```bash
pip install -U huggingface_hub
hf auth login
hf repos create priya-n/text-demo --type space --space-sdk gradio
hf upload priya-n/text-demo . . --repo-type space --exclude ".venv/**"   # uploads app.py and requirements.txt, not the virtualenv
```

A Space needs `app.py` (or the `app_file` named in the README front matter) and a `requirements.txt` for packages beyond Gradio itself, which the Space installs for you from `sdk_version`.

## Examples

**"Put a demo around my CSV summarizer."** Use the file example: upload `sales.csv` (`units,price`), the first output line is `Rows: 2, Columns: 2`, and the second output is a downloadable `summary.csv`. Tested end to end through `gradio_client`.

**"Add a password and call it from a script."** Launch with `auth=("admin", os.environ["DEMO_PASSWORD"])` and connect with `Client(url, auth=("admin", os.environ["DEMO_PASSWORD"]))`; `predict("hi", api_name="/secret_fn")` returned `HI` in a test.

## Guidelines

- Gradio apps are for demos and internal tools. For a production product with accounts and a database, put a real backend in front or use the app as one component.
- Never hard-code passwords or API keys; read them from environment variables or Space secrets.
- `launch(share=True)` exposes your machine's function to the internet; never share an app that can read files or run shell commands.
- Long jobs: call `demo.queue(default_concurrency_limit=2)` or set `concurrency_limit` on an event, so one slow model does not block everyone.
- Upgrading old code: history pairs become role/content dicts, `gr.File` inputs give paths, `Blocks(theme=...)` moves to `launch(theme=...)`, and `Interface` endpoints are named after the function.
