---
name: chroma-advanced
description: Advanced ChromaDB for RAG systems, embeddings management, and semantic search with filtering and clustering
license: Apache-2.0
metadata:
  author: terminal-skills
  version: 1.0.0
  category: search
  tags:
    - chromadb
    - vector-database
    - embeddings
    - rag
    - semantic-search
    - python
    - machine-learning
---

# Advanced ChromaDB for RAG and Embeddings

Build sophisticated RAG (Retrieval-Augmented Generation) systems and semantic search applications with ChromaDB's advanced features including filtering, clustering, and multi-modal embeddings.

## Overview

ChromaDB is an AI-native open-source embedding database designed for building RAG applications. It provides efficient storage and retrieval of vector embeddings with rich metadata filtering, automated clustering, and seamless integration with popular AI frameworks.

Key features:
- **AI-native design**: Built specifically for LLM and embedding workflows
- **Multi-modal support**: Text, image, and custom embeddings
- **Advanced filtering**: Rich metadata queries with complex conditions
- **Automatic clustering**: Self-organizing collections for better performance
- **Multi-tenant**: Isolated collections and user management
- **Production ready**: Persistent storage, authentication, and horizontal scaling

## Instructions

### Step 1: Install and Setup ChromaDB

```bash
# Install ChromaDB
pip install chromadb

# For production deployment with authentication
pip install chromadb[server]

# Additional dependencies for advanced features
pip install chromadb[server] sentence-transformers openai tiktoken

# Start ChromaDB server (production)
chroma run --host 0.0.0.0 --port 8000 --path ./chroma_data
```

### Step 2: Initialize Client and Collections

```python
import chromadb
from chromadb.config import Settings
from chromadb.utils import embedding_functions
import uuid
from typing import List, Dict, Any, Optional
import numpy as np

class AdvancedChromaManager:
    def __init__(self, persist_directory: str = "./chroma_data", 
                 server_host: str = None, server_port: int = None,
                 api_key: str = None):
        
        if server_host and server_port:
            # Connect to remote ChromaDB server
            self.client = chromadb.HttpClient(
                host=server_host, 
                port=server_port,
                settings=Settings(
                    chroma_api_impl="chromadb.api.fastapi.FastAPI",
                    chroma_server_auth_credentials=api_key,
                    chroma_server_auth_provider="chromadb.auth.token.TokenAuthServerProvider"
                )
            )
        else:
            # Local persistent client
            self.client = chromadb.PersistentClient(
                path=persist_directory,
                settings=Settings(
                    anonymized_telemetry=False,
                    allow_reset=True
                )
            )
        
        # Initialize embedding functions
        self.sentence_transformer_ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )
        
        self.openai_ef = embedding_functions.OpenAIEmbeddingFunction(
            api_key=api_key,
            model_name="text-embedding-ada-002"
        ) if api_key else None
        
        # Multi-modal embedding function
        self.multimodal_ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="clip-ViT-B-32"
        )
        
    def create_document_collection(self, name: str, embedding_function: str = "sentence_transformer") -> chromadb.Collection:
        """Create a collection for document storage with advanced settings"""
        
        # Select embedding function
        ef_map = {
            "sentence_transformer": self.sentence_transformer_ef,
            "openai": self.openai_ef,
            "multimodal": self.multimodal_ef
        }
        
        ef = ef_map.get(embedding_function, self.sentence_transformer_ef)
        
        # Create collection with metadata schema
        collection = self.client.get_or_create_collection(
            name=name,
            embedding_function=ef,
            metadata={
                "hnsw:space": "cosine",
                "hnsw:construction_ef": 200,
                "hnsw:M": 16,
                "description": "Advanced document collection with rich metadata",
                "schema_version": "1.0",
                "created_by": "AdvancedChromaManager"
            }
        )
        
        return collection
    
    def add_documents_with_metadata(self, collection: chromadb.Collection,
                                   documents: List[str], 
                                   metadatas: List[Dict[str, Any]],
                                   ids: Optional[List[str]] = None) -> List[str]:
        """Add documents with rich metadata and auto-generate IDs if needed"""
        
        if ids is None:
            ids = [str(uuid.uuid4()) for _ in documents]
        
        # Enhance metadata with computed fields
        enhanced_metadatas = []
        for i, (doc, meta) in enumerate(zip(documents, metadatas)):
            enhanced_meta = meta.copy()
            
            # Add computed metadata
            enhanced_meta.update({
                "word_count": len(doc.split()),
                "char_count": len(doc),
                "doc_length_category": self._categorize_length(len(doc.split())),
                "has_questions": "?" in doc,
                "has_code": any(code_indicator in doc.lower() 
                              for code_indicator in ["def ", "function", "class ", "```", "import "]),
                "language": meta.get("language", "en"),
                "indexed_at": chromadb.utils.datetime_to_timestamp(),
                "doc_id": ids[i]
            })
            
            enhanced_metadatas.append(enhanced_meta)
        
        # Add to collection in batches for better performance
        batch_size = 100
        added_ids = []
        
        for i in range(0, len(documents), batch_size):
            batch_docs = documents[i:i + batch_size]
            batch_metas = enhanced_metadatas[i:i + batch_size]
            batch_ids = ids[i:i + batch_size]
            
            collection.add(
                documents=batch_docs,
                metadatas=batch_metas,
                ids=batch_ids
            )
            
            added_ids.extend(batch_ids)
        
        return added_ids
    
    def _categorize_length(self, word_count: int) -> str:
        """Categorize document length for filtering"""
        if word_count < 50:
            return "short"
        elif word_count < 200:
            return "medium"
        elif word_count < 500:
            return "long"
        else:
            return "very_long"

