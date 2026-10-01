---
name: minimind
description: >-
  MiniMind is an open-source PyTorch project that trains a 64M-parameter
  GPT-style language model from scratch on one GPU in about two hours. Use when
  a user wants to learn how LLMs work by building one, pretrain and fine-tune a
  tiny model, run LoRA, DPO or PPO/GRPO experiments on a small model, or serve a
  MiniMind checkpoint through an OpenAI-compatible API.
license: Apache-2.0
compatibility: "Python 3.10+, PyTorch; an NVIDIA GPU with CUDA is recommended (CPU and Apple MPS run but are slow)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/jingyaogong/minimind
  tags:
    - llm-training
    - gpt
    - from-scratch
    - education
    - machine-learning
---

# MiniMind

## Overview

MiniMind is a teaching project: a complete LLM training pipeline written in plain PyTorch, small enough to run on a single consumer GPU. The current model, `minimind-3` (released 2026-04-01), is a 64M-parameter decoder-only Transformer (8 layers, hidden size 768, RMSNorm, SwiGLU, RoPE with YaRN) with a 6,400-token vocabulary and a Qwen3-style configuration; `minimind-3-moe` adds 4 experts (198M total, 64M active). The repository covers tokenizer training, pretraining, supervised fine-tuning (SFT), LoRA, DPO, PPO/GRPO, tool calling, distillation, and an OpenAI-compatible server.

