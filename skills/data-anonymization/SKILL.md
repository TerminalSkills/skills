---
name: data-anonymization
description: >-
  Anonymize datasets for analytics and ML while preserving utility — k-anonymity, l-diversity,
  and differential privacy. Use when sharing data with third parties, building analytics on user
  data, or achieving GDPR Article 4 anonymization (data no longer considered personal).
license: Apache-2.0
compatibility: "Python 3.9+. Libraries: pandas, pycanon, diffprivlib, numpy."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: compliance
  tags: ["anonymization", "privacy", "gdpr", "data-science", "differential-privacy"]
  use-cases:
    - "Anonymize a user dataset to share with a research partner"
    - "Apply differential privacy before publishing analytics"
    - "Achieve k-anonymity on a healthcare dataset"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Data Anonymization

## Overview

Anonymized data is not "personal data" under GDPR (Article 4(1)) and therefore falls outside GDPR's scope — enabling broader data sharing, analytics, and ML without consent requirements. However, anonymization must be irreversible and withstand re-identification attacks.

**Critical distinction (GDPR):**
- **Anonymization**: Irreversible — data can never be linked to an individual. Falls outside GDPR.
- **Pseudonymization**: Reversible — data can be re-linked with additional info. Still personal data under GDPR.

## Anonymization Techniques

| Technique | Description | Privacy Level | Utility Loss |
|-----------|-------------|---------------|--------------|
| **Generalization** | Replace specific values with ranges (age 34 → 30-40) | Medium | Low |
| **Suppression** | Remove records or fields that are too unique | Medium | Medium |
| **Noise addition** | Add random noise to numeric values | High | Low |
| **Data swapping** | Swap attribute values between records | Medium | Low |
| **Aggregation** | Group records and report statistics | High | High |
| **k-Anonymity** | Each record indistinguishable from k-1 others | Medium | Medium |
| **Differential Privacy** | Mathematical guarantee with privacy budget ε | Very High | Variable |

## k-Anonymity

Every record must be indistinguishable from at least k-1 other records on quasi-identifiers (attributes that could help identify individuals: age, ZIP, gender, etc.).

```python
import pandas as pd
import numpy as np

def generalize_age(age: int, bucket_size: int = 10) -> str:
    """Generalize age to decade bucket."""
    lower = (age // bucket_size) * bucket_size
    return f"{lower}-{lower + bucket_size - 1}"

def generalize_zip(zip_code: str, precision: int = 3) -> str:
    """Generalize ZIP to first N digits."""
    return zip_code[:precision] + '*' * (len(zip_code) - precision)

def apply_k_anonymity(df: pd.DataFrame, quasi_identifiers: list, k: int = 5) -> pd.DataFrame:
    """
    Apply k-anonymity by generalizing quasi-identifiers and suppressing 
    groups smaller than k.
    
    Args:
        df: Input dataframe with sensitive data
        quasi_identifiers: List of column names that are quasi-identifiers
        k: Minimum group size
    
    Returns:
        k-anonymized dataframe
    """
    result = df.copy()
    
    # Generalize quasi-identifiers
    if 'age' in quasi_identifiers:
        result['age'] = result['age'].apply(lambda x: generalize_age(x, 10))
    if 'zip_code' in quasi_identifiers:
        result['zip_code'] = result['zip_code'].apply(lambda x: generalize_zip(x, 3))
    if 'gender' in quasi_identifiers:
        pass  # Gender is already categorical — keep as-is for k-anonymity
    
    # Count group sizes
    group_sizes = result.groupby(quasi_identifiers).size().reset_index(name='count')
    result = result.merge(group_sizes, on=quasi_identifiers)
    
    # Suppress groups smaller than k
    before_count = len(result)
    result = result[result['count'] >= k].drop('count', axis=1)
    after_count = len(result)
    
    suppressed = before_count - after_count
    print(f"k-anonymity (k={k}): suppressed {suppressed}/{before_count} records ({suppressed/before_count*100:.1f}%)")
    
    return result

# Example usage
df = pd.DataFrame({
    'name': ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Hank'],
    'age': [34, 28, 45, 51, 33, 29, 46, 52],
    'zip_code': ['10001', '10002', '10001', '10003', '10001', '10002', '10001', '10003'],
    'gender': ['F', 'M', 'F', 'M', 'F', 'M', 'F', 'M'],
    'diagnosis': ['Diabetes', 'Hypertension', 'Diabetes', 'Asthma', 'Diabetes', 'Hypertension', 'Diabetes', 'Asthma']
})

# Remove direct identifiers first
df_anon = df.drop('name', axis=1)

# Apply k-anonymity with k=2
quasi_ids = ['age', 'zip_code', 'gender']
result = apply_k_anonymity(df_anon, quasi_ids, k=2)
print(result)
```

## l-Diversity

Extends k-anonymity by requiring each equivalence class to have at least l "well-represented" sensitive attribute values (preventing attribute disclosure attacks).

```python
def check_l_diversity(df: pd.DataFrame, quasi_identifiers: list, 
                       sensitive_attr: str, l: int = 2) -> bool:
    """Check if dataset satisfies l-diversity."""
    groups = df.groupby(quasi_identifiers)[sensitive_attr]
    
    for name, group in groups:
        unique_values = group.nunique()
        if unique_values < l:
            print(f"Group {name} has only {unique_values} unique '{sensitive_attr}' values (need {l})")
            return False
    
    print(f"Dataset satisfies {l}-diversity for '{sensitive_attr}'")
    return True

# Check if our anonymized dataset satisfies 2-diversity
check_l_diversity(result, quasi_ids, 'diagnosis', l=2)
```