# Initialize manager
chroma_manager = AdvancedChromaManager(
    persist_directory="./advanced_chroma_data",
    api_key="your-openai-api-key"  # Optional for OpenAI embeddings
)

# Create specialized collections
docs_collection = chroma_manager.create_document_collection("knowledge_base", "sentence_transformer")
code_collection = chroma_manager.create_document_collection("code_snippets", "openai")
```

### Step 3: Advanced Document Ingestion and Processing

```python
import os
import json
from pathlib import Path
import pandas as pd
from typing import Iterator

class DocumentProcessor:
    def __init__(self, chroma_manager: AdvancedChromaManager):
        self.chroma_manager = chroma_manager
    
    def process_markdown_files(self, directory: str, collection_name: str) -> int:
        """Process markdown files with section splitting"""
        
        collection = self.chroma_manager.create_document_collection(collection_name)
        
        documents = []
        metadatas = []
        
        for md_file in Path(directory).glob("**/*.md"):
            content = md_file.read_text(encoding='utf-8')
            
            # Split by headers for better chunking
            sections = self._split_markdown_by_headers(content)
            
            for section_title, section_content in sections:
                if len(section_content.strip()) < 50:  # Skip very short sections
                    continue
                
                documents.append(section_content)
                metadatas.append({
                    "source_file": str(md_file),
                    "file_name": md_file.name,
                    "section_title": section_title,
                    "file_type": "markdown",
                    "directory": str(md_file.parent),
                    "file_size": len(content),
                    "category": self._infer_category_from_path(str(md_file))
                })
        
        if documents:
            added_ids = self.chroma_manager.add_documents_with_metadata(
                collection, documents, metadatas
            )
            return len(added_ids)
        
        return 0
    
    def process_json_dataset(self, json_file: str, collection_name: str,
                            text_fields: List[str], metadata_fields: List[str]) -> int:
        """Process JSON dataset with flexible field mapping"""
        
        collection = self.chroma_manager.create_document_collection(collection_name)
        
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if not isinstance(data, list):
            data = [data]
        
        documents = []
        metadatas = []
        
        for item in data:
            # Combine specified text fields
            text_parts = []
            for field in text_fields:
                if field in item and item[field]:
                    text_parts.append(str(item[field]))
            
            if not text_parts:
                continue
            
            document_text = " ".join(text_parts)
            
            # Extract metadata fields
            metadata = {}
            for field in metadata_fields:
                if field in item:
                    metadata[field] = item[field]
            
            # Add source information
            metadata.update({
                "source_file": json_file,
                "data_type": "json",
                "record_id": item.get("id", str(len(documents)))
            })
            
            documents.append(document_text)
            metadatas.append(metadata)
        
        if documents:
            added_ids = self.chroma_manager.add_documents_with_metadata(
                collection, documents, metadatas
            )
            return len(added_ids)
        
        return 0
    
    def process_csv_dataset(self, csv_file: str, collection_name: str,
                           text_column: str, metadata_columns: List[str]) -> int:
        """Process CSV dataset efficiently"""
        
        collection = self.chroma_manager.create_document_collection(collection_name)
        
        df = pd.read_csv(csv_file)
        
        documents = []
        metadatas = []
        
        for _, row in df.iterrows():
            if pd.isna(row[text_column]) or not str(row[text_column]).strip():
                continue
            
            document_text = str(row[text_column])
            
            metadata = {
                "source_file": csv_file,
                "data_type": "csv",
                "row_index": row.name
            }
            
            # Add specified metadata columns
            for col in metadata_columns:
                if col in row.index and not pd.isna(row[col]):
                    metadata[col] = row[col]
            
            documents.append(document_text)
            metadatas.append(metadata)
        
        if documents:
            added_ids = self.chroma_manager.add_documents_with_metadata(
                collection, documents, metadatas
            )
            return len(added_ids)
        
        return 0
    
    def _split_markdown_by_headers(self, content: str) -> List[tuple]:
        """Split markdown content by headers"""
        lines = content.split('\n')
        sections = []
        current_section = []
        current_title = "Introduction"
        
        for line in lines:
            if line.startswith('#'):
                # Save previous section
                if current_section:
                    sections.append((current_title, '\n'.join(current_section)))
                
                # Start new section
                current_title = line.strip('# ').strip()
                current_section = [line]
            else:
                current_section.append(line)
        
        # Add last section
        if current_section:
            sections.append((current_title, '\n'.join(current_section)))
        
        return sections
    
    def _infer_category_from_path(self, file_path: str) -> str:
        """Infer category from file path"""
        path_lower = file_path.lower()
        
        if 'api' in path_lower or 'endpoint' in path_lower:
            return 'api'
        elif 'tutorial' in path_lower or 'guide' in path_lower:
            return 'tutorial'
        elif 'reference' in path_lower or 'docs' in path_lower:
            return 'reference'
        elif 'example' in path_lower or 'sample' in path_lower:
            return 'example'
        else:
            return 'general'

