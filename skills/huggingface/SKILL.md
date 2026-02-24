---
name: huggingface
description: |
  Work with Hugging Face's ecosystem for machine learning — transformers library, model hub,
  tokenizers, inference pipelines, and fine-tuning. Covers downloading pre-trained models,
  running inference, training custom models, and publishing to the Hub.
license: Apache-2.0
compatibility:
  - python 3.8+
  - transformers 4.30+
  - Linux/macOS/Windows
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ai-ml
  tags:
    - nlp
    - transformers
    - deep-learning
    - model-hub
    - fine-tuning
---

# Hugging Face

## Installation

```bash
# Install core libraries
pip install transformers datasets tokenizers accelerate huggingface_hub
```

```bash
# Login to Hugging Face Hub
huggingface-cli login
# Or set token as environment variable
export HF_TOKEN="hf_xxxxxxxxxxxxxxxxxxxx"
```

## Quick Inference with Pipelines

```python
# quick_inference.py — Run inference using built-in pipelines
from transformers import pipeline

# Text classification
classifier = pipeline("sentiment-analysis")
result = classifier("I love using Hugging Face!")
print(result)  # [{'label': 'POSITIVE', 'score': 0.9998}]

# Text generation
generator = pipeline("text-generation", model="meta-llama/Llama-2-7b-chat-hf")
output = generator("Explain transformers in one sentence:", max_new_tokens=50)
print(output[0]["generated_text"])

# Named entity recognition
ner = pipeline("ner", grouped_entities=True)
entities = ner("Hugging Face is based in New York City.")
print(entities)
```

## Loading Models and Tokenizers

```python
# load_model.py — Load a model and tokenizer manually for more control
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

model_name = "mistralai/Mistral-7B-Instruct-v0.2"

tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype=torch.float16,
    device_map="auto",  # Automatically distribute across GPUs
    load_in_4bit=True,  # Quantized loading for less VRAM
)

inputs = tokenizer("What is machine learning?", return_tensors="pt").to(model.device)
outputs = model.generate(**inputs, max_new_tokens=100, temperature=0.7)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

## Tokenizer Usage

```python
# tokenizer_basics.py — Understand tokenization for debugging and preprocessing
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")

text = "Hugging Face makes NLP easy!"
encoded = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
print(f"Input IDs: {encoded['input_ids']}")
print(f"Tokens: {tokenizer.convert_ids_to_tokens(encoded['input_ids'][0])}")
print(f"Token count: {len(encoded['input_ids'][0])}")

# Batch encoding
texts = ["First sentence.", "Second longer sentence here."]
batch = tokenizer(texts, padding=True, truncation=True, return_tensors="pt")
```

## Fine-Tuning with Trainer API

```python
# fine_tune.py — Fine-tune a model on a custom dataset using the Trainer API
from transformers import (
    AutoTokenizer, AutoModelForSequenceClassification,
    TrainingArguments, Trainer
)
from datasets import load_dataset
import numpy as np
from sklearn.metrics import accuracy_score

model_name = "distilbert-base-uncased"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=2)

dataset = load_dataset("imdb")

def tokenize(batch):
    return tokenizer(batch["text"], padding="max_length", truncation=True, max_length=256)

tokenized = dataset.map(tokenize, batched=True)

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    return {"accuracy": accuracy_score(labels, preds)}

training_args = TrainingArguments(
    output_dir="./results",
    num_train_epochs=3,
    per_device_train_batch_size=16,
    per_device_eval_batch_size=64,
    eval_strategy="epoch",
    save_strategy="epoch",
    learning_rate=2e-5,
    weight_decay=0.01,
    logging_steps=100,
    fp16=True,
    push_to_hub=False,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized["train"].select(range(5000)),
    eval_dataset=tokenized["test"].select(range(1000)),
    compute_metrics=compute_metrics,
)

trainer.train()
trainer.evaluate()
```

## LoRA / PEFT Fine-Tuning

```python
# lora_finetune.py — Parameter-efficient fine-tuning with LoRA
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model, TaskType
import torch

model_name = "meta-llama/Llama-2-7b-hf"
model = AutoModelForCausalLM.from_pretrained(model_name, torch_dtype=torch.float16, device_map="auto")
tokenizer = AutoTokenizer.from_pretrained(model_name)

lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# trainable params: 4,194,304 || all params: 6,742,609,920 || trainable%: 0.062
```

## Datasets Library

```python
# datasets_usage.py — Load, process, and create custom datasets
from datasets import load_dataset, Dataset

# Load from Hub
squad = load_dataset("squad", split="train[:1000]")
print(squad[0])

# Load custom CSV/JSON
dataset = Dataset.from_dict({
    "text": ["Hello world", "Goodbye world"],
    "label": [1, 0],
})

# Save and load locally
dataset.save_to_disk("./my_dataset")
loaded = Dataset.load_from_disk("./my_dataset")

# Push to Hub
dataset.push_to_hub("my-username/my-dataset", private=True)
```

## Publishing Models to Hub

```python
# push_to_hub.py — Save and share your trained model on Hugging Face Hub
from transformers import AutoModelForSequenceClassification, AutoTokenizer

model_name = "my-org/my-fine-tuned-model"

# After training, push model and tokenizer
model.push_to_hub(model_name, private=True)
tokenizer.push_to_hub(model_name, private=True)

# Create a model card
from huggingface_hub import ModelCard
card = ModelCard.from_template(
    card_data={"license": "mit", "datasets": ["imdb"], "language": "en"},
    template_str="# My Model\n\nFine-tuned DistilBERT on IMDB.\n\n{{ card_data }}",
)
card.push_to_hub(model_name)
```

## Inference API

```python
# inference_api.py — Use the serverless Inference API for quick model access
from huggingface_hub import InferenceClient

client = InferenceClient(token="hf_xxxxxxxxxxxx")

# Text generation
response = client.text_generation(
    "The future of AI is",
    model="mistralai/Mistral-7B-Instruct-v0.2",
    max_new_tokens=100,
)

# Image generation
image = client.text_to_image("A cat wearing a space suit")
image.save("space_cat.png")

# Embeddings
embeddings = client.feature_extraction("Hello world", model="sentence-transformers/all-MiniLM-L6-v2")
```

## Key Concepts

- **AutoClasses**: `AutoModel`, `AutoTokenizer` automatically detect the right architecture
- **device_map="auto"**: Distributes model layers across available GPUs/CPU
- **load_in_4bit/8bit**: Quantization via bitsandbytes for reduced memory usage
- **PEFT/LoRA**: Train only a small fraction of parameters — faster and cheaper
- **Datasets streaming**: `load_dataset(..., streaming=True)` for huge datasets without downloading
- **Trainer**: High-level API handling training loops, evaluation, checkpointing, and logging
