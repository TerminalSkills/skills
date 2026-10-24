---
name: ai-scientist
description: >-
  The AI Scientist-v2 is Sakana AI's open-source research agent that turns a
  topic description into research ideas, runs machine-learning experiments with
  an agentic tree search, and writes a LaTeX paper with citations. Use when
  someone wants to automate ML research, generate and test hypotheses, run
  "AI Scientist" or "AI-Scientist-v2", or study automated scientific discovery.
license: Apache-2.0
compatibility: 'Linux with NVIDIA GPU and CUDA, conda, Python 3.11, LLM API keys (OpenAI, Gemini or Bedrock); run inside a sandbox'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/SakanaAI/AI-Scientist-v2
  category: research
  tags:
    - research
    - science
    - hypothesis
    - experiment
    - automation
---

# AI Scientist

## Overview

The AI Scientist-v2 (`SakanaAI/AI-Scientist-v2`, paper arXiv:2504.08066) is a research codebase, not a pip library. It runs in two steps: (1) `ai_scientist/perform_ideation_temp_free.py` turns a Markdown topic description into a JSON file of research ideas, checking novelty against Semantic Scholar; (2) `launch_scientist_bfts.py` takes one of those ideas, has a coding agent run experiments through a best-first tree search (configured in `bfts_config.yaml`), then writes and reviews a paper (PDF). Its README says v2 is exploratory with a lower success rate than the template-based v1 (`SakanaAI/AI-Scientist`), which suits tasks with a clear objective and a strong starting template.

The PyPI package named `ai-scientist` is an unrelated project; do not install it for this tool.

Safety first: the system executes code written by an LLM, with possible dangerous packages, open web access and spawned processes. Run it only in a controlled sandbox such as a Docker container with limited network access.

## Instructions

### 1. Install

```bash
git clone https://github.com/SakanaAI/AI-Scientist-v2.git
cd AI-Scientist-v2
conda create -n ai_scientist python=3.11
conda activate ai_scientist
conda install pytorch torchvision torchaudio pytorch-cuda=12.4 -c pytorch -c nvidia   # match your CUDA version
conda install anaconda::poppler
conda install conda-forge::chktex
pip install -r requirements.txt
```

The README says installation takes up to an hour and that the code targets Linux with NVIDIA GPUs.

### 2. Set API keys

```bash
export OPENAI_API_KEY="..."        # default for OpenAI models
export GEMINI_API_KEY="..."        # for Gemini models, used through the OpenAI-compatible API
export S2_API_KEY="..."            # optional Semantic Scholar key, avoids rate limits in ideation and citation
# Claude through AWS Bedrock needs the extra package anthropic[bedrock] and the variables
# AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_REGION_NAME
```

Read keys from your shell or secret manager; never write them into the topic file or the config.

### 3. Describe the topic and generate ideas

Create `ai_scientist/ideas/<topic>.md` with the sections `Title`, `Keywords`, `TL;DR` and `Abstract`; copy the structure of `ai_scientist/ideas/i_cant_believe_its_not_better.md`. Then:

```bash
python ai_scientist/perform_ideation_temp_free.py \
  --workshop-file "ai_scientist/ideas/few_shot_medical_imaging.md" \
  --model gpt-4o-2024-05-13 \
  --max-num-generations 20 \
  --num-reflections 5
```

The output is `ai_scientist/ideas/few_shot_medical_imaging.json`, a list of ideas with hypotheses, proposed experiments and related-work notes. `--model` must be one of the names in `AVAILABLE_LLMS` in `ai_scientist/llm.py` (the script rejects anything else), and your account must still be able to call it; the README's example names are from 2024.

### 4. Run the experiment and paper pipeline

Review `bfts_config.yaml` first: `agent.num_workers` (parallel paths), `agent.steps` and the `stageN_max_iters` limits (size of the search), `agent.search.num_drafts`, `max_debug_depth` and `debug_prob`, `exec.timeout` (seconds per run), and the model entries for `code`, `feedback`, `vlm_feedback` and `report`. The shipped coding model is a Bedrock Claude 3.5 Sonnet id; change it to a model you can access.

```bash
python launch_scientist_bfts.py \
  --load_ideas "ai_scientist/ideas/few_shot_medical_imaging.json" \
  --idea_idx 0 \
  --model_writeup o1-preview-2024-09-12 \
  --model_citation gpt-4o-2024-11-20 \
  --model_review gpt-4o-2024-11-20 \
  --model_agg_plots o3-mini-2025-01-31 \
  --num_cite_rounds 20
```

`--idea_idx` picks which idea of the file to run (0 is the first). Run `python launch_scientist_bfts.py --help` for the current flags. `--load_code` seeds the experiment with a Python file next to the ideas file and with the same name (`few_shot_medical_imaging.py`); if that file does not exist the script only prints a warning, so omit the flag unless you wrote one. `--add_dataset_ref` prepends a Hugging Face dataset snippet from `hf_dataset_reference.py` in the working directory; the repository does not ship that file, so leave the flag out unless you wrote one. Replace any model id the provider has retired.

### 5. Find the results

A timestamped folder appears under `experiments/`. Open `experiments/<timestamp>_<idea>/logs/0-run/unified_tree_viz.html` to inspect the tree search. After the experiments the write-up stage runs (about 20 to 30 minutes) and leaves `<timestamp>_<idea>.pdf` in the same experiment folder.

## Examples

### Example 1: Explore a new topic

**User request:**

```
I want the AI Scientist to look into why contrastive pre-training sometimes fails on small medical image datasets.
```

The agent writes `ai_scientist/ideas/contrastive_medical_failures.md` (title, keywords, TL;DR, abstract), runs the ideation script with `--max-num-generations 5` to keep cost low, and opens the resulting JSON. It summarises each idea's hypothesis and proposed experiment and asks which one to run. Result: a JSON idea file the user can review before spending GPU time.

### Example 2: Run one idea cheaply

**User request:**

```
Run the first idea from contrastive_medical_failures.json, but keep the cost small.
```

The agent lowers `agent.num_workers` to 2, `agent.multi_seed_eval.num_seeds` to 2 and `agent.steps` and the stage limits, sets `exp_name`, checks that the `code` and `report` models are ones the user has keys for, then launches `launch_scientist_bfts.py` inside the user's Docker sandbox. Result: logs under `experiments/`, a tree visualization HTML and, if the run succeeds, a PDF; a failed run produces no PDF, which is a normal outcome.

## Guidelines

- Cost: the README estimates about $15 to $20 per experiment run with Claude 3.5 Sonnet for coding, plus about $5 for the write-up with the default models. Ideation costs a few dollars. Check the vendor's current model prices.
- Success depends on the model and the idea; expect some runs to end with no paper. Higher-capability coding models give better odds.
- Semantic Scholar rate limits are the usual cause of ideation or citation failures; set `S2_API_KEY` or skip the citation phase.
- CUDA out-of-memory means the generated experiment wants a bigger model than your GPU holds; say in the topic file that small models should be used.
- Licence: the code uses the AI Scientist Source Code License, which requires that any manuscript produced with it carries a prominent disclosure that it was machine-generated. Add that disclosure before sharing a paper, and read the licence before commercial use.
- Treat every output as a draft: verify claims, numbers, and citations by hand before using or submitting anything.
- Not for: quick literature questions or non-ML experiments (the pipeline assumes Python experiments that run on one GPU machine).
