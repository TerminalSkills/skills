---
name: vibe-voice
description: >-
  Run Microsoft's VibeVoice, open-source voice AI for long-form speech recognition with speaker labels and timestamps, plus real-time text-to-speech. Use when: transcribing meetings or podcasts with diarization, adding hotwords for domain terms, streaming speech recognition, serving ASR through vLLM, or building a voice assistant with a 0.5B streaming TTS model.
license: MIT
compatibility: "Python 3.10+, NVIDIA GPU recommended (CPU build available for ASR), ffmpeg"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags:
    - voice
    - tts
    - stt
    - speech
    - real-time
  repository: https://github.com/microsoft/VibeVoice
---

# VibeVoice

## Overview

VibeVoice is Microsoft's open-source family of voice models (MIT licence). As of October 2026 the repository ships:

- **VibeVoice-ASR (7B)**: transcribes up to 60 minutes of audio in one pass and returns who spoke, when, and what. Over 50 languages, no language flag needed, custom hotwords supported.
- **VibeVoice-ASR-Streaming (7B)**: emits text chunk by chunk while audio is still arriving, with hotwords and 10 languages (released September 2026).
- **VibeVoice-ASR-BitNet**: a quantized CPU build (about 1.6 GB, run through the separate `microsoft/VibeASR.cpp` engine), no GPU needed.
- **VibeVoice-Realtime-0.5B**: single-speaker streaming TTS, roughly 200-300 ms to first audio, about 10 minutes of speech per generation. English is the supported language; nine other languages are experimental.
- **VibeVoice-TTS-1.5B**: long-form multi-speaker TTS (up to 90 minutes, 4 speakers). The weights are on Hugging Face, but Microsoft **removed the TTS inference code from the repository in September 2025** after misuse, so the repo cannot run it today.

Important: there is no `VibeVoiceTTS` or `VibeVoiceASR` Python class and no `pip install vibevoice` release from Microsoft. The PyPI package of that name is not the Microsoft project. Install from the GitHub clone, or use the Hugging Face Transformers integration for ASR.

## Instructions

### Speech recognition with Transformers (simplest path)

VibeVoice-ASR is in Transformers 5.3 and later. The repo itself pins `transformers<5`, so keep the two in separate virtual environments.

```bash
python -m venv .venv-asr && source .venv-asr/bin/activate
pip install "transformers>=5.3.0" accelerate librosa
```

```python
from transformers import AutoProcessor, VibeVoiceAsrForConditionalGeneration

model_id = "microsoft/VibeVoice-ASR-HF"
processor = AutoProcessor.from_pretrained(model_id)
model = VibeVoiceAsrForConditionalGeneration.from_pretrained(model_id, device_map="auto")

inputs = processor.apply_transcription_request(
    audio="team_standup.wav",
    prompt="Participants: Priya Raman, Tomasz Wozniak. Terms: Kubernetes, Grafana",
).to(model.device, model.dtype)
output_ids = model.generate(**inputs)
generated = output_ids[:, inputs["input_ids"].shape[1]:]

segments = processor.decode(generated, return_format="parsed")[0]
for s in segments:
    print(f"[{s['Start']:.1f}-{s['End']:.1f}s] Speaker {s['Speaker']}: {s['Content']}")
```

- `return_format` is `"parsed"` (list of dicts with `Start`, `End`, `Speaker`, `Content`), `"transcription_only"` (plain text) or raw. If the model output is not valid JSON, the raw string comes back unchanged.
- The `prompt` argument is the context/hotword channel. Pass a list of audio files and a list of prompts of equal length for batches (use `None` for no prompt).
- If you run out of memory, the model processes audio in 60-second tokenizer chunks; the model card describes adjusting the chunk size.

### Running from the repository

```bash
git clone https://github.com/microsoft/VibeVoice.git && cd VibeVoice
pip install -e .          # realtime TTS needs: pip install -e .[streamingtts]
apt install ffmpeg        # the demos use it to decode audio

python demo/vibevoice_asr_inference_from_file.py \
  --model_path microsoft/VibeVoice-ASR --audio_files team_standup.wav
python demo/vibevoice_asr_gradio_demo.py --model_path microsoft/VibeVoice-ASR --share
```