# Usage
processor = DocumentProcessor(chroma_manager)

# Process documentation
docs_added = processor.process_markdown_files("./docs", "documentation")
print(f"Added {docs_added} document sections")

# Process JSON dataset
json_added = processor.process_json_dataset(
    "dataset.json",
    "qa_pairs",
    text_fields=["question", "answer"],
    metadata_fields=["category", "difficulty", "topic"]
)
```

### Step 4: Advanced Search and Retrieval

```python
class AdvancedRetrieval:
    def __init__(self, chroma_manager: AdvancedChromaManager):
        self.chroma_manager = chroma_manager
    
    def semantic_search(self, collection_name: str, query: str,
                       n_results: int = 10, where: Dict[str, Any] = None,
                       where_document: Dict[str, Any] = None) -> Dict[str, Any]:
        """Advanced semantic search with filtering"""
        
        collection = self.chroma_manager.client.get_collection(collection_name)
        
        results = collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where,
            where_document=where_document,
            include=["documents", "metadatas", "distances", "embeddings"]
        )
        
        # Enhance results with additional information
        enhanced_results = []
        
        for i, (doc, metadata, distance) in enumerate(zip(
            results["documents"][0],
            results["metadatas"][0], 
            results["distances"][0]
        )):
            similarity_score = 1 - distance  # Convert distance to similarity
            
            enhanced_results.append({
                "rank": i + 1,
                "document": doc,
                "metadata": metadata,
                "similarity_score": similarity_score,
                "distance": distance,
                "relevance_category": self._categorize_relevance(similarity_score),
                "snippet": self._extract_snippet(doc, query, max_length=200)
            })
        
        return {
            "query": query,
            "total_results": len(enhanced_results),
            "results": enhanced_results,
            "collection_stats": self._get_collection_stats(collection)
        }
    
    def multi_query_search(self, collection_name: str, queries: List[str],
                          fusion_method: str = "reciprocal_rank",
                          n_results: int = 10) -> Dict[str, Any]:
        """Perform multiple queries and fuse results"""
        
        collection = self.chroma_manager.client.get_collection(collection_name)
        
        all_results = {}
        
        # Execute all queries
        for query in queries:
            results = collection.query(
                query_texts=[query],
                n_results=n_results * 2,  # Get more results for better fusion
                include=["documents", "metadatas", "distances"]
            )
            all_results[query] = results
        
        # Fuse results using reciprocal rank fusion
        if fusion_method == "reciprocal_rank":
            fused_results = self._reciprocal_rank_fusion(all_results, n_results)
        else:
            fused_results = self._simple_score_fusion(all_results, n_results)
        
        return {
            "queries": queries,
            "fusion_method": fusion_method,
            "total_results": len(fused_results),
            "results": fused_results
        }
    
    def contextual_retrieval(self, collection_name: str, query: str,
                           context: str, n_results: int = 5) -> Dict[str, Any]:
        """Retrieve documents considering conversation context"""
        
        # Enhance query with context
        enhanced_query = f"Context: {context}\nQuery: {query}"
        
        # First pass: get initial results
        initial_results = self.semantic_search(
            collection_name, enhanced_query, n_results * 2
        )
        
        # Second pass: rerank based on context relevance
        reranked_results = []
        
        for result in initial_results["results"]:
            context_relevance = self._calculate_context_relevance(
                result["document"], context
            )
            
            # Combine semantic similarity with context relevance
            combined_score = (result["similarity_score"] * 0.7 + 
                            context_relevance * 0.3)
            
            result["context_relevance"] = context_relevance
            result["combined_score"] = combined_score
            reranked_results.append(result)
        
        # Sort by combined score and take top results
        reranked_results.sort(key=lambda x: x["combined_score"], reverse=True)
        
        return {
            "query": query,
            "context": context,
            "results": reranked_results[:n_results]
        }
    
    def filtered_search(self, collection_name: str, query: str,
                       filters: Dict[str, Any], n_results: int = 10) -> Dict[str, Any]:
        """Advanced filtering with multiple conditions"""
        
        collection = self.chroma_manager.client.get_collection(collection_name)
        
        # Build complex where clause
        where_clause = self._build_where_clause(filters)
        
        results = collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where_clause,
            include=["documents", "metadatas", "distances"]
        )
        
        # Process and enhance results
        enhanced_results = []
        for i, (doc, metadata, distance) in enumerate(zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0]
        )):
            enhanced_results.append({
                "rank": i + 1,
                "document": doc,
                "metadata": metadata,
                "similarity_score": 1 - distance,
                "matched_filters": self._check_filter_matches(metadata, filters)
            })
        
        return {
            "query": query,
            "filters": filters,
            "where_clause": where_clause,
            "results": enhanced_results
        }
    
    def _reciprocal_rank_fusion(self, all_results: Dict, n_results: int) -> List[Dict]:
        """Fuse results using reciprocal rank fusion"""
        
        doc_scores = {}
        
        for query, results in all_results.items():
            for rank, (doc, metadata, distance) in enumerate(zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0]
            )):
                doc_id = metadata.get("doc_id", doc[:50])  # Use doc_id or first 50 chars
                
                if doc_id not in doc_scores:
                    doc_scores[doc_id] = {
                        "document": doc,
                        "metadata": metadata,
                        "scores": [],
                        "queries": [],
                        "total_rrf_score": 0
                    }
                
                # Reciprocal rank fusion score: 1 / (rank + k), where k=60 is common
                rrf_score = 1 / (rank + 60)
                doc_scores[doc_id]["scores"].append(rrf_score)
                doc_scores[doc_id]["queries"].append(query)
                doc_scores[doc_id]["total_rrf_score"] += rrf_score
        
        # Sort by RRF score and return top results
        sorted_docs = sorted(
            doc_scores.values(),
            key=lambda x: x["total_rrf_score"],
            reverse=True
        )
        
        return sorted_docs[:n_results]
    
    def _simple_score_fusion(self, all_results: Dict, n_results: int) -> List[Dict]:
        """Simple score-based fusion"""
        
        doc_scores = {}
        
        for query, results in all_results.items():
            for doc, metadata, distance in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0]
            ):
                doc_id = metadata.get("doc_id", doc[:50])
                similarity = 1 - distance
                
                if doc_id not in doc_scores:
                    doc_scores[doc_id] = {
                        "document": doc,
                        "metadata": metadata,
                        "max_score": similarity,
                        "avg_score": similarity,
                        "query_count": 1
                    }
                else:
                    doc_scores[doc_id]["max_score"] = max(
                        doc_scores[doc_id]["max_score"], similarity
                    )
                    doc_scores[doc_id]["avg_score"] = (
                        (doc_scores[doc_id]["avg_score"] * doc_scores[doc_id]["query_count"] + similarity) /
                        (doc_scores[doc_id]["query_count"] + 1)
                    )
                    doc_scores[doc_id]["query_count"] += 1
        
        # Sort by max score
        sorted_docs = sorted(
            doc_scores.values(),
            key=lambda x: x["max_score"],
            reverse=True
        )
        
        return sorted_docs[:n_results]
    
    def _build_where_clause(self, filters: Dict[str, Any]) -> Dict[str, Any]:
        """Build complex where clause from filters"""
        
        where_conditions = {}
        
        for key, value in filters.items():
            if isinstance(value, dict):
                # Handle range queries, etc.
                where_conditions[key] = value
            elif isinstance(value, list):
                # Handle 'in' queries
                where_conditions[key] = {"$in": value}
            else:
                # Direct equality
                where_conditions[key] = {"$eq": value}
        
        return where_conditions
    
    def _categorize_relevance(self, score: float) -> str:
        """Categorize relevance score"""
        if score >= 0.8:
            return "highly_relevant"
        elif score >= 0.6:
            return "relevant"
        elif score >= 0.4:
            return "somewhat_relevant"
        else:
            return "low_relevance"
    
    def _extract_snippet(self, document: str, query: str, max_length: int = 200) -> str:
        """Extract relevant snippet from document"""
        
        words = document.split()
        query_words = set(query.lower().split())
        
        # Find best matching window
        best_window = words[:max_length // 5]  # Default to beginning
        best_score = 0
        
        window_size = max_length // 5
        
        for i in range(0, len(words) - window_size + 1, window_size // 2):
            window = words[i:i + window_size]
            window_text = " ".join(window).lower()
            
            score = sum(1 for word in query_words if word in window_text)
            
            if score > best_score:
                best_score = score
                best_window = window
        
        snippet = " ".join(best_window)
        if len(snippet) > max_length:
            snippet = snippet[:max_length] + "..."
        
        return snippet
    
    def _calculate_context_relevance(self, document: str, context: str) -> float:
        """Calculate how relevant document is to conversation context"""
        
        doc_words = set(document.lower().split())
        context_words = set(context.lower().split())
        
        if not context_words:
            return 0.0
        
        # Jaccard similarity
        intersection = doc_words.intersection(context_words)
        union = doc_words.union(context_words)
        
        return len(intersection) / len(union) if union else 0.0
    
    def _check_filter_matches(self, metadata: Dict, filters: Dict) -> List[str]:
        """Check which filters were matched"""
        
        matched = []
        
        for key, value in filters.items():
            if key in metadata:
                if isinstance(value, list) and metadata[key] in value:
                    matched.append(key)
                elif metadata[key] == value:
                    matched.append(key)
        
        return matched
    
    def _get_collection_stats(self, collection) -> Dict[str, Any]:
        """Get basic collection statistics"""
        
        try:
            count = collection.count()
            return {"document_count": count}
        except:
            return {"document_count": "unknown"}

# Usage examples
retrieval = AdvancedRetrieval(chroma_manager)

# Semantic search with filters
results = retrieval.filtered_search(
    "documentation",
    "how to install dependencies",
    filters={
        "category": ["tutorial", "guide"],
        "doc_length_category": ["medium", "long"],
        "has_code": True
    }
)

# Multi-query search
multi_results = retrieval.multi_query_search(
    "documentation",
    [
        "install dependencies",
        "setup environment", 
        "package installation"
    ],
    fusion_method="reciprocal_rank"
)

# Contextual retrieval
context_results = retrieval.contextual_retrieval(
    "documentation",
    "How do I fix this error?",
    context="I'm trying to install the package but getting permission errors on Linux"
)
```

### Step 5: RAG Implementation

```python
from typing import List, Dict, Any
import openai

class RAGSystem:
    def __init__(self, chroma_manager: AdvancedChromaManager, 
                 retrieval: AdvancedRetrieval,
                 openai_api_key: str = None,
                 model_name: str = "gpt-3.5-turbo"):
        
        self.chroma_manager = chroma_manager
        self.retrieval = retrieval
        self.model_name = model_name
        
        if openai_api_key:
            openai.api_key = openai_api_key
    
    def generate_response(self, question: str, collection_name: str,
                         context_history: List[str] = None,
                         n_context_docs: int = 5,
                         system_prompt: str = None) -> Dict[str, Any]:
        """Generate RAG response with retrieved context"""
        
        # Retrieve relevant documents
        if context_history:
            context = "\n".join(context_history[-3:])  # Use last 3 exchanges
            search_results = self.retrieval.contextual_retrieval(
                collection_name, question, context, n_context_docs
            )["results"]
        else:
            search_results = self.retrieval.semantic_search(
                collection_name, question, n_context_docs
            )["results"]
        
        # Build context from retrieved documents
        context_docs = []
        sources = []
        
        for i, result in enumerate(search_results):
            doc_snippet = result.get("snippet", result["document"][:500])
            context_docs.append(f"Document {i+1}: {doc_snippet}")
            
            sources.append({
                "rank": result["rank"],
                "source": result["metadata"].get("source_file", "unknown"),
                "similarity": result["similarity_score"],
                "title": result["metadata"].get("section_title", "")
            })
        
        context_text = "\n\n".join(context_docs)
        
        # Build prompt
        if not system_prompt:
            system_prompt = """You are a helpful AI assistant. Answer the user's question based on the provided context documents. 
            If the answer is not in the context, say so clearly. Always cite your sources by referring to the document numbers."""
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"""Context Documents:
{context_text}

Question: {question}

Please provide a comprehensive answer based on the context documents above."""}
        ]
        
        # Add conversation history
        if context_history:
            # Insert history before the current question
            for i, exchange in enumerate(context_history[-4:]):  # Last 4 exchanges
                role = "user" if i % 2 == 0 else "assistant"
                messages.insert(-1, {"role": role, "content": exchange})
        
        try:
            # Generate response using OpenAI
            response = openai.ChatCompletion.create(
                model=self.model_name,
                messages=messages,
                temperature=0.2,
                max_tokens=1000
            )
            
            generated_answer = response.choices[0].message.content
            
            return {
                "question": question,
                "answer": generated_answer,
                "sources": sources,
                "context_documents": len(search_results),
                "model_used": self.model_name,
                "retrieval_method": "contextual" if context_history else "semantic"
            }
            
        except Exception as e:
            return {
                "question": question,
                "answer": f"Sorry, I encountered an error generating a response: {str(e)}",
                "sources": sources,
                "error": str(e)
            }
    
    def batch_qa(self, questions: List[str], collection_name: str) -> List[Dict[str, Any]]:
        """Process multiple questions in batch"""
        
        results = []
        context_history = []
        
        for question in questions:
            response = self.generate_response(
                question, collection_name, context_history
            )
            results.append(response)
            
            # Update context history
            context_history.extend([question, response["answer"]])
        
        return results
    
    def evaluate_answer_quality(self, question: str, answer: str, 
                               ground_truth: str = None) -> Dict[str, Any]:
        """Evaluate the quality of generated answers"""
        
        # Basic metrics
        answer_length = len(answer.split())
        has_sources = "Document" in answer or "source" in answer.lower()
        
        metrics = {
            "answer_length": answer_length,
            "has_citations": has_sources,
            "contains_uncertainty": any(phrase in answer.lower() for phrase in 
                                     ["i don't know", "not sure", "unclear", "not in the context"])
        }
        
        # If ground truth is provided, calculate similarity
        if ground_truth:
            # Simple word overlap metric (you could use more sophisticated measures)
            answer_words = set(answer.lower().split())
            truth_words = set(ground_truth.lower().split())
            
            if truth_words:
                overlap = len(answer_words.intersection(truth_words)) / len(truth_words)
                metrics["ground_truth_overlap"] = overlap
        
        return metrics

