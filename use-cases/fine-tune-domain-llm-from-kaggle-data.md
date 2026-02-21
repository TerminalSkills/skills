---
title: "Fine-Tune a Domain-Specific LLM Using Kaggle Datasets"
slug: fine-tune-domain-llm-from-kaggle-data
description: "Train a custom LLM on real-world Kaggle data using parameter-efficient fine-tuning so it outperforms general models on your specific task."
skills:
  - kaggle-finetune
  - peft-fine-tuning
  - pytorch
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

A healthcare startup needs an LLM that understands medical terminology and can triage patient intake messages accurately. General-purpose models like GPT-4 get 72% accuracy on their classification task because medical abbreviations, drug names, and symptom descriptions require domain knowledge the base model lacks. They found a 50,000-row labeled dataset on Kaggle from a medical NLP competition, but getting from a raw CSV to a fine-tuned model running on their single A100 GPU is a multi-step pipeline they have never built before.

## The Solution

Using the **kaggle-finetune**, **peft-fine-tuning**, and **pytorch** skills together, the workflow downloads and preprocesses the Kaggle dataset into chat-format training pairs, configures a QLoRA fine-tune on a 7B parameter model that fits in 24GB VRAM, and trains with proper evaluation metrics so the team knows exactly when the model stops improving.

## Step-by-Step Walkthrough

### 1. Find and download the Kaggle dataset

Search Kaggle for a suitable medical classification dataset and download it locally using the Kaggle API.

> Download the "medical-qa-shared-task" dataset from Kaggle and show me the first 10 rows so I can understand the schema.

The skill authenticates via `~/.kaggle/kaggle.json`, downloads the dataset, and displays column names, data types, row counts, and sample entries so you can verify the data matches your task.

### 2. Preprocess into chat-format training pairs

Raw Kaggle CSVs are never in the format LLMs expect. The data needs to be converted from tabular rows into instruction-response pairs with a system prompt that defines the triage task.

> Convert this medical QA dataset into Alpaca-format JSONL. The instruction should be the patient message, and the output should be the triage category. Add a system prompt that says "You are a medical triage assistant. Classify the urgency of the patient message." Split 90/10 train/validation.

This produces `train.jsonl` (45,000 examples) and `val.jsonl` (5,000 examples), each line containing `instruction`, `input`, `output`, and `system` fields ready for fine-tuning.

### 3. Configure and launch the QLoRA fine-tune

Set up a parameter-efficient training run that fits within GPU memory constraints while achieving strong results.

> Fine-tune Llama-3.1-8B on the training JSONL using QLoRA. Use rank 64, alpha 128, target all linear layers. Train for 3 epochs with cosine schedule, batch size 4 with gradient accumulation of 8, learning rate 2e-4. Evaluate every 500 steps and save the best checkpoint by validation loss.

The PEFT skill configures 4-bit quantization so the 8B model fits in 16GB VRAM, applies LoRA adapters to attention and MLP layers, and sets up the Trainer with gradient checkpointing to minimize memory usage. Training produces a 150MB adapter file rather than a full 16GB model copy.

### 4. Evaluate and merge the adapter

After training completes, evaluate on the held-out validation set and merge the LoRA adapter into the base model for deployment.

> Evaluate the fine-tuned model on the validation set. Show me accuracy, F1 score per triage category, and a confusion matrix. Then merge the adapter into the base model and save it in GGUF format for Ollama deployment.

The evaluation reveals per-category performance so you can spot where the model struggles. Merging produces a standalone model file ready for inference without needing the PEFT library at runtime.

## Real-World Example

A telehealth company fine-tuned Mistral-7B on 48,000 patient intake messages from a Kaggle medical NLP dataset. The base model classified triage urgency at 71% accuracy. After 3 epochs of QLoRA training on a single A100 (8 hours, $12 in cloud compute), the fine-tuned model hit 93% accuracy on held-out data. The LoRA adapter was only 140MB, so they merged it and deployed via Ollama on a $200/month dedicated server. The model now processes 2,000 intake messages daily, routing urgent cases to nurses within 90 seconds instead of the previous 15-minute manual review cycle.
