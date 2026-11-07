---
title: "Build an Automated Customer Support Ticket Classifier with AI"
slug: build-customer-support-ticket-classifier
description: "Automatically classify, prioritize, and route incoming support tickets using AI-powered text analysis."
skills: [data-analysis, coding-agent, batch-processor]
category: automation
tags: [customer-support, classification, automation, tickets, routing]
---

# Build an Automated Customer Support Ticket Classifier with AI

## The Problem

Your support team receives 200 or more tickets a day. Each one has to be read, categorized (billing, bug, how-to, feature request, account access), given a priority and routed to the right team. A support lead spends the first hour of every morning triaging the overnight queue by hand. Misrouted tickets bounce between teams, and a ticket reporting data loss can sit in the general queue next to thirty "how do I reset my password?" questions until someone happens to read it.

The cost is not the triage time itself. It is the slow first response, and the urgent ticket that nobody flagged.

## The Solution

Using the **data-analysis**, **coding-agent** and **batch-processor** skills, the agent profiles your historical tickets, trains a text classifier on them, measures it on tickets it has never seen, and builds a routing script that sends confident predictions to the right queue and everything else to a human. The model suggests; people stay in the loop for low-confidence and urgent tickets.

## Step-by-Step Walkthrough

### Step 1: Profile the historical tickets

```text
Analyze tickets-export.csv (columns: id, subject, body, category, priority,
assigned_team). Show the category distribution, how many tickets have empty
bodies, the most common words per category, and which pairs of categories
get confused with each other in the labels.
```

Using data-analysis, the agent loads the CSV with pandas and reports the class balance, missing fields and duplicates. This step decides how far you can trust the labels. If the "category" column was filled in by hand over several years, expect inconsistent labels, and fix or drop them before training. Check that every category has at least a few hundred examples; rare categories (account access is often 5% of volume) need `class_weight="balanced"` or more data. Customer tickets contain names, emails and sometimes card fragments, so work on a copy, redact obvious personal data, and keep the file out of any third-party service.

### Step 2: Train a baseline and measure it on held-out tickets

```text
Build ticket_classifier.py: TF-IDF features with logistic regression on
subject + body. Hold out 20% of the tickets for evaluation and print
per-category precision and recall.
```

A hand-written keyword list is a fine first guess, but a TF-IDF model learns the words and phrases from your own data and gives a probability you can threshold. The agent writes this with scikit-learn:

```python
# ticket_classifier.py  (pip install pandas scikit-learn joblib)
import re
import sys

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline

MODEL_PATH = "ticket_model.joblib"
AUTO_ROUTE = 0.90   # at or above: route straight to the team queue
SUGGEST = 0.70      # between SUGGEST and AUTO_ROUTE: route with a "suggested" flag
# Hard rules for priority. A model score never lowers these.
URGENT = re.compile(r"production (is )?down|data loss|lost (all )?(my )?data|security|breach|all users", re.I)
TEAM = {"billing": "billing", "bug": "engineering-support", "how-to": "support",
        "feature-request": "product", "account-access": "support"}


def read_tickets(path):
    df = pd.read_csv(path)
    df["text"] = df["subject"].fillna("") + " " + df["body"].fillna("")
    return df


def train(path):
    df = read_tickets(path)
    # Hold out tickets the model never sees, so the numbers below are honest.
    x_tr, x_te, y_tr, y_te = train_test_split(
        df["text"], df["category"], test_size=0.2, stratify=df["category"], random_state=42)
    model = make_pipeline(
        TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True),
        LogisticRegression(max_iter=1000, class_weight="balanced"))
    model.fit(x_tr, y_tr)
    print(classification_report(y_te, model.predict(x_te)))
    joblib.dump(model, MODEL_PATH)


def classify(model, subject, body):
    text = f"{subject} {body}"
    probs = model.predict_proba([text])[0]
    best = probs.argmax()
    category, confidence = model.classes_[best], float(probs[best])
    urgent = bool(URGENT.search(text))
    route = "auto" if confidence >= AUTO_ROUTE else "suggested" if confidence >= SUGGEST else "manual-triage"
    return {"category": category, "confidence": round(confidence, 3),
            "priority": "urgent" if urgent else "normal",
            "team": TEAM.get(category, "support"),
            # An urgent ticket always reaches a human, whatever the confidence.
            "route": "manual-triage" if urgent else route}


def route(path):
    model = joblib.load(MODEL_PATH)  # only load model files you trained yourself
    df = read_tickets(path)
    out = pd.DataFrame([classify(model, s, b) for s, b in zip(df["subject"].fillna(""), df["body"].fillna(""))])
    out.insert(0, "id", df["id"])
    print(out.sort_values(["priority", "confidence"], ascending=[False, True]).to_string(index=False))


if __name__ == "__main__":
    {"train": train, "route": route}[sys.argv[1]](sys.argv[2])
```

