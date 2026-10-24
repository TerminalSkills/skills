---
name: scikit-learn
description: >-
  Assists with building, evaluating, and deploying machine learning models using scikit-learn.
  Use when performing data preprocessing, feature engineering, model selection, hyperparameter
  tuning, cross-validation, or building pipelines for classification, regression, and
  clustering tasks. Trigger words: sklearn, scikit-learn, machine learning, classification,
  regression, pipeline, cross-validation.
license: Apache-2.0
compatibility: "Requires Python 3.11+ and scikit-learn 1.9 (pip install scikit-learn)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/scikit-learn/scikit-learn
  category: data-ai
  tags: ["scikit-learn", "machine-learning", "classification", "regression", "pipeline"]
---

# scikit-learn

## Overview

Scikit-learn is a Python machine learning library that provides a consistent API for the full ML workflow: data preprocessing (scaling, encoding, imputation), model selection (classification, regression, clustering), hyperparameter tuning (grid search, randomized search), cross-validation, and pipeline construction. It supports serialization via joblib for production deployment.

## Instructions

- When preprocessing data, use `ColumnTransformer` to apply different transformers to numeric and categorical columns (StandardScaler, OneHotEncoder, SimpleImputer), always within a Pipeline to prevent data leakage.
- When choosing models, start with fast baselines (LogisticRegression, RandomForest) and use `HistGradientBoostingClassifier` for best tabular performance, since it handles missing values natively and is faster than GradientBoosting.
- When evaluating, use `cross_val_score` with 5-fold CV instead of single train/test splits, and use `classification_report()` instead of accuracy alone since accuracy is misleading on imbalanced datasets.
- When tuning hyperparameters, use `RandomizedSearchCV` when the search space exceeds 100 combinations (faster than exhaustive GridSearchCV), and use `StratifiedKFold` or `TimeSeriesSplit` as appropriate.
- When building pipelines, chain preprocessing and model steps with `Pipeline` to ensure transformers fit only on training data, then serialize the full pipeline with `joblib.dump()` for deployment.
- When selecting features, use `permutation_importance()` for model-agnostic measurement, `SelectKBest` for statistical filtering, or `feature_importances_` from tree-based models.

## Examples

### Example 1: Build a customer churn prediction pipeline

**User request:** "Create a model to predict which customers will churn"

The script below is self-contained (it generates stand-in customer data; replace the DataFrame with the real export) and was run on scikit-learn 1.9.1.

```python
import joblib
import numpy as np
import pandas as pd
from scipy.stats import randint
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import classification_report
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

rng = np.random.default_rng(42)
n = 2000
df = pd.DataFrame({
    "tenure_months": rng.integers(1, 72, n),
    "monthly_charge": rng.normal(70, 20, n).round(2),
    "plan": rng.choice(["basic", "plus", "pro"], n),
    "payment": rng.choice(["card", "invoice", "paypal"], n),
})
df.loc[rng.random(n) < 0.05, "monthly_charge"] = np.nan
risk = 0.04 * (df["monthly_charge"].fillna(70) - 70) - 0.05 * df["tenure_months"] + (df["plan"] == "basic") - 0.5
df["churned"] = rng.random(n) < 1 / (1 + np.exp(-risk))

X, y = df.drop(columns="churned"), df["churned"]
X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=y, random_state=42)

numeric = ["tenure_months", "monthly_charge"]
categorical = ["plan", "payment"]
prep = ColumnTransformer([
    ("num", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric),
    ("cat", OneHotEncoder(handle_unknown="ignore"), categorical),
])
pipe = Pipeline([("prep", prep), ("model", HistGradientBoostingClassifier(random_state=42))])

search = RandomizedSearchCV(
    pipe,
    {"model__learning_rate": [0.03, 0.05, 0.1], "model__max_leaf_nodes": randint(8, 64)},
    n_iter=10, cv=StratifiedKFold(5, shuffle=True, random_state=42), scoring="recall", random_state=42, n_jobs=-1,
)
search.fit(X_train, y_train)
print(search.best_params_)
print(classification_report(y_test, search.predict(X_test)))
joblib.dump(search.best_estimator_, "churn.joblib")
print(joblib.load("churn.joblib").predict_proba(X_test.head(2))[:, 1].round(2))
```

**Result:** it prints the best parameters, a `classification_report` for the held-out 25%, and the churn probability for two customers loaded back from `churn.joblib`. On the synthetic data churn recall is about 0.34, which is why the report, not accuracy, is the number to read. Raise `n_iter` and add real features before trusting a model.

### Example 2: Cluster customers into segments

**User request:** "Segment customers based on purchasing behavior"

```python
from sklearn.cluster import KMeans
from sklearn.datasets import make_blobs
from sklearn.metrics import silhouette_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

X, _ = make_blobs(n_samples=600, centers=4, n_features=3, random_state=7)  # stand-in for spend, frequency, recency
for k in range(2, 8):
    p = make_pipeline(StandardScaler(), KMeans(n_clusters=k, n_init="auto", random_state=7)).fit(X)
    print(k, round(silhouette_score(p[:-1].transform(X), p[-1].labels_), 3))
```

**Result:** one silhouette score per k (here 0.514, 0.699, 0.798, 0.668, 0.529, 0.390 for k = 2..7); pick the peak (k = 4), refit, add `labels_` to the original DataFrame and profile each segment with `groupby(...).mean()`. Use `PCA(n_components=2)` only for plotting.

### Example 3: Score new customers with the saved pipeline

**User request:** "Use the saved churn model on this week's signups."

```python
import joblib
import pandas as pd

model = joblib.load("churn.joblib")  # same scikit-learn version as the one that saved it
signups = pd.DataFrame({"tenure_months": [2, 40], "monthly_charge": [89.5, 55.0],
                        "plan": ["basic", "pro"], "payment": ["card", "invoice"]})
print(model.predict_proba(signups)[:, 1].round(2))
```

**Result:** one churn probability per row; the pipeline applies the imputer, scaler and encoder itself, so raw columns go in.

## Guidelines

- Always use `Pipeline` to prevent data leakage by fitting transformers only on training data.
- Use `ColumnTransformer` for mixed data types: numeric scaling and categorical encoding in one object.
- Use `HistGradientBoostingClassifier` over `GradientBoostingClassifier` since it is faster and handles missing values natively.
- Use `cross_val_score` with 5-fold CV rather than a single train/test split since single splits are noisy.
- Use `RandomizedSearchCV` when the search space exceeds 100 combinations.
- Use `classification_report()` not just accuracy, which is misleading on imbalanced datasets.
- Serialize the full pipeline with `joblib`, not just the model, since deployment needs preprocessing too.
- Load a `.joblib` file only if you created it or trust its source (it is pickle: loading can run code), and load it with the same scikit-learn version that saved it.
- Pass `random_state` to splitters and estimators for repeatable results, and pass `stratify=y` to `train_test_split` on imbalanced targets.
- Pick the search metric for the business goal (`scoring="recall"` or `"average_precision"`), the default is accuracy.