> Source: [jingyaogong/minimind](https://github.com/jingyaogong/minimind) (63k stars). There is no pip package — you clone the repository and run its scripts.

## Instructions

### 1. Clone and install

```bash
git clone --depth 1 https://github.com/jingyaogong/minimind
cd minimind
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -c "import torch; print(torch.__version__, torch.cuda.is_available())"
```

`requirements.txt` does not pin PyTorch (its `torch==2.6.0` line is commented out). If the check prints `False` on a GPU machine, install the PyTorch build that matches your CUDA version before training.

### 2. Try a released model

```bash
hf download jingyaogong/minimind-3 --local-dir ./minimind-3
python eval_llm.py --load_from ./minimind-3
```

`eval_llm.py` is interactive: enter `0` to run eight built-in prompts or `1` to type your own. Add `--open_thinking 1` to make the model write its reasoning first. The same model is on Ollama: `ollama run jingyaogong/minimind-3`.

### 3. Download the training data

Files live in the `jingyaogong/minimind_dataset` dataset on Hugging Face (also on ModelScope) and go into `./dataset/`. For a quick run you need two of them:

```bash
hf download jingyaogong/minimind_dataset pretrain_t2t_mini.jsonl sft_t2t_mini.jsonl \
  --repo-type dataset --local-dir ./dataset
```

| File | Size | Used by |
|---|---|---|
| `pretrain_t2t_mini.jsonl` | 1.2 GB | `train_pretrain.py` (default) |
| `sft_t2t_mini.jsonl` | 1.7 GB | `train_full_sft.py` (default) |
| `pretrain_t2t.jsonl`, `sft_t2t.jsonl` | 8.3 GB, 14 GB | full reproduction of `minimind-3` |
| `dpo.jsonl` | 54 MB | `train_dpo.py` |
| `rlaif.jsonl` | 24 MB | `train_ppo.py`, `train_grpo.py` |
| `lora_medical.jsonl`, `lora_identity.jsonl` | 34 MB, under 1 MB | `train_lora.py` |

### 4. Pretrain, then fine-tune

All training scripts are run from the `trainer/` directory; their default paths are relative to it.

```bash
cd trainer
python train_pretrain.py     # ../dataset/pretrain_t2t_mini.jsonl -> ../out/pretrain_768.pth
python train_full_sft.py     # loads pretrain_768.pth          -> ../out/full_sft_768.pth
cd .. && python eval_llm.py --weight full_sft
```

Useful flags, shared by the training scripts: `--epochs`, `--batch_size`, `--learning_rate`, `--max_seq_len`, `--hidden_size` (768), `--num_hidden_layers` (8), `--use_moe 1`, `--data_path`, `--from_weight`, `--from_resume 1` (continue from `../checkpoints/`), `--use_wandb` (logs to SwanLab, not Weights & Biases). Weights are named by stage, hidden size and architecture: `full_sft_768.pth`, `full_sft_768_moe.pth`. Multi-GPU: `torchrun --nproc_per_node 2 train_pretrain.py`.

### 5. Optional stages

```bash
cd trainer
python train_lora.py --lora_name lora_medical --data_path ../dataset/lora_medical.jsonl   # -> ../out/lora_medical_768.pth
python train_dpo.py            # ../dataset/dpo.jsonl -> ../out/dpo_768.pth
python train_grpo.py           # ../dataset/rlaif.jsonl; train_ppo.py uses the same file, train_agent.py uses agent_rl.jsonl
python train_distillation.py   # teacher ../out/full_sft_768_moe.pth, student ../out/full_sft_768.pth -> ../out/full_dist_768.pth
```

`train_ppo.py`, `train_grpo.py` and `train_agent.py` score answers with a reward model and expect `internlm/internlm2-1_8b-reward` (Hugging Face) in a directory next to the `minimind` checkout (`--reward_model_path`, default `../../internlm2-1_8b-reward`). `train_distillation.py` has its own flags (`--student_hidden_size`, `--teacher_use_moe`, `--from_teacher_weight`); its default teacher is the MoE model, so train or download `full_sft_768_moe.pth` first or pass `--teacher_use_moe 0`.

### 6. Serve and export

```bash
cd scripts
python serve_openai_api.py                          # native weights: ../out/full_sft_768.pth
python serve_openai_api.py --load_from ../minimind-3   # transformers-format folder
```

The server listens on `0.0.0.0:8998` and implements `POST /v1/chat/completions` (streaming by default, plus `tools` and `open_thinking`). `python convert_model.py` turns `../out/full_sft_768.pth` into a transformers folder `../minimind-3`; the same file holds `convert_merge_base_lora` for merging a LoRA into the base weights (edit the `__main__` block to call it).

### Data formats

```json
{"text": "Transformers model context with self-attention."}
{"conversations": [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hello! How can I help?"}]}
{"chosen": [{"role": "user", "content": "Q"}, {"role": "assistant", "content": "good answer"}], "rejected": [{"role": "user", "content": "Q"}, {"role": "assistant", "content": "bad answer"}]}
```

One JSON object per line: `text` for pretraining, `conversations` for SFT and LoRA (roles `system`, `user`, `assistant`, `tool`), `chosen`/`rejected` for DPO.

## Examples

### Example 1: Train a chat model from scratch on one GPU

**User prompt:** "I have an RTX 3090. Train MiniMind from scratch and let me talk to it."

```bash
git clone --depth 1 https://github.com/jingyaogong/minimind && cd minimind
pip install -r requirements.txt
hf download jingyaogong/minimind_dataset pretrain_t2t_mini.jsonl sft_t2t_mini.jsonl \
  --repo-type dataset --local-dir ./dataset

cd trainer
python train_pretrain.py --epochs 1
python train_full_sft.py --epochs 1
cd .. && python eval_llm.py --weight full_sft
```

Result: each script logs lines like `Epoch:[1/1](100/…), loss: …, logits_loss: …, aux_loss: …, lr: …, epoch_time: …min` and saves every 1000 steps. The project measured about 1.2 h for pretraining and 1.1 h for SFT (one epoch each) on a single 3090. You end with `out/pretrain_768.pth` and `out/full_sft_768.pth`, and `eval_llm.py` prints each answer followed by `[Speed]: … tokens/s`. The scripts default to `--epochs 2`, which doubles the time.

### Example 2: LoRA fine-tune on your own Q&A and serve it

**User prompt:** "Fine-tune MiniMind on our clinic FAQ with LoRA and expose it as an OpenAI-style endpoint."

Write `dataset/lora_clinic.jsonl`, one conversation per line:

```json
{"conversations": [{"role": "user", "content": "What are your opening hours?"}, {"role": "assistant", "content": "The clinic is open Monday to Friday 08:00-18:00 and Saturday 09:00-13:00."}]}
```

```bash
cd trainer
python train_lora.py --lora_name lora_clinic --data_path ../dataset/lora_clinic.jsonl
cd .. && python eval_llm.py --weight full_sft --lora_weight lora_clinic

cd scripts && python serve_openai_api.py --lora_weight lora_clinic
curl http://localhost:8998/v1/chat/completions -H "Content-Type: application/json" \
  -d '{"model": "minimind", "messages": [{"role": "user", "content": "What are your opening hours?"}], "stream": false}'
```

Result: `out/lora_clinic_768.pth` holds only the LoRA weights and is applied on top of `out/full_sft_768.pth` (train or download that base first — `full_sft_768.pth` is published in `jingyaogong/minimind-3-pytorch`). The `curl` call returns `{"id": "chatcmpl-1790851200", "object": "chat.completion", "created": 1790851200, "model": "minimind", "choices": [{"index": 0, "message": {"role": "assistant", "content": "…"}, "finish_reason": "stop"}]}`.

## Guidelines

- **It is an educational model.** 64M parameters and a few GB of text give basic dialogue, not reliable facts. The training data is mostly Chinese; English output is noticeably weaker.
- **Run scripts from the right directory.** Trainers assume `trainer/` as the working directory, `serve_openai_api.py` and `convert_model.py` assume `scripts/`, `eval_llm.py` assumes the repository root.
- **`--load_from` is matched by name.** A path that contains the word `model` is treated as native `.pth` weights in `out/`; anything else is loaded as a transformers folder. Keep downloaded models in folders such as `./minimind-3`, not `./models/minimind-3`.
- **Keep the architecture flags consistent.** `--hidden_size`, `--num_hidden_layers` and `--use_moe` must be the same for training, evaluation and serving, because they are part of the weight file name and shape.
- **Each save overwrites the previous one.** Copy `out/*.pth` elsewhere before re-running a stage with different settings.
- **Do not retrain the tokenizer** unless that is the experiment: a new vocabulary invalidates every released weight and dataset assumption.
- **`--load_from` can run code from the folder.** `eval_llm.py` and `serve_openai_api.py` load it with `trust_remote_code=True`. The released `minimind-3` is a plain `Qwen3ForCausalLM` folder with no custom code, but point `--load_from` only at the official `jingyaogong/*` repositories or your own exports.
- **The API server has no authentication** and binds to all interfaces. Keep it on localhost or behind a firewall.
- **`max_seq_len` counts tokens** (about 1.5-1.7 Chinese characters or 4-5 English characters per token). Longer samples are truncated, shorter ones padded.

## References

- [GitHub: jingyaogong/minimind](https://github.com/jingyaogong/minimind)
- [Hugging Face collection](https://huggingface.co/collections/jingyaogong/minimind-66caf8d999f5c7fa64f399e5) · [dataset](https://huggingface.co/datasets/jingyaogong/minimind_dataset)
- [MiniMind-V (vision)](https://github.com/jingyaogong/minimind-v)
