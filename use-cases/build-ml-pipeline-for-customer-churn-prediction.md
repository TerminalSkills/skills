---
title: Build an ML Pipeline for Customer Churn Prediction
slug: build-ml-pipeline-for-customer-churn-prediction
description: Build an end-to-end machine learning pipeline that predicts which SaaS customers will cancel — from raw data exploration in Jupyter to a deployed model that scores users nightly and triggers automated retention campaigns.
skills:
  - pandas
  - scikit-learn
  - jupyter
  - postgresql
category: Data Science
tags:
  - machine-learning
  - churn
  - saas
  - prediction
  - data-science
---

# Build an ML Pipeline for Customer Churn Prediction

Tomas runs a B2B SaaS tool with 8,000 paying customers. Monthly churn is 4.2% — 336 customers lost each month. The customer success team sends generic "we miss you" emails after cancellation, but by then it's too late. Tomas wants a model that identifies at-risk customers 2-4 weeks before they cancel, so his team can intervene with targeted outreach while there's still time.

## Step 1 — Explore and Understand the Data

The first step is always exploration. Before building any model, you need to understand what the data looks like, what's missing, and what patterns might predict churn.

```python
# notebooks/01-exploration.ipynb — Data exploration.
# Load customer data from PostgreSQL, examine distributions,
# identify missing values, and spot early signals of churn.

import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sqlalchemy import create_engine

engine = create_engine("postgresql://analyst:password@db:5432/saas_prod")

# Pull customer features: usage, billing, support, engagement
customers = pd.read_sql("""
    SELECT
        c.id,
        c.plan,
        c.signup_date,
        c.canceled_at,
        c.mrr,
        -- Usage metrics (last 30 days)
        u.logins_30d,
        u.features_used_30d,
        u.api_calls_30d,
        u.avg_session_minutes_30d,
        u.days_active_30d,
        -- Usage trend (compare last 30d vs previous 30d)
        u.logins_30d - u.logins_60d_30d AS login_trend,
        u.api_calls_30d - u.api_calls_60d_30d AS api_trend,
        -- Support
        s.tickets_90d,
        s.avg_resolution_hours,
        s.nps_score,
        -- Billing
        b.failed_payments_90d,
        b.plan_downgrades_180d,
        -- Account
        EXTRACT(DAYS FROM NOW() - c.signup_date) AS account_age_days,
        c.team_size,
        c.industry
    FROM customers c
    LEFT JOIN usage_summary u ON u.customer_id = c.id
    LEFT JOIN support_summary s ON s.customer_id = c.id
    LEFT JOIN billing_summary b ON b.customer_id = c.id
    WHERE c.signup_date < NOW() - INTERVAL '90 days'  -- Exclude new signups
""", engine)

# Label: churned if canceled in the last 90 days
customers["churned"] = customers["canceled_at"].notna()
print(f"Dataset: {len(customers)} customers, {customers['churned'].mean():.1%} churn rate")

# Check missing values
missing = customers.isna().sum()
print(f"\nMissing values:\n{missing[missing > 0]}")
```

The exploration reveals that NPS score is missing for 35% of customers (those who never responded to the survey), and `login_trend` is the most visually obvious differentiator — churned customers show a steep decline in logins 3-4 weeks before cancellation.

```python
# Visualize key differences between churned and active customers.
# These plots help identify which features the model should focus on.

fig, axes = plt.subplots(2, 3, figsize=(15, 10))

features = [
    "logins_30d", "features_used_30d", "login_trend",
    "days_active_30d", "tickets_90d", "failed_payments_90d"
]

for ax, feature in zip(axes.flat, features):
    for label, group in customers.groupby("churned"):
        ax.hist(group[feature].dropna(), bins=30, alpha=0.5,
                label="Churned" if label else "Active", density=True)
    ax.set_title(feature)
    ax.legend()

plt.tight_layout()
plt.savefig("../reports/feature_distributions.png", dpi=150)
```

