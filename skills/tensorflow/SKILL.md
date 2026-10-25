---
name: tensorflow
description: >-
  TensorFlow is Google's open-source machine learning framework for building,
  training and deploying neural networks with Keras 3. Use when a user asks to
  train a model with Keras, write a custom training loop, install TensorFlow
  with GPU support, export a SavedModel for TensorFlow Serving, or convert a
  model to TFLite for mobile and edge devices.
license: Apache-2.0
compatibility: "Python 3.10+; Linux, macOS or Windows (GPU on Linux or WSL2 with NVIDIA CUDA 12)"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/tensorflow/tensorflow
  tags: "tensorflow, keras, deep-learning, tflite, python"
---

# TensorFlow — Deep Learning Framework

## Overview

TensorFlow 2.21 (March 2026) ships Keras 3 (`keras` 3.15; `tf.keras` and `from tensorflow import keras` both resolve to it). The snippets below were run against these versions. Use Keras for most work, a custom `tf.GradientTape` loop when you need control, `model.export()` for serving, and TFLite for mobile or edge.

## Instructions

### Keras API (High-Level)

```python
import tensorflow as tf
from tensorflow import keras

# Sequential model for simple architectures
model = keras.Sequential([
    keras.layers.Input(shape=(784,)),
    keras.layers.Dense(256, activation="relu"),
    keras.layers.Dropout(0.3),
    keras.layers.Dense(128, activation="relu"),
    keras.layers.Dropout(0.2),
    keras.layers.Dense(10, activation="softmax"),
])

model.compile(
    optimizer=keras.optimizers.Adam(learning_rate=1e-3),
    loss="sparse_categorical_crossentropy",
    metrics=["accuracy"],
)

# Train
history = model.fit(
    x_train, y_train,
    epochs=20,
    batch_size=64,
    validation_split=0.2,
    callbacks=[
        keras.callbacks.EarlyStopping(patience=3, restore_best_weights=True),
        keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=2),
        keras.callbacks.ModelCheckpoint("best_model.keras", save_best_only=True),
    ],
)
```

### Functional API (Complex Architectures)

```python
# Multi-input, multi-output model
text_input = keras.Input(shape=(None,), dtype="int32", name="text")
image_input = keras.Input(shape=(224, 224, 3), name="image")

# Text branch
x = keras.layers.Embedding(vocab_size, 128)(text_input)
x = keras.layers.LSTM(64)(x)

# Image branch
y = keras.applications.EfficientNetV2B0(include_top=False, pooling="avg")(image_input)
y = keras.layers.Dense(128, activation="relu")(y)

# Combine
combined = keras.layers.Concatenate()([x, y])
combined = keras.layers.Dense(64, activation="relu")(combined)

# Multiple outputs
category = keras.layers.Dense(num_categories, activation="softmax", name="category")(combined)
sentiment = keras.layers.Dense(1, activation="sigmoid", name="sentiment")(combined)

model = keras.Model(
    inputs=[text_input, image_input],
    outputs=[category, sentiment],
)
```

### Custom Training Loop

```python
# Fine-grained control over training
@tf.function                              # traces the Python step into a TensorFlow graph
def train_step(model, optimizer, x, y):
    with tf.GradientTape() as tape:
        predictions = model(x, training=True)
        loss = loss_fn(y, predictions)

    gradients = tape.gradient(loss, model.trainable_variables)
    optimizer.apply_gradients(zip(gradients, model.trainable_variables))
    return loss

# Training loop
for epoch in range(num_epochs):
    for batch_x, batch_y in train_dataset:
        loss = train_step(model, optimizer, batch_x, batch_y)
    
    # Validation
    val_loss = tf.reduce_mean([
        loss_fn(y, model(x, training=False))
        for x, y in val_dataset
    ])
    print(f"Epoch {epoch}: loss={loss:.4f}, val_loss={val_loss:.4f}")
```

### Deployment

```python
# Save model
model.save("my_model.keras")              # Keras format
model.export("models/my_model/1")        # SavedModel for TF Serving (model.save("dir/") raises ValueError in Keras 3)

# TFLite for mobile
converter = tf.lite.TFLiteConverter.from_keras_model(model)
converter.optimizations = [tf.lite.Optimize.DEFAULT]  # dynamic-range quantization
# Google is moving on-device inference to LiteRT (pip package ai-edge-litert); tf.lite.TFLiteConverter still works in 2.21
tflite_model = converter.convert()
with open("model.tflite", "wb") as f:
    f.write(tflite_model)

# TensorFlow Serving (Docker): the version number (1) must be a directory under the model name
# docker run -p 127.0.0.1:8501:8501 --mount type=bind,source="$PWD/models",target=/models \
#   -e MODEL_NAME=my_model tensorflow/serving

# REST API inference
import requests
response = requests.post(
    "http://localhost:8501/v1/models/my_model:predict",
    json={"instances": x_test[:5].tolist()},
)
predictions = response.json()["predictions"]
```

### Installation

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install tensorflow                     # CPU only (Python 3.10+)
pip install "tensorflow[and-cuda]"         # Linux NVIDIA GPU: pulls CUDA 12 and cuDNN 9 wheels
pip install tensorboard                    # no longer installed with tensorflow 2.21
python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"
```

Native Windows has no GPU support after TF 2.10 (use WSL2). macOS has no official GPU support; the `tensorflow-metal` plugin was last released in January 2025 and is not confirmed to work with TF 2.21.

## Examples

### Example 1: "Train an MNIST classifier and keep the best checkpoint"

Load `keras.datasets.mnist`, flatten and scale to 0-1, build the `Sequential` model from the Keras section, and call `model.fit(..., validation_split=0.2, callbacks=[ModelCheckpoint("best_model.keras", save_best_only=True)])`. Result: `best_model.keras` appears after the first epoch and is overwritten only when `val_loss` improves; `keras.models.load_model("best_model.keras")` restores it.

### Example 2: "Serve the model over REST"

Run `model.export("models/churn_model/1")`, start the `tensorflow/serving` container with `MODEL_NAME=churn_model` as shown above, then POST `{"instances": [[...784 floats...]]}` to `http://localhost:8501/v1/models/churn_model:predict`. Result: JSON `{"predictions": [[0.01, 0.97, ...]]}` with one probability row per instance.

## Guidelines

Best practices and pitfalls:


1. **Keras first** — Use `keras.Sequential` or Functional API; drop to custom training loops only when needed
2. **tf.data for pipelines** — Use `tf.data.Dataset` for data loading; `.batch().prefetch(tf.data.AUTOTUNE)` for performance
3. **Mixed precision** — `keras.mixed_precision.set_global_policy("mixed_float16")` for 2x speedup on modern GPUs
4. **Transfer learning** — Start from pre-trained models (EfficientNet, ResNet, BERT); fine-tune top layers first
5. **Callbacks** — EarlyStopping prevents overfitting, ReduceLROnPlateau adapts learning rate, ModelCheckpoint saves best model
6. **@tf.function** — Decorate custom training steps; TF compiles the graph for 2-5x speedup
7. **TFLite for edge** — Convert and quantize for mobile deployment; INT8 quantization reduces size 4x
8. **TensorBoard** — `keras.callbacks.TensorBoard(log_dir)` for training visualization; `tensorboard --logdir logs` (fails with `TBNotInstalledError` unless `pip install tensorboard` was run)
