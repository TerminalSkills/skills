---
title: "Fine-Tune a Domain-Specific LLM Using Kaggle Datasets"
slug: fine-tune-domain-llm-from-kaggle-data
description: "Train a custom LLM on real-world Kaggle data using parameter-efficient fine-tuning so it outperforms general models on your specific task."
skills:
  - kaggle-finetune
  - peft-fine-tuning
  - pytorch
  - unsloth
category: data-ai
tags:
  - fine-tuning
  - kaggle
  - lora
  - pytorch
  - llm
---

# Fine-Tune a Domain-Specific LLM Using Kaggle Datasets

## The Problem

A healthcare startup wants an LLM that sorts patient intake messages into urgency categories. Medical abbreviations, drug names and symptom descriptions trip up a general model prompted zero-shot, and the team has no measured baseline to beat. A labeled medical text dataset exists on Kaggle, but going from a raw CSV to a fine-tuned model on a single GPU is a multi-step pipeline they have never built: download, reshape into chat format, train, evaluate per class, export.

## The Solution

The **kaggle-finetune** skill downloads the dataset with the Kaggle CLI and converts it to chat-format JSONL. Training then runs either through **unsloth** (fastest on one consumer or cloud GPU, exports GGUF for Ollama) or through **peft-fine-tuning** with TRL's `SFTTrainer` when the team wants plain Hugging Face code. The **pytorch** skill covers the GPU setup and the evaluation loop that tells you whether the adapter beat the baseline.

## Step-by-Step Walkthrough

### 1. Find and download the dataset

Authenticate the Kaggle CLI once (`kaggle auth login`, or put a token from kaggle.com/settings/api in `KAGGLE_API_TOKEN`; never commit it). Then let the agent search instead of guessing a dataset name:

> List the ten most-voted Kaggle datasets matching "medical triage" and "patient symptoms text" (`kaggle datasets list -s ... --sort-by votes`). For each, show the license and size. Download the best labeled text dataset with `kaggle datasets download -d <owner>/<slug> -p ./data --unzip` and print the columns, the row count, the label distribution and five sample rows.

Check the license on the dataset page before training or sharing a model built from it. Competition data also needs the rules accepted on the website first. Medical text from Kaggle is rarely clinical-grade, so treat the finished model as a research prototype: it needs clinician review before it touches real patients.

### 2. Convert to chat-format training data

> Convert the CSV to JSONL where each line is `{"messages": [system, user, assistant]}`. The system message is "You are a medical triage assistant. Classify the urgency of the patient message." The user message is the patient text and the assistant message is the label. Hold out 10% as `val.jsonl`, stratified by label, and write the split sizes.

Using the `messages` layout lets both TRL and Unsloth apply the model's chat template without extra code. Inspect the label counts now: Kaggle medical sets usually over-represent common conditions, and the rare urgent classes are the ones that matter.

### 3. Train the QLoRA adapter

With Unsloth (it also fits an 8B model on far smaller cards than an A100):

> Fine-tune `unsloth/Llama-3.1-8B-Instruct` on `data/train.jsonl` with QLoRA: `r=16`, `lora_alpha=16`, all seven attention and MLP projections, 2 epochs, learning rate 2e-4, loss on assistant tokens only. Run the dry run first and show me the resolved config.

```console
$ unsloth train --model unsloth/Llama-3.1-8B-Instruct --local-dataset data/train.jsonl \
    --format-type chatml --train-on-completions --lora-r 16 --lora-alpha 16 \
    --num-epochs 2 --learning-rate 2e-4 --output-dir outputs/triage-llama31 --dry-run
```

The dry run prints the effective settings before any GPU time is spent; drop `--dry-run` to train. `--output-dir` is a run name inside Unsloth's own outputs folder. If the team prefers the PEFT route, the `peft-fine-tuning` skill sets up the same adapter with `LoraConfig` and `trl.SFTTrainer` (`SFTConfig(max_length=...)`, `processing_class=tokenizer`). Start with `r=16` and move to 32 or 64 only if evaluation shows underfitting. If memory runs out, drop `per_device_train_batch_size` to 1 and raise gradient accumulation before shrinking the model.

### 4. Evaluate against a baseline, then export

> Run the fine-tuned adapter and the untouched base model on `val.jsonl` with the same prompt, greedy decoding. Report accuracy, per-class precision, recall and F1, and a confusion matrix with scikit-learn. Flag any urgent class with recall below the base model's.

Per-class numbers show where the model struggles; a high overall accuracy can hide missed urgent cases. If the weak classes are the rare ones, upsample them or weight the loss before collecting more data. When the numbers justify it, export:

> Export the best checkpoint to GGUF `q4_k_m` with `unsloth export <checkpoint-path> "$PWD/exports/triage" --format gguf --quantization q4_k_m`, then create an Ollama model from the generated `Modelfile` and run three validation messages through it.

`unsloth list-checkpoints` prints the absolute path to pass. Use the same chat template for training and inference; a mismatch is the usual cause of gibberish after export.

## Real-World Example

A telehealth team ran this pipeline on a Kaggle symptom-text dataset of about 48,000 labeled messages. Their own numbers on a held-out split: the base model prompted zero-shot reached 71% accuracy, and the fine-tuned adapter 93%, with the merged model served through Ollama on a small dedicated server. The per-class report also showed the rarest urgent category lagging, which sent them back to rebalance the data before any wider trial. Your figures will differ by dataset, model and prompt; the baseline run in step 4 is what makes them meaningful.

## Related Skills

- [kaggle-finetune](/skills/kaggle-finetune) — downloads the Kaggle dataset with the CLI and converts it to chat-format JSONL for training
- [peft-fine-tuning](/skills/peft-fine-tuning) — the plain Hugging Face route: LoRA/QLoRA configuration with PEFT and TRL when Unsloth is not wanted
- [pytorch](/skills/pytorch) — GPU and dtype setup and the evaluation loop that compares the adapter with the base model
- [unsloth](/skills/unsloth) — faster, lower-memory QLoRA training on one GPU, plus GGUF export for Ollama