NVIDIA's PyTorch container (24.07 to 25.12) is the verified environment; install `flash-attn` if the container lacks it.

### Streaming recognition

```bash
python demo/vibevoice_asr_streaming_inference_from_file.py \
  --model_path microsoft/VibeVoice-ASR-Streaming-7B --audio_files call.wav \
  --context_info "Microsoft,VibeVoice"
python demo/vibevoice_asr_streaming_fastapi_demo.py --model_path microsoft/VibeVoice-ASR-Streaming-7B
```

The FastAPI demo serves a page on `http://localhost:7870` that keeps a WebSocket open while you speak. Chunk size is read from the checkpoint's `preprocessor_config.json`.

### Real-time TTS

```bash
bash demo/download_experimental_voices.sh     # optional extra voices
python demo/realtime_model_inference_from_file.py \
  --model_path microsoft/VibeVoice-Realtime-0.5B \
  --txt_path demo/text_examples/1p_vibevoice.txt --speaker_name Carter
python demo/vibevoice_realtime_demo.py --model_path microsoft/VibeVoice-Realtime-0.5B   # websocket demo
```

Voices are shipped as embedded prompts; custom voice cloning is not offered by Microsoft for this model.

### Serving ASR with vLLM

`docs/vibevoice-vllm-asr.md` describes a plugin with an OpenAI-compatible `/v1/chat/completions` endpoint. From a clone of the repo:

```bash
docker run -d --gpus all --name vibevoice-vllm --ipc=host -p 127.0.0.1:8000:8000 \
  -v $(pwd):/app -w /app --entrypoint bash vllm/vllm-openai:v0.14.1 \
  -c "python3 /app/vllm_plugin/scripts/start_server.py"
docker exec -it vibevoice-vllm python3 vllm_plugin/tests/test_api.py /app/audio.wav --hotwords "Microsoft,VibeVoice"
```

Add `--dp N` for N replicas or `--tp N` to split one model over N GPUs. Audio files must sit inside the mounted directory.

## Examples

### Example 1: Meeting transcript with speaker labels

**Request:** "Transcribe standup.wav and tell me who said what, and make sure Grafana and Kubernetes are spelled right."

Use the Transformers snippet above with `prompt="Terms: Grafana, Kubernetes"` and `return_format="parsed"`. Result: a list of segments such as `[0.0-3.4s] Speaker 0: Let's review the Q3 numbers.` Speaker ids are numbers, not names; map them yourself afterwards.

### Example 2: Live captions for a call

**Request:** "I want text on screen while the customer is still talking."

Start `demo/vibevoice_asr_streaming_fastapi_demo.py` with the streaming checkpoint, open `http://localhost:7870`, and record from the microphone. Text arrives once per chunk over the WebSocket. For a file test, run the `..._streaming_inference_from_file.py` script; each chunk prints as it is emitted.

## Guidelines

- Hardware: the 7B ASR models need a large GPU (the repo does not publish a minimum; plan for 16 GB or more). The 0.5B realtime model runs on a T4 or an Apple M4 Pro in real time according to the docs.
- The realtime TTS model is English-focused, single speaker, and unstable for inputs of three words or fewer. It cannot read code, formulas or unusual symbols; normalize the text first.
- Microsoft states the models are for research and development and does not recommend commercial use without further testing. Disclose AI-generated audio and never use it to impersonate anyone; this is why the TTS code was withdrawn.
- ASR can fall into repetition loops on very long audio; the vLLM plugin ships `test_api_auto_recover.py` for that.
- Do not copy API calls from older tutorials (`VibeVoiceTTS.from_pretrained`, `synthesize_conversation`): they do not exist in the repository.
- Resources: [project page](https://microsoft.github.io/VibeVoice), [Hugging Face collection](https://huggingface.co/collections/microsoft/vibevoice-68a2ef24a875c44be47b034f), [ASR report](https://arxiv.org/pdf/2601.18184).