# Usage
rag_system = RAGSystem(
    chroma_manager,
    retrieval,
    openai_api_key="your-openai-api-key"
)

# Single question
response = rag_system.generate_response(
    "How do I install ChromaDB with authentication?",
    "documentation"
)

print(f"Answer: {response['answer']}")
print(f"Sources: {len(response['sources'])}")

# Batch processing
questions = [
    "What is ChromaDB?",
    "How do I create a collection?", 
    "What embedding functions are available?"
]

batch_responses = rag_system.batch_qa(questions, "documentation")

for q, resp in zip(questions, batch_responses):
    print(f"Q: {q}")
    print(f"A: {resp['answer'][:200]}...")
    print("---")
```

### Step 6: Collection Management and Analytics

```python
class ChromaAnalytics:
    def __init__(self, chroma_manager: AdvancedChromaManager):
        self.chroma_manager = chroma_manager
        self.client = chroma_manager.client
    
    def get_collection_overview(self) -> Dict[str, Any]:
        """Get overview of all collections"""
        
        collections = self.client.list_collections()
        overview = []
        
        for collection in collections:
            coll_obj = self.client.get_collection(collection.name)
            count = coll_obj.count()
            
            # Get sample metadata to understand structure
            if count > 0:
                sample = coll_obj.get(limit=1, include=["metadatas"])
                sample_metadata = sample["metadatas"][0] if sample["metadatas"] else {}
                metadata_keys = list(sample_metadata.keys())
            else:
                metadata_keys = []
            
            overview.append({
                "name": collection.name,
                "document_count": count,
                "metadata_fields": metadata_keys,
                "collection_metadata": collection.metadata
            })
        
        return {
            "total_collections": len(overview),
            "collections": overview
        }
    
    def analyze_collection_metadata(self, collection_name: str) -> Dict[str, Any]:
        """Analyze metadata distribution in a collection"""
        
        collection = self.client.get_collection(collection_name)
        
        # Get all metadata (be careful with large collections)
        all_data = collection.get(include=["metadatas"])
        metadatas = all_data["metadatas"]
        
        if not metadatas:
            return {"error": "No metadata found"}
        
        # Analyze metadata fields
        field_analysis = {}
        
        for metadata in metadatas:
            for key, value in metadata.items():
                if key not in field_analysis:
                    field_analysis[key] = {
                        "count": 0,
                        "unique_values": set(),
                        "data_types": set(),
                        "null_count": 0
                    }
                
                field_analysis[key]["count"] += 1
                
                if value is None:
                    field_analysis[key]["null_count"] += 1
                else:
                    field_analysis[key]["unique_values"].add(str(value))
                    field_analysis[key]["data_types"].add(type(value).__name__)
        
        # Convert sets to lists for JSON serialization
        for field, stats in field_analysis.items():
            stats["unique_values"] = list(stats["unique_values"])[:10]  # Limit for display
            stats["data_types"] = list(stats["data_types"])
            stats["unique_count"] = len(stats["unique_values"])
        
        return {
            "collection": collection_name,
            "total_documents": len(metadatas),
            "field_analysis": field_analysis
        }
    
    def find_duplicate_documents(self, collection_name: str, 
                                similarity_threshold: float = 0.95) -> List[Dict]:
        """Find potentially duplicate documents in collection"""
        
        collection = self.client.get_collection(collection_name)
        
        # Get all documents with embeddings
        all_data = collection.get(include=["documents", "metadatas", "embeddings"])
        
        documents = all_data["documents"]
        metadatas = all_data["metadatas"]
        embeddings = all_data["embeddings"]
        
        if not embeddings or len(embeddings) < 2:
            return []
        
        duplicates = []
        processed_indices = set()
        
        # Compare each document with others
        for i in range(len(documents)):
            if i in processed_indices:
                continue
            
            current_embedding = np.array(embeddings[i])
            similar_docs = [{"index": i, "document": documents[i], "metadata": metadatas[i]}]
            
            for j in range(i + 1, len(documents)):
                if j in processed_indices:
                    continue
                
                other_embedding = np.array(embeddings[j])
                
                # Calculate cosine similarity
                similarity = np.dot(current_embedding, other_embedding) / (
                    np.linalg.norm(current_embedding) * np.linalg.norm(other_embedding)
                )
                
                if similarity >= similarity_threshold:
                    similar_docs.append({
                        "index": j,
                        "document": documents[j],
                        "metadata": metadatas[j],
                        "similarity": float(similarity)
                    })
                    processed_indices.add(j)
            
            if len(similar_docs) > 1:
                duplicates.append({
                    "group_size": len(similar_docs),
                    "documents": similar_docs
                })
                processed_indices.add(i)
        
        return duplicates
    
    def collection_health_check(self, collection_name: str) -> Dict[str, Any]:
        """Perform health check on collection"""
        
        collection = self.client.get_collection(collection_name)
        
        health_report = {
            "collection_name": collection_name,
            "status": "healthy",
            "issues": [],
            "recommendations": []
        }
        
        try:
            # Check document count
            doc_count = collection.count()
            health_report["document_count"] = doc_count
            
            if doc_count == 0:
                health_report["status"] = "empty"
                health_report["issues"].append("Collection is empty")
                return health_report
            
            # Sample documents for analysis
            sample_size = min(100, doc_count)
            sample_data = collection.get(
                limit=sample_size,
                include=["documents", "metadatas", "embeddings"]
            )
            
            documents = sample_data["documents"]
            metadatas = sample_data["metadatas"]
            embeddings = sample_data["embeddings"]
            
            # Check for missing embeddings
            missing_embeddings = sum(1 for emb in embeddings if emb is None)
            if missing_embeddings > 0:
                health_report["issues"].append(f"{missing_embeddings} documents missing embeddings")
                health_report["status"] = "warning"
            
            # Check for very short documents
            short_docs = sum(1 for doc in documents if len(doc.split()) < 10)
            if short_docs > sample_size * 0.2:  # More than 20% are very short
                health_report["issues"].append(f"High percentage ({short_docs/sample_size:.1%}) of very short documents")
                health_report["recommendations"].append("Consider filtering out very short documents")
            
            # Check for missing metadata
            empty_metadata = sum(1 for meta in metadatas if not meta or len(meta) == 0)
            if empty_metadata > sample_size * 0.5:  # More than 50% missing metadata
                health_report["issues"].append(f"High percentage ({empty_metadata/sample_size:.1%}) of documents without metadata")
                health_report["recommendations"].append("Add metadata to improve search filtering")
            
            # Check embedding dimension consistency
            if embeddings and embeddings[0]:
                first_dim = len(embeddings[0])
                inconsistent_dims = sum(1 for emb in embeddings if emb and len(emb) != first_dim)
                
                if inconsistent_dims > 0:
                    health_report["issues"].append(f"{inconsistent_dims} embeddings have inconsistent dimensions")
                    health_report["status"] = "error"
            
            health_report["sample_analyzed"] = sample_size
            
        except Exception as e:
            health_report["status"] = "error"
            health_report["issues"].append(f"Error during health check: {str(e)}")
        
        return health_report