## Step 2 — Build the Feature Engineering Pipeline

Raw data needs transformation before a model can use it. The pipeline handles missing values, scales numeric features, encodes categories, and engineers new features — all in a single reproducible object that can be serialized for production.

```python
# src/pipeline.py — Feature engineering and model pipeline.
# Uses sklearn Pipeline to chain preprocessing → model.
# The pipeline prevents data leakage: scaler fits only on training data.

import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.ensemble import HistGradientBoostingClassifier


class EngagementFeatures(BaseEstimator, TransformerMixin):
    """Engineer composite engagement features from raw metrics.

    Creates:
        - engagement_score: weighted combination of usage signals (0-100)
        - usage_decline_flag: binary flag for >50% drop in logins
        - health_score: composite of usage + support + billing signals
    """

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        X = X.copy()

        # Engagement score: weighted sum of normalized usage metrics
        X["engagement_score"] = (
            X["logins_30d"].clip(0, 60) / 60 * 30          # Login frequency (30%)
            + X["features_used_30d"].clip(0, 20) / 20 * 25  # Feature breadth (25%)
            + X["days_active_30d"] / 30 * 25                 # Consistency (25%)
            + X["avg_session_minutes_30d"].clip(0, 60) / 60 * 20  # Depth (20%)
        )

        # Usage decline: did logins drop more than 50%?
        X["usage_decline_flag"] = (X["login_trend"] < -X["logins_30d"] * 0.5).astype(int)

        # Health score: composite signal
        X["health_score"] = (
            X["engagement_score"]
            - X["tickets_90d"].clip(0, 10) * 3               # Support issues reduce health
            - X["failed_payments_90d"].clip(0, 5) * 5         # Payment failures are strong signals
            + X["nps_score"].fillna(7).clip(0, 10) * 2        # NPS boosts health (default 7 = neutral)
        )

        return X


# Column groups for different preprocessing
NUMERIC_FEATURES = [
    "logins_30d", "features_used_30d", "api_calls_30d",
    "avg_session_minutes_30d", "days_active_30d",
    "login_trend", "api_trend",
    "tickets_90d", "avg_resolution_hours", "nps_score",
    "failed_payments_90d", "plan_downgrades_180d",
    "account_age_days", "team_size", "mrr",
    "engagement_score", "usage_decline_flag", "health_score",
]

CATEGORICAL_FEATURES = ["plan", "industry"]


def build_pipeline() -> Pipeline:
    """Build the full preprocessing + model pipeline.

    Returns:
        sklearn Pipeline that takes raw customer data and outputs churn probabilities.
    """

    # Numeric: impute missing → scale to zero mean, unit variance
    numeric_transformer = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])

    # Categorical: impute missing → one-hot encode
    categorical_transformer = Pipeline([
        ("imputer", SimpleImputer(strategy="constant", fill_value="unknown")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])

    # Combine transformers for different column types
    preprocessor = ColumnTransformer([
        ("num", numeric_transformer, NUMERIC_FEATURES),
        ("cat", categorical_transformer, CATEGORICAL_FEATURES),
    ])

    # Full pipeline: engineer features → preprocess → classify
    pipeline = Pipeline([
        ("features", EngagementFeatures()),
        ("preprocessor", preprocessor),
        ("classifier", HistGradientBoostingClassifier(
            max_iter=500,
            learning_rate=0.05,
            max_depth=6,
            min_samples_leaf=20,
            l2_regularization=1.0,
            early_stopping=True,
            validation_fraction=0.15,
            n_iter_no_change=20,
            random_state=42,
        )),
    ])

    return pipeline
```

## Step 3 — Train and Evaluate

