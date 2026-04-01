---
name: minimind
description: >-
  Train a small GPT model from scratch in 2 hours — understand LLM architecture by building
  one. Use when: learning how LLMs work internally, training custom small language models,
  educational AI projects, fine-tuning experiments.
license: Apache-2.0
compatibility: "Python 3.10+, CUDA GPU recommended"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags:
    - llm-training
    - gpt
    - from-scratch
    - education
    - fine-tuning
    - machine-learning
  use-cases:
    - "Train a 64M parameter GPT model from scratch to understand LLM internals"
    - "Build a custom small language model for a specific domain"
    - "Learn transformer architecture hands-on by implementing it"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# MiniMind

Train a small GPT language model from scratch in ~2 hours on a single GPU. Understand every component of LLM architecture by building one yourself — from tokenizer training to RLHF alignment.

> Source: [jingyaogong/minimind](https://github.com/jingyaogong/minimind) (45k+ ⭐)

## What MiniMind Teaches

MiniMind is not a toy — it's a complete, production-aligned training pipeline scaled down to run on consumer hardware. The architecture tracks Qwen3/Qwen3-MoE, so patterns you learn here apply directly to understanding full-scale models.

### What You'll Build

- A 64M parameter Dense model (or 198M/A64M MoE variant)
- Custom tokenizer with special tokens (`<tool_call>`, `<think>`, etc.)
- Full training pipeline: Pretrain → SFT → LoRA → RLHF
- Tool use and agentic RL capabilities
- OpenAI-compatible API server for inference

### Cost

- **GPU:** NVIDIA 3090 (single card) — ~2 hours for full training
- **Money:** ~$3 in GPU server rental (if you don't own hardware)
- **Minimum:** Even a GTX 1660 can train the smallest variant (slower)

## Architecture

MiniMind implements the transformer architecture from scratch using PyTorch — no high-level framework abstractions.

### Core Components

```python
# Simplified model structure (Dense variant)
class MiniMindModel(nn.Module):
    def __init__(self, config):
        self.tok_embeddings = nn.Embedding(config.vocab_size, config.dim)
        self.layers = nn.ModuleList([
            TransformerBlock(config) for _ in range(config.n_layers)
        ])
        self.norm = RMSNorm(config.dim)
        self.output = nn.Linear(config.dim, config.vocab_size, bias=False)
```

### Transformer Block

Each transformer block contains:

```python
class TransformerBlock(nn.Module):
    def __init__(self, config):
        self.attention = GroupedQueryAttention(config)  # GQA
        self.feed_forward = SwiGLU(config)              # SwiGLU FFN
        self.attention_norm = RMSNorm(config.dim)        # Pre-norm
        self.ffn_norm = RMSNorm(config.dim)

    def forward(self, x, freqs_cis):
        # Pre-norm + attention + residual
        h = x + self.attention(self.attention_norm(x), freqs_cis)
        # Pre-norm + FFN + residual
        out = h + self.feed_forward(self.ffn_norm(h))
        return out
```

### Key Design Choices

| Component | MiniMind Choice | Why |
|-----------|----------------|-----|
| Attention | Grouped Query Attention (GQA) | Memory-efficient, matches production models |
| FFN | SwiGLU | Better than ReLU for language modeling |
| Normalization | RMSNorm (pre-norm) | Stable training, standard in modern LLMs |
| Position Encoding | RoPE with YaRN | Supports long-context extrapolation |
| Tokenizer | Custom BPE | Includes special tokens for tool use |

### MoE Variant

The Mixture-of-Experts variant (198M total, 64M active):

```python
class MoEFeedForward(nn.Module):
    def __init__(self, config):
        self.gate = nn.Linear(config.dim, config.n_experts, bias=False)
        self.experts = nn.ModuleList([
            SwiGLU(config) for _ in range(config.n_experts)
        ])
        self.top_k = config.top_k_experts  # Typically 2
```

## Training Pipeline

### Stage 1: Pretrain

Train on raw text to learn language patterns:

```bash
# Start pretraining
python train_pretrain.py \
    --data_path ./data/pretrain_data.jsonl \
    --model_config ./config/minimind-3.yaml \
    --epochs 2 \
    --batch_size 32 \
    --learning_rate 5e-4
```

Dataset: ~1GB of cleaned Chinese/English text. The project provides ready-made datasets on HuggingFace.

### Stage 2: Supervised Fine-Tuning (SFT)

Teach the model to follow instructions:

```bash
python train_sft.py \
    --pretrained_model ./checkpoints/pretrain/best.pt \
    --data_path ./data/sft_data.jsonl \
    --epochs 3 \
    --batch_size 16 \
    --learning_rate 1e-5
```

SFT data format:

```json
{
  "conversations": [
    {"role": "user", "content": "Explain how attention works"},
    {"role": "assistant", "content": "Attention is a mechanism that..."}
  ]
}
```

### Stage 3: LoRA Fine-Tuning

Efficient fine-tuning for specific tasks:

```bash
python train_lora.py \
    --base_model ./checkpoints/sft/best.pt \
    --data_path ./data/domain_data.jsonl \
    --lora_rank 8 \
    --lora_alpha 16
```

### Stage 4: RLHF Alignment

Multiple alignment methods implemented from scratch:

- **DPO** — Direct Preference Optimization (simplest)
- **PPO** — Proximal Policy Optimization (classic RLHF)
- **GRPO** — Group Relative Policy Optimization (DeepSeek-style)
- **CISPO** — Custom variant for small models

```bash
# DPO alignment
python train_dpo.py \
    --model_path ./checkpoints/sft/best.pt \
    --preference_data ./data/dpo_pairs.jsonl
```

## Dataset Preparation

MiniMind provides tools for dataset cleaning and preparation:

```python
# Data cleaning pipeline
from data_utils import clean_text, dedup, filter_quality

raw_data = load_jsonl("raw_corpus.jsonl")
cleaned = clean_text(raw_data)        # Remove HTML, normalize whitespace
deduped = dedup(cleaned)              # MinHash deduplication
quality = filter_quality(deduped)     # Filter low-quality samples

save_jsonl(quality, "pretrain_data.jsonl")
```

### Pre-built Datasets

Available on HuggingFace ([minimind collection](https://huggingface.co/collections/jingyaogong/minimind)):

- Pretrain corpus (cleaned, deduplicated)
- SFT instruction-following pairs
- DPO preference pairs
- Tool use examples

## GPU Requirements

| Model | Parameters | GPU Memory | Training Time |
|-------|-----------|------------|---------------|
| minimind-3 | 64M | ~4 GB | ~2h (3090) |
| minimind-3-moe | 198M/A64M | ~8 GB | ~4h (3090) |
| minimind2-small | 26M | ~2 GB | ~1h (3090) |
| minimind2 | 104M | ~6 GB | ~3h (3090) |

Multi-GPU training supported via DDP and DeepSpeed.

## Inference

### Python API

```python
from model import MiniMindModel
from tokenizer import MiniMindTokenizer

model = MiniMindModel.from_pretrained("./checkpoints/sft/best.pt")
tokenizer = MiniMindTokenizer("./tokenizer/tokenizer.model")

prompt = "What is machine learning?"
input_ids = tokenizer.encode(prompt)
output = model.generate(input_ids, max_new_tokens=256, temperature=0.7)
print(tokenizer.decode(output))
```

### OpenAI-Compatible Server

```bash
# Start the API server
python api_server.py --model_path ./checkpoints/sft/best.pt --port 8000

# Use with any OpenAI client
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "minimind", "messages": [{"role": "user", "content": "Hello!"}]}'
```

### Streamlit Chat UI

```bash
streamlit run web_ui.py
# Opens browser with chat interface, thinking display, and tool use
```

## Comparison with Larger Models

MiniMind won't match GPT-4 — that's not the point. It teaches you:

| Concept | What You Learn |
|---------|---------------|
| Tokenizer | How text becomes numbers, BPE algorithm |
| Embeddings | How tokens map to vector space |
| Attention | How the model decides what's relevant |
| FFN layers | How information is transformed |
| Training dynamics | Learning rate schedules, loss curves, overfitting |
| RLHF | How preference data shapes model behavior |
| Scaling laws | Why bigger models are better (and the limits) |

## Quick Start

```bash
# Clone
git clone https://github.com/jingyaogong/minimind.git
cd minimind

# Install dependencies
pip install -r requirements.txt

# Download pre-built datasets
python download_data.py

# Train (full pipeline)
python train_pretrain.py    # ~1h
python train_sft.py         # ~30min
python train_dpo.py         # ~20min

# Chat with your model
python inference.py --model_path ./checkpoints/dpo/best.pt
```

## References

- [GitHub: jingyaogong/minimind](https://github.com/jingyaogong/minimind)
- [HuggingFace Collection](https://huggingface.co/collections/jingyaogong/minimind)
- [MiniMind-V (Vision)](https://github.com/jingyaogong/minimind-v)
- [English README](https://github.com/jingyaogong/minimind/blob/master/README_en.md)
- [Online Demo](https://www.modelscope.cn/studios/gongjy/MiniMind)