# Usage
analytics = ChromaAnalytics(chroma_manager)

# Get collection overview
overview = analytics.get_collection_overview()
print(f"Total collections: {overview['total_collections']}")

# Analyze specific collection
metadata_analysis = analytics.analyze_collection_metadata("documentation")
print(f"Fields in collection: {list(metadata_analysis['field_analysis'].keys())}")

# Find duplicates
duplicates = analytics.find_duplicate_documents("documentation", 0.9)
print(f"Found {len(duplicates)} groups of similar documents")

# Health check
health = analytics.collection_health_check("documentation")
print(f"Collection status: {health['status']}")
if health['issues']:
    print(f"Issues: {health['issues']}")
```

### Step 7: Production Deployment and Security

```python
# Production ChromaDB server configuration
import chromadb
from chromadb.config import Settings
from chromadb.auth import BasicAuthProvider
import ssl

class ProductionChromaSetup:
    def __init__(self):
        pass
    
    @staticmethod
    def create_secure_client(host: str, port: int, 
                           username: str, password: str,
                           use_ssl: bool = True):
        """Create secure client for production ChromaDB"""
        
        settings = Settings(
            chroma_api_impl="chromadb.api.fastapi.FastAPI",
            chroma_server_host=host,
            chroma_server_http_port=port,
            chroma_server_ssl_enabled=use_ssl,
            chroma_server_auth_provider="chromadb.auth.basic.BasicAuthServerProvider",
            chroma_server_auth_credentials_provider="chromadb.auth.basic.BasicAuthCredentialsProvider",
        )
        
        if use_ssl:
            client = chromadb.HttpClient(
                host=host,
                port=port,
                ssl=True,
                headers={"Authorization": f"Basic {username}:{password}"},
                settings=settings
            )
        else:
            client = chromadb.HttpClient(
                host=host,
                port=port,
                headers={"Authorization": f"Basic {username}:{password}"},
                settings=settings
            )
        
        return client
    
    @staticmethod
    def setup_monitoring(client):
        """Set up basic monitoring for ChromaDB"""
        
        try:
            # Check server health
            collections = client.list_collections()
            
            monitoring_data = {
                "timestamp": chromadb.utils.datetime_to_timestamp(),
                "status": "healthy",
                "total_collections": len(collections),
                "collections": []
            }
            
            for collection in collections:
                coll_obj = client.get_collection(collection.name)
                doc_count = coll_obj.count()
                
                monitoring_data["collections"].append({
                    "name": collection.name,
                    "document_count": doc_count
                })
            
            return monitoring_data
            
        except Exception as e:
            return {
                "timestamp": chromadb.utils.datetime_to_timestamp(),
                "status": "error",
                "error": str(e)
            }
