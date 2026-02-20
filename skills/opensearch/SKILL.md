---
name: opensearch
description: AWS OpenSearch for search, analytics, and observability with machine learning, security, and performance optimization
license: Apache-2.0
metadata:
  author: terminal-skills
  version: 1.0.0
  category: search
  tags:
    - opensearch
    - aws
    - search-engine
    - analytics
    - observability
    - machine-learning
    - security
---

# OpenSearch - AWS-Powered Search and Analytics

Deploy and optimize AWS OpenSearch for enterprise search, log analytics, and real-time observability with advanced security, machine learning, and performance features.

## Overview

AWS OpenSearch provides a fully managed search and analytics service built on the open-source OpenSearch project. It offers enterprise features like fine-grained access control, machine learning capabilities, and seamless AWS integration.

## Instructions

### Step 1: OpenSearch Domain Setup

```python
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth

# Create OpenSearch domain
opensearch_client = boto3.client('opensearch')

domain_config = {
    'DomainName': 'enterprise-search',
    'EngineVersion': 'OpenSearch_2.3',
    'ClusterConfig': {
        'InstanceType': 'm6g.large.search',
        'InstanceCount': 3,
        'DedicatedMasterEnabled': True
    },
    'EBSOptions': {
        'EBSEnabled': True,
        'VolumeType': 'gp3',
        'VolumeSize': 100
    },
    'EncryptionAtRestOptions': {'Enabled': True},
    'NodeToNodeEncryptionOptions': {'Enabled': True}
}

response = opensearch_client.create_domain(**domain_config)
```

### Step 2: Machine Learning Integration

```python
# Set up k-NN search with ML capabilities
index_mapping = {
    "settings": {
        "index.knn": True,
        "analysis": {
            "analyzer": {
                "default": {
                    "type": "standard",
                    "stopwords": "_english_"
                }
            }
        }
    },
    "mappings": {
        "properties": {
            "title": {"type": "text"},
            "content": {"type": "text"},
            "content_vector": {
                "type": "knn_vector",
                "dimension": 384,
                "method": {
                    "name": "hnsw",
                    "space_type": "cosinesimil",
                    "engine": "lucene"
                }
            }
        }
    }
}

# Create authenticated client
credentials = boto3.Session().get_credentials()
aws_auth = AWS4Auth(credentials.access_key, credentials.secret_key, 'us-east-1', 'es')

client = OpenSearch(
    hosts=[{'host': 'search-domain.us-east-1.es.amazonaws.com', 'port': 443}],
    http_auth=aws_auth,
    use_ssl=True,
    connection_class=RequestsHttpConnection
)

client.indices.create('documents', body=index_mapping)
```

### Step 3: Advanced Analytics

```python
# Anomaly detection setup
detector_config = {
    "name": "search_anomalies",
    "description": "Detect anomalies in search patterns",
    "time_field": "timestamp",
    "indices": ["search_logs"],
    "feature_attributes": [
        {
            "feature_name": "search_count",
            "feature_enabled": True,
            "aggregation_query": {
                "search_count": {"value_count": {"field": "query"}}
            }
        }
    ]
}

# Create anomaly detector
client.transport.perform_request(
    "POST",
    "/_plugins/_anomaly_detection/detectors",
    body=detector_config
)
```

## Guidelines

**Production Deployment:**
- Enable Multi-AZ deployment for high availability
- Use dedicated master nodes for production workloads
- Implement proper IAM roles and policies
- Enable all encryption options

**Performance Optimization:**
- Monitor JVM memory pressure and CPU utilization
- Use appropriate shard sizes (20-40GB per shard)
- Optimize queries based on access patterns
- Implement proper data lifecycle policies