Run `python ticket_classifier.py train tickets-export.csv`, then `python ticket_classifier.py route new-tickets.csv`. On a small synthetic file the script trains, prints the per-category report and routes a ticket reading "Production down, all users affected, data loss" to manual triage as urgent, with a billing ticket marked `suggested`. The scores on a toy file mean nothing, so run it on your own export and read the report: a category with high recall but low precision is stealing tickets from its neighbours, and the classic pair is bug versus how-to, where users describe expected behaviour as "broken".

### Step 3: Set the thresholds from the data

```text
Using the held-out predictions, for confidence cutoffs from 0.5 to 0.95 show
how many tickets would be auto-routed and what share of those were correct.
Pick the lowest cutoff where auto-routed tickets are at least 95% correct.
```

This is where data-analysis earns its place. The 0.90 and 0.70 values in the script are starting points, not facts. Plot coverage against accuracy on the held-out set and choose the cutoff your team can live with. The three tiers then mean what they say: above the auto-route cutoff the ticket goes straight to the team queue; in the middle band it is routed with a "suggested" flag so the agent confirms rather than re-reads; below it the ticket lands in manual triage. Priority comes from the hard rules, and an urgent match always goes to a person. Review a sample of auto-routed tickets every week, because wording drifts as the product changes, and retrain when accuracy on the sample drops.

### Step 4: Wire it up and backfill

```text
Add a small HTTP service that receives a ticket webhook, calls classify(), and
writes category, priority and team back to the helpdesk through its API. Then
classify the last year's exports in the exports/ folder.
```

Two jobs run in parallel. A coding-agent sub-agent builds and tests the webhook service (verify the helpdesk's webhook signature with an HMAC and a constant-time compare, bind to 127.0.0.1 behind your reverse proxy, and make the write-back idempotent on ticket id so a retried webhook does not duplicate work). Meanwhile batch-processor's pattern covers the backfill: process each export file with a fixed number of workers, record a result per file, and keep going when one file is malformed instead of aborting the run.

## Real-World Example

Lena manages support at a 20-person SaaS startup. Three agents handle about 150 tickets a day, and tickets sit in the general queue until someone reads and routes them. Urgent bugs get the same treatment as "how do I export a CSV?" questions.

She exports 18 months of categorized tickets and runs the profile. The labels turn out to be messy: "bug" and "how-to" were used interchangeably by two former agents, so she relabels a few hundred tickets before training. The held-out report shows billing and account-access tickets classified reliably and feature requests much less so, which matches her intuition, so she sets a high auto-route cutoff and leaves feature requests in the suggested band.

The script runs on each new ticket via webhook. Urgent phrases such as "production down" and "data loss" flag a ticket for a human immediately, whatever the model thinks. The billing specialist starts the day with a pre-sorted queue, and the morning triage shrinks from reading everything to reviewing the manual-triage list. Lena keeps measuring: every Friday she reads thirty auto-routed tickets, and she retrains when she finds more than a couple routed wrongly.

## Related Skills

- [data-analysis](../skills/data-analysis/SKILL.md) -- profile the ticket history and choose thresholds from held-out results
- [coding-agent](../skills/coding-agent/SKILL.md) -- delegate the webhook service to a background coding agent
- [batch-processor](../skills/batch-processor/SKILL.md) -- backfill historical exports with bounded concurrency and per-file error handling