```

### Step 8: Backup and Migration

```python
import json
import os
from datetime import datetime

class ChromaBackupManager:
    def __init__(self, chroma_manager: AdvancedChromaManager):
        self.chroma_manager = chroma_manager
        self.client = chroma_manager.client
    
    def backup_collection(self, collection_name: str, backup_path: str) -> str:
        """Backup a collection to JSON file"""
        
        collection = self.client.get_collection(collection_name)
        
        # Get all data from collection
        all_data = collection.get(include=["documents", "metadatas", "embeddings"])
        
        backup_data = {
            "collection_name": collection_name,
            "collection_metadata": collection.metadata,
            "backup_timestamp": datetime.now().isoformat(),
            "document_count": len(all_data["documents"]),
            "documents": all_data["documents"],
            "metadatas": all_data["metadatas"],
            "embeddings": all_data["embeddings"]
        }
        
        # Create backup directory if it doesn't exist
        os.makedirs(os.path.dirname(backup_path), exist_ok=True)
        
        # Save to file
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, indent=2, ensure_ascii=False)
        
        return backup_path
    
    def restore_collection(self, backup_path: str, new_collection_name: str = None) -> str:
        """Restore collection from backup file"""
        
        with open(backup_path, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
        
        collection_name = new_collection_name or backup_data["collection_name"]
        
        # Create collection
        collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata=backup_data.get("collection_metadata", {})
        )
        
        # Restore documents in batches
        documents = backup_data["documents"]
        metadatas = backup_data["metadatas"]
        embeddings = backup_data["embeddings"]
        
        batch_size = 100
        
        for i in range(0, len(documents), batch_size):
            batch_docs = documents[i:i + batch_size]
            batch_metas = metadatas[i:i + batch_size]
            batch_embeddings = embeddings[i:i + batch_size]
            
            # Generate IDs for this batch
            batch_ids = [str(uuid.uuid4()) for _ in batch_docs]
            
            collection.add(
                documents=batch_docs,
                metadatas=batch_metas,
                embeddings=batch_embeddings,
                ids=batch_ids
            )
        
        return collection_name

