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
  category: data-ai
  tags:
    - llm-training
    - gpt
    - from-scratch
    - education
    - machine-learning
---

# MiniMind

## Overview

Train a 64M parameter GPT language model from scratch in ~2 hours on a single GPU. Understand every component of LLM architecture by building one yourself — from tokenizer training to RLHF alignment. The architecture tracks Qwen3/Qwen3-MoE, so patterns you learn here apply directly to full-scale models.

> Source: [jingyaogong/minimind](https://github.com/jingyaogong/minimind) (45k+ stars)

## Instructions

### 1. Clone and install

```bash
git clone https://github.com/jingyaogong/minimind.git
cd minimind
pip install -r requirements.txt
python download_data.py
```

### 2. Pretrain on raw text

```bash
python train_pretrain.py \
    --data_path ./data/pretrain_data.jsonl \
    --model_config ./config/minimind-3.yaml \
    --epochs 2 \
    --batch_size 32 \
    --learning_rate 5e-4
```

### 3. Supervised fine-tuning (SFT)

```bash
python train_sft.py \
    --pretrained_model ./checkpoints/pretrain/best.pt \
    --data_path ./data/sft_data.jsonl \
    --epochs 3 \
    --batch_size 16 \
    --learning_rate 1e-5
```

### 4. RLHF alignment (optional)

```bash
python train_dpo.py \
    --model_path ./checkpoints/sft/best.pt \
    --preference_data ./data/dpo_pairs.jsonl
```

Multiple alignment methods: DPO (simplest), PPO (classic), GRPO (DeepSeek-style).

### 5. Run inference

```bash
python inference.py --model_path ./checkpoints/dpo/best.pt
```

Or start an OpenAI-compatible API server:

```bash
python api_server.py --model_path ./checkpoints/sft/best.pt --port 8000
```

## Examples

### Example 1: Full training pipeline on a single GPU

Train a 64M parameter model from scratch on an NVIDIA RTX 3090:

```bash
git clone https://github.com/jingyaogong/minimind.git && cd minimind
pip install -r requirements.txt
python download_data.py

python train_pretrain.py    # ~1h — learns language patterns
python train_sft.py         # ~30min — learns to follow instructions
python train_dpo.py         # ~20min — aligns with human preferences

python inference.py --model_path ./checkpoints/dpo/best.pt
# > What is machine learning?
# Machine learning is a subset of artificial intelligence where systems
# learn patterns from data rather than being explicitly programmed...
```

Total cost: ~$3 in GPU rental or ~2 hours on your own hardware.

### Example 2: LoRA fine-tuning for a specific domain

Fine-tune the base model on medical Q&A data using LoRA (parameter-efficient):

```bash
python train_lora.py \
    --base_model ./checkpoints/sft/best.pt \
    --data_path ./data/medical_qa.jsonl \
    --lora_rank 8 \
    --lora_alpha 16
```

SFT data format:

```json
{
  "conversations": [
    {"role": "user", "content": "What are the symptoms of Type 2 diabetes?"},
    {"role": "assistant", "content": "Common symptoms include increased thirst, frequent urination, blurred vision, slow-healing wounds, and unexplained weight loss..."}
  ]
}
```

### Example 3: Python API for programmatic inference

```python
from model import MiniMindModel
from tokenizer import MiniMindTokenizer

model = MiniMindModel.from_pretrained("./checkpoints/sft/best.pt")
tokenizer = MiniMindTokenizer("./tokenizer/tokenizer.model")

prompt = "Explain how attention works in transformers"
input_ids = tokenizer.encode(prompt)
output = model.generate(input_ids, max_new_tokens=256, temperature=0.7)
print(tokenizer.decode(output))
```

## Guidelines

- **GPU requirements:** 64M model needs ~4GB VRAM (RTX 3090 recommended); even a GTX 1660 works (slower)
- **MoE variant** available at 198M total / 64M active parameters — needs ~8GB VRAM
- **Pre-built datasets** on HuggingFace: pretrain corpus, SFT pairs, DPO preference pairs, tool-use examples
- **Multi-GPU** supported via DDP and DeepSpeed for larger variants
- **Not production-grade** — MiniMind is an educational tool. It won't match GPT-4, but teaches you every component: tokenizer, embeddings, attention, FFN, training dynamics, RLHF
- Architecture uses GQA attention, SwiGLU FFN, RMSNorm, and RoPE with YaRN — matching production model patterns

## References

- [GitHub: jingyaogong/minimind](https://github.com/jingyaogong/minimind)
- [HuggingFace Collection](https://huggingface.co/collections/jingyaogong/minimind)
- [MiniMind-V (Vision)](https://github.com/jingyaogong/minimind-v)
