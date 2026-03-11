---
name: tensorflow
category: AI & Machine Learning
tags: [deep-learning, neural-network, ml, training, inference, keras, python]
version: 1.0.0
author: terminal-skills
---

# TensorFlow — Deep Learning Framework

You are an expert in TensorFlow, Google's open-source machine learning framework. You help developers build, train, and deploy neural networks using Keras (TensorFlow's high-level API), custom training loops, TensorFlow Serving for production inference, TFLite for mobile/edge deployment, and TensorFlow.js for browser ML — from prototyping to production-scale distributed training.

## Core Capabilities

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
@tf.function                              # JIT compile for performance
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
model.export("saved_model/")             # SavedModel format (TF Serving)

# TFLite for mobile
converter = tf.lite.TFLiteConverter.from_keras_model(model)
converter.optimizations = [tf.lite.Optimize.DEFAULT]  # Quantize
tflite_model = converter.convert()
with open("model.tflite", "wb") as f:
    f.write(tflite_model)

# TensorFlow Serving (Docker)
# docker run -p 8501:8501 --mount type=bind,source=/models,target=/models \
#   -e MODEL_NAME=my_model tensorflow/serving

# REST API inference
import requests
response = requests.post(
    "http://localhost:8501/v1/models/my_model:predict",
    json={"instances": x_test[:5].tolist()},
)
predictions = response.json()["predictions"]
```

## Installation

```bash
pip install tensorflow                     # CPU + GPU (auto-detects)
pip install tensorflow-metal              # macOS GPU (Apple Silicon)
# GPU requires CUDA 12.x + cuDNN 8.x
```

## Best Practices

1. **Keras first** — Use `keras.Sequential` or Functional API; drop to custom training loops only when needed
2. **tf.data for pipelines** — Use `tf.data.Dataset` for data loading; `.batch().prefetch(tf.data.AUTOTUNE)` for performance
3. **Mixed precision** — `keras.mixed_precision.set_global_policy("mixed_float16")` for 2x speedup on modern GPUs
4. **Transfer learning** — Start from pre-trained models (EfficientNet, ResNet, BERT); fine-tune top layers first
5. **Callbacks** — EarlyStopping prevents overfitting, ReduceLROnPlateau adapts learning rate, ModelCheckpoint saves best model
6. **@tf.function** — Decorate custom training steps; TF compiles the graph for 2-5x speedup
7. **TFLite for edge** — Convert and quantize for mobile deployment; INT8 quantization reduces size 4x
8. **TensorBoard** — `keras.callbacks.TensorBoard(log_dir)` for training visualization; `tensorboard --logdir logs`