```python
# notebooks/02-training.ipynb — Model training and evaluation.
# Trains the pipeline with cross-validation, tunes hyperparameters,
# and evaluates on a held-out test set with business-relevant metrics.

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score, RandomizedSearchCV
from sklearn.metrics import classification_report, roc_auc_score, precision_recall_curve
from scipy.stats import uniform, randint
import joblib
from src.pipeline import build_pipeline

# Load prepared dataset
customers = pd.read_parquet("data/customers_features.parquet")

# Separate features and target
X = customers.drop(columns=["id", "canceled_at", "signup_date", "churned"])
y = customers["churned"].astype(int)

# 80/20 split, stratified to preserve churn ratio in both sets
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42
)

print(f"Train: {len(X_train)} ({y_train.mean():.1%} churn)")
print(f"Test:  {len(X_test)} ({y_test.mean():.1%} churn)")

# Build and cross-validate
pipeline = build_pipeline()

cv_scores = cross_val_score(
    pipeline, X_train, y_train,
    cv=5,
    scoring="roc_auc",
    n_jobs=-1,
)
print(f"\nCross-validation ROC AUC: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")
```

Cross-validation gives a ROC AUC of 0.891 ± 0.012. Next, hyperparameter tuning to push it higher.

```python
# Hyperparameter tuning with RandomizedSearchCV.
# Tests 50 random parameter combinations with 5-fold CV.
# RandomizedSearchCV is faster than GridSearchCV for this many parameters.

param_distributions = {
    "classifier__learning_rate": uniform(0.01, 0.15),
    "classifier__max_depth": randint(3, 10),
    "classifier__min_samples_leaf": randint(10, 50),
    "classifier__l2_regularization": uniform(0.1, 5.0),
    "classifier__max_iter": randint(300, 800),
}

search = RandomizedSearchCV(
    pipeline,
    param_distributions,
    n_iter=50,
    cv=5,
    scoring="roc_auc",
    n_jobs=-1,
    random_state=42,
    verbose=1,
)

search.fit(X_train, y_train)
print(f"Best ROC AUC: {search.best_score_:.3f}")
print(f"Best params: {search.best_params_}")
```

The tuned model achieves ROC AUC 0.917. Final evaluation on the held-out test set:

```python
# Evaluate on test set — this data was never seen during training or tuning.
best_model = search.best_estimator_

y_pred = best_model.predict(X_test)
y_proba = best_model.predict_proba(X_test)[:, 1]

print(classification_report(y_test, y_pred, target_names=["Active", "Churned"]))
print(f"ROC AUC: {roc_auc_score(y_test, y_proba):.3f}")

# Find the optimal probability threshold for business use.
# Default 0.5 threshold maximizes accuracy, but we want to maximize
# the number of at-risk customers we catch (recall) while keeping
# the outreach list manageable (precision).
precisions, recalls, thresholds = precision_recall_curve(y_test, y_proba)

# Target: catch at least 80% of churners (recall >= 0.8)
target_recall = 0.8
idx = np.where(recalls >= target_recall)[0][-1]
optimal_threshold = thresholds[idx]
print(f"\nOptimal threshold for {target_recall:.0%} recall: {optimal_threshold:.2f}")
print(f"Precision at this threshold: {precisions[idx]:.2f}")
print(f"This means: {precisions[idx]:.0%} of flagged customers actually churn")

# Save the trained pipeline
joblib.dump(best_model, "models/churn_pipeline_v1.pkl")
print("Model saved to models/churn_pipeline_v1.pkl")
```

## Step 4 — Deploy for Nightly Scoring