## Differential Privacy

Differential privacy (DP) provides a mathematical guarantee: the output of an analysis reveals minimal information about any individual. Controlled by privacy budget **ε** (epsilon) — smaller ε = stronger privacy but less accurate results.

```python
# Using Google's diffprivlib (Python)
import diffprivlib as dp
import numpy as np

# Generate sample data
np.random.seed(42)
ages = np.random.randint(18, 80, size=1000)
salaries = np.random.normal(65000, 20000, size=1000)

# DP mean — add Laplace noise calibrated to sensitivity / epsilon
epsilon = 1.0  # Privacy budget (lower = more private)

def dp_mean(values: np.ndarray, epsilon: float, sensitivity: float) -> float:
    """Compute differentially private mean using Laplace mechanism."""
    true_mean = np.mean(values)
    # Laplace noise scale = sensitivity / epsilon
    noise = np.random.laplace(0, sensitivity / epsilon)
    return true_mean + noise

def dp_count(values: np.ndarray, epsilon: float) -> int:
    """Compute differentially private count."""
    true_count = len(values)
    noise = np.random.laplace(0, 1.0 / epsilon)  # sensitivity = 1 for counting
    return max(0, int(true_count + noise))

# Using diffprivlib tools
dp_mean_age = dp.tools.mean(ages, epsilon=epsilon, bounds=(18, 80))
dp_std_salary = dp.tools.std(salaries, epsilon=epsilon, bounds=(0, 200000))

print(f"True mean age: {np.mean(ages):.1f} | DP mean age: {dp_mean_age:.1f}")
print(f"True std salary: {np.std(salaries):.0f} | DP std salary: {dp_std_salary:.0f}")

# DP histogram
def dp_histogram(values: np.ndarray, bins: list, epsilon: float) -> dict:
    """Compute differentially private histogram."""
    counts, edges = np.histogram(values, bins=bins)
    # Add Laplace noise to each bin count
    noisy_counts = counts + np.random.laplace(0, 1.0/epsilon, size=len(counts))
    noisy_counts = np.maximum(0, noisy_counts).astype(int)  # Clip to non-negative
    
    return {
        f"{int(edges[i])}-{int(edges[i+1])}": int(noisy_counts[i])
        for i in range(len(noisy_counts))
    }

age_histogram = dp_histogram(ages, bins=[18, 30, 40, 50, 60, 70, 80], epsilon=epsilon)
print(f"DP Age distribution: {age_histogram}")
```

## Privacy Budget Management

```python
class PrivacyBudget:
    """Track cumulative privacy budget consumption across queries."""
    
    def __init__(self, total_epsilon: float):
        self.total_epsilon = total_epsilon
        self.spent_epsilon = 0.0
        self.query_log = []
    
    def consume(self, epsilon: float, query_name: str) -> bool:
        """Consume epsilon from budget. Returns True if query is allowed."""
        if self.spent_epsilon + epsilon > self.total_epsilon:
            print(f"❌ Budget exhausted. Spent: {self.spent_epsilon}, Requested: {epsilon}, Total: {self.total_epsilon}")
            return False
        
        self.spent_epsilon += epsilon
        self.query_log.append({"query": query_name, "epsilon": epsilon, "cumulative": self.spent_epsilon})
        print(f"✅ {query_name}: ε={epsilon} (cumulative: {self.spent_epsilon:.2f}/{self.total_epsilon})")
        return True
    
    def remaining(self) -> float:
        return self.total_epsilon - self.spent_epsilon

# Usage
budget = PrivacyBudget(total_epsilon=5.0)

if budget.consume(1.0, "mean_age_query"):
    result = dp_mean(ages, epsilon=1.0, sensitivity=62)  # max-min range / n

if budget.consume(2.0, "histogram_salary"):
    hist = dp_histogram(salaries, bins=[0, 30000, 50000, 80000, 200000], epsilon=2.0)
```

## Tools Overview

| Tool | Language | Strengths |
|------|----------|-----------|
| **ARX** | Java (GUI + API) | Full k-anonymity, l-diversity, t-closeness |
| **pycanon** | Python | Check k-anonymity, l-diversity, t-closeness |
| **diffprivlib** | Python | IBM's DP library, sklearn compatible |
| **Google DP** | C++/Go/Java/Python | Production-ready, open source |
| **Apple DP** | Swift | Shuffling model DP |
| **OpenDP** | Python/Rust | Academic, expressive DP framework |

## GDPR Compliance Note

Per GDPR Article 4 and Recital 26, data is considered anonymous (and outside GDPR scope) when:
1. **Singling out**: Impossible to isolate one individual
2. **Linkability**: Impossible to link records relating to the same individual
3. **Inference**: Impossible to deduce information about an individual

k-anonymity alone is often **insufficient** for GDPR anonymization standard — combine with l-diversity and/or differential privacy, and conduct a re-identification risk assessment.

## Compliance Checklist

- [ ] Direct identifiers removed (name, email, SSN, etc.)
- [ ] Quasi-identifiers identified (age, ZIP, gender, etc.)
- [ ] k-anonymity applied (k ≥ 5 recommended)
- [ ] l-diversity verified for sensitive attributes
- [ ] Re-identification risk assessment documented
- [ ] Differential privacy applied for published statistics
- [ ] Privacy budget tracked and documented
- [ ] Data sharing agreement specifies anonymization standard
- [ ] Anonymization process documented and reproducible
