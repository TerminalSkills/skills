---
name: weaviate-advanced
description: AI-native vector database with hybrid search, GraphQL API, multi-tenancy, and advanced ML integrations for production AI applications
license: Apache-2.0
metadata:
  author: terminal-skills
  version: 1.0.0
  category: search
  tags:
    - weaviate
    - ai-native
    - vector-database
    - graphql
    - hybrid-search
    - multi-tenancy
    - machine-learning
---

# Weaviate Advanced - AI-Native Vector Database

Deploy and optimize Weaviate for production AI applications with advanced features including hybrid search, GraphQL API, multi-tenancy, and comprehensive ML model integrations.

## Instructions

### Step 1: Production Setup

```python
import weaviate

# Initialize client with authentication
client = weaviate.Client(
    url="http://localhost:8080",
    additional_headers={"X-OpenAI-Api-Key": "your-openai-key"}
)

# Create multi-modal schema
schema = {
    "class": "Document",
    "description": "Multi-modal documents with AI capabilities",
    "vectorizer": "text2vec-openai",
    "moduleConfig": {
        "text2vec-openai": {"model": "ada-002"},
        "generative-openai": {"model": "gpt-3.5-turbo"}
    },
    "multiTenancyConfig": {"enabled": True},
    "properties": [
        {
            "name": "title",
            "dataType": ["text"],
            "moduleConfig": {"text2vec-openai": {"skip": False}}
        },
        {
            "name": "content", 
            "dataType": ["text"],
            "moduleConfig": {"text2vec-openai": {"skip": False}}
        },
        {
            "name": "category",
            "dataType": ["string"],
            "moduleConfig": {"text2vec-openai": {"skip": True}}
        },
        {
            "name": "metadata",
            "dataType": ["object"],
            "nestedProperties": [
                {"name": "author", "dataType": ["text"]},
                {"name": "rating", "dataType": ["number"]}
            ]
        },
        {
            "name": "location",
            "dataType": ["geoCoordinates"]
        }
    ]
}

client.schema.create_class(schema)
```

### Step 2: Multi-Tenant Operations

```python
# Create tenant
client.schema.add_class_tenants(
    class_name="Document",
    tenants=[weaviate.Tenant(name="enterprise_tenant")]
)

# Batch insert with automatic vectorization
with client.batch as batch:
    batch.batch_size = 100
    
    documents = [
        {
            "class": "Document",
            "properties": {
                "title": "AI Vector Databases",
                "content": "Comprehensive guide to vector databases...",
                "category": "technology",
                "metadata": {"author": "AI Team", "rating": 4.8}
            },
            "tenant": "enterprise_tenant"
        }
    ]
    
    for doc in documents:
        batch.add_data_object(**doc)
```

### Step 3: Advanced Search with Generation

```python
# Hybrid search with text generation
class AdvancedWeaviateSearch:
    def __init__(self, client):
        self.client = client
    
    def hybrid_search_with_generation(self, class_name, query, tenant=None):
        query_builder = (
            self.client.query
            .get(class_name, ['title', 'content', 'category', 'metadata { author rating }'])
            .with_hybrid(query=query, alpha=0.7)
            .with_limit(10)
            .with_additional(['score', 'distance'])
        )
        
        if tenant:
            query_builder = query_builder.with_tenant(tenant)
        
        # Add generation
        query_builder = query_builder.with_generate(
            single_prompt="Summarize this document: {title} - {content}",
            grouped_task="Provide key insights from these documents"
        )
        
        result = query_builder.do()
        return self.process_results(result, class_name, query)
    
    def process_results(self, result, class_name, query):
        processed = {
            'query': query,
            'results': [],
            'generated_summary': None
        }
        
        if 'data' in result and 'Get' in result['data']:
            class_data = result['data']['Get'].get(class_name, [])
            
            for item in class_data:
                additional = item.get('_additional', {})
                processed_item = {
                    'properties': {k: v for k, v in item.items() if not k.startswith('_')},
                    'score': additional.get('score'),
                    'generated_text': additional.get('generate', {}).get('singleResult')
                }
                processed['results'].append(processed_item)
            
            # Extract grouped generation
            if class_data and '_additional' in class_data[0]:
                generate_data = class_data[0]['_additional'].get('generate', {})
                if 'groupedResult' in generate_data:
                    processed['generated_summary'] = generate_data['groupedResult']
        
        return processed

# Usage
search_engine = AdvancedWeaviateSearch(client)

results = search_engine.hybrid_search_with_generation(
    class_name="Document",
    query="vector database performance",
    tenant="enterprise_tenant"
)

print(f"Found {len(results['results'])} results")
if results['generated_summary']:
    print(f"Summary: {results['generated_summary']}")
```

## Guidelines

**Schema Design:**
- Design schemas with appropriate vectorization settings
- Use nested properties for complex metadata
- Plan multi-tenancy from the beginning
- Consider cross-references for knowledge graphs

**ML Integration:**
- Choose appropriate vectorization modules
- Configure model parameters for your use case
- Monitor API usage and costs
- Implement fallback strategies

**Production Deployment:**
- Implement proper backup strategies
- Monitor resource usage and performance
- Configure timeout and retry settings
- Plan for scaling based on growth patterns