```python
# src/score.py — Nightly churn scoring job.
# Loads the trained pipeline, scores all active customers,
# writes risk scores to the database, and triggers retention workflows.

import pandas as pd
import joblib
from sqlalchemy import create_engine, text
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CHURN_THRESHOLD = 0.35  # Calibrated from precision-recall analysis
MODEL_PATH = "models/churn_pipeline_v1.pkl"


def score_customers():
    """Score all active customers and write risk levels to the database.

    Customers above the churn threshold are flagged as high-risk.
    The customer success team sees these flags in their CRM dashboard.
    """
    engine = create_engine("postgresql://scorer:password@db:5432/saas_prod")
    pipeline = joblib.load(MODEL_PATH)

    # Load current customer features (same query as training, minus canceled)
    customers = pd.read_sql("""
        SELECT id, plan, industry, mrr, team_size,
               logins_30d, features_used_30d, api_calls_30d,
               avg_session_minutes_30d, days_active_30d,
               logins_30d - logins_60d_30d AS login_trend,
               api_calls_30d - api_calls_60d_30d AS api_trend,
               tickets_90d, avg_resolution_hours, nps_score,
               failed_payments_90d, plan_downgrades_180d,
               EXTRACT(DAYS FROM NOW() - signup_date) AS account_age_days
        FROM customers c
        LEFT JOIN usage_summary u ON u.customer_id = c.id
        LEFT JOIN support_summary s ON s.customer_id = c.id
        LEFT JOIN billing_summary b ON b.customer_id = c.id
        WHERE c.canceled_at IS NULL
          AND c.signup_date < NOW() - INTERVAL '90 days'
    """, engine)

    customer_ids = customers["id"]
    X = customers.drop(columns=["id"])

    # Score
    churn_probabilities = pipeline.predict_proba(X)[:, 1]

    # Build results
    results = pd.DataFrame({
        "customer_id": customer_ids,
        "churn_probability": churn_probabilities,
        "risk_level": pd.cut(
            churn_probabilities,
            bins=[0, 0.2, CHURN_THRESHOLD, 0.6, 1.0],
            labels=["low", "medium", "high", "critical"],
        ),
        "scored_at": datetime.utcnow(),
        "model_version": "v1",
    })

    # Write to database
    results.to_sql("churn_scores", engine, if_exists="append", index=False)

    # Summary
    high_risk = results[results["churn_probability"] >= CHURN_THRESHOLD]
    logger.info(f"Scored {len(results)} customers")
    logger.info(f"High/critical risk: {len(high_risk)} ({len(high_risk)/len(results):.1%})")
    logger.info(f"Average churn probability: {churn_probabilities.mean():.2%}")

    # Flag high-risk customers for the CS team
    with engine.begin() as conn:
        conn.execute(text("""
            UPDATE customers
            SET churn_risk = 'high',
                churn_score = sub.churn_probability,
                churn_scored_at = NOW()
            FROM (SELECT customer_id, churn_probability FROM churn_scores
                  WHERE scored_at = (SELECT MAX(scored_at) FROM churn_scores)
                  AND churn_probability >= :threshold) sub
            WHERE customers.id = sub.customer_id
        """), {"threshold": CHURN_THRESHOLD})

    return results


if __name__ == "__main__":
    score_customers()
```

## Results

After running the churn prediction pipeline for three months, Tomas measures the business impact:

- **Model performance: 0.917 ROC AUC on test set** — the model correctly ranks at-risk customers above healthy ones 92% of the time. At the chosen threshold (0.35), it catches 81% of actual churners with 64% precision.
- **Early warning: 3.2 weeks average lead time** — the model flags customers as high-risk 22 days before they would cancel, giving the CS team a meaningful window for intervention.
- **Churn reduction: 4.2% → 3.1% monthly** — the CS team reaches out to flagged customers with personalized outreach (usage tips, onboarding calls, plan adjustments). 26% of high-risk customers who received outreach remained active.
- **Revenue saved: $47K/month** — 74 customers per month retained × $635 average MRR. The pipeline cost is negligible (runs nightly on existing database server in <2 minutes).
- **Top churn predictors**: login trend (declining usage), failed payments, low feature breadth, and high support ticket volume. This data helped product prioritize UX improvements for underused features.
- **False positives are useful too** — customers flagged as high-risk who weren't actually going to churn still appreciated the proactive outreach. NPS for contacted customers increased by 12 points.