# Usage
backup_manager = ChromaBackupManager(chroma_manager)

# Backup collection
backup_file = backup_manager.backup_collection(
    "documentation",
    "./backups/documentation_backup.json"
)
print(f"Backup saved to: {backup_file}")

# Restore collection
restored_collection = backup_manager.restore_collection(
    "./backups/documentation_backup.json",
    "documentation_restored"
)
print(f"Collection restored as: {restored_collection}")
```

## Guidelines

**Collection Design:**
- Use meaningful collection names that reflect content types
- Design metadata schemas consistently across related collections
- Consider using hierarchical collection structures for large datasets
- Plan for multi-tenancy with proper collection isolation

**Embedding Strategy:**
- Choose embedding models based on your specific domain and use case
- Use consistent embedding models within collections
- Consider embedding dimension vs performance trade-offs
- Test different models with your specific data for optimal results

**Query Optimization:**
- Use metadata filtering to reduce search space before vector similarity
- Implement query result caching for frequently asked questions
- Use appropriate similarity thresholds to balance precision and recall
- Consider hybrid retrieval combining multiple query strategies

**RAG Best Practices:**
- Chunk documents appropriately for your use case (150-500 words often works well)
- Use conversation context to improve retrieval relevance
- Implement source attribution and confidence scoring
- Test and iterate on prompt templates for optimal generation quality

**Production Considerations:**
- Implement proper authentication and authorization
- Set up monitoring and alerting for collection health
- Plan backup and disaster recovery strategies
- Consider scaling strategies for large document collections