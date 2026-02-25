---
title: Build an LLM-Powered Customer Support Bot
slug: build-llm-powered-support-bot
description: |
  Build a customer support chatbot using OpenAI for generation, LangChain for RAG orchestration,
  ChromaDB for the knowledge base, and Langfuse for monitoring and quality tracking.
skills:
  - openai-sdk
  - langchain
  - chromadb
  - langfuse
category: data-ai
tags:
  - chatbot
  - rag
  - customer-support
  - llm
  - observability
---

# Build an LLM-Powered Customer Support Bot

Maya is a platform engineer at a SaaS company with 500+ help articles and a support team drowning in repetitive tickets. She wants to build a chatbot that answers customer questions using the company's knowledge base, with full observability so the team can monitor answer quality and catch hallucinations early.

Her stack: OpenAI GPT-4 for generation, LangChain for the RAG pipeline, ChromaDB as the vector store, and Langfuse to trace every interaction.

## Step 1: Set Up the Knowledge Base with ChromaDB

Maya starts by ingesting the company's help articles into a vector database. She splits documents into chunks, generates embeddings, and stores them in ChromaDB.

```python
# ingest.py — Load help articles into ChromaDB for semantic search
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma

# Load all markdown help articles
loader = DirectoryLoader("./help_articles/", glob="**/*.md", loader_cls=TextLoader)
documents = loader.load()
print(f"Loaded {len(documents)} documents")

# Split into chunks for better retrieval
splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,
    chunk_overlap=100,
    separators=["\n## ", "\n### ", "\n\n", "\n", " "],
)
chunks = splitter.split_documents(documents)
print(f"Split into {len(chunks)} chunks")

# Create embeddings and store in ChromaDB
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./chroma_db",
    collection_name="help_articles",
)
print(f"Indexed {len(chunks)} chunks in ChromaDB")
```

## Step 2: Build the RAG Chain with LangChain

With the knowledge base ready, Maya builds a retrieval-augmented generation chain. The chain retrieves relevant documents, formats them into context, and sends everything to GPT-4.

```python
# rag_chain.py — LangChain RAG chain with retrieval, formatting, and generation
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# Load the vector store
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vectorstore = Chroma(
    persist_directory="./chroma_db",
    embedding_function=embeddings,
    collection_name="help_articles",
)
retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

# Define the prompt
prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a helpful customer support assistant for Acme SaaS.
Answer questions using ONLY the provided context. If the context doesn't contain
the answer, say "I don't have information about that — let me connect you with
a human agent." Be concise and friendly.

Context:
{context}"""),
    ("user", "{question}"),
])

# Build the chain
llm = ChatOpenAI(model="gpt-4", temperature=0.1)

def format_docs(docs):
    return "\n\n---\n\n".join(
        f"Source: {doc.metadata.get('source', 'unknown')}\n{doc.page_content}"
        for doc in docs
    )

chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)

# Test it
answer = chain.invoke("How do I reset my password?")
print(answer)
```

## Step 3: Add Langfuse Observability

Maya integrates Langfuse to trace every request — from retrieval to generation. This lets her team see which questions are being asked, what documents are retrieved, and how much each answer costs.

```python
# support_bot.py — Full support bot with Langfuse tracing and scoring
from langfuse.callback import CallbackHandler
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
vectorstore = Chroma(
    persist_directory="./chroma_db",
    embedding_function=embeddings,
    collection_name="help_articles",
)
retriever = vectorstore.as_retriever(search_kwargs={"k": 4})

prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a helpful customer support assistant for Acme SaaS.
Answer questions using ONLY the provided context. If the context doesn't contain
the answer, say "I don't have information about that — let me connect you with
a human agent." Be concise and friendly.

Context:
{context}"""),
    ("user", "{question}"),
])

llm = ChatOpenAI(model="gpt-4", temperature=0.1)

def format_docs(docs):
    return "\n\n---\n\n".join(
        f"Source: {doc.metadata.get('source', 'unknown')}\n{doc.page_content}"
        for doc in docs
    )

chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | prompt
    | llm
    | StrOutputParser()
)

def answer_question(question: str, user_id: str, session_id: str) -> str:
    """Answer a support question with full Langfuse tracing."""
    langfuse_handler = CallbackHandler(
        user_id=user_id,
        session_id=session_id,
        tags=["support-bot", "production"],
        metadata={"channel": "web-chat"},
    )

    answer = chain.invoke(question, config={"callbacks": [langfuse_handler]})
    return answer

# Usage
response = answer_question(
    question="How do I upgrade my plan?",
    user_id="customer-456",
    session_id="chat-789",
)
print(response)
```

## Step 4: Add Feedback Scoring

When customers rate answers with thumbs up/down, Maya sends that feedback to Langfuse to track quality over time.

```python
# feedback.py — Record customer feedback as Langfuse scores
from langfuse import Langfuse

langfuse = Langfuse()

def record_feedback(trace_id: str, helpful: bool, comment: str = ""):
    """Record customer feedback on a support answer."""
    langfuse.score(
        trace_id=trace_id,
        name="customer-feedback",
        value=1 if helpful else 0,
        comment=comment,
    )
    langfuse.flush()

# After a customer clicks thumbs up
record_feedback("trace-abc-123", helpful=True, comment="Solved my problem!")
```

## Step 5: Deploy as a FastAPI Service

```python
# api.py — FastAPI wrapper for the support bot with session management
from fastapi import FastAPI
from pydantic import BaseModel
import uuid

app = FastAPI(title="Support Bot API")

class ChatRequest(BaseModel):
    question: str
    user_id: str
    session_id: str | None = None

class ChatResponse(BaseModel):
    answer: str
    session_id: str
    trace_id: str

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())

    # answer_question from support_bot.py
    answer = answer_question(req.question, req.user_id, session_id)

    return ChatResponse(
        answer=answer,
        session_id=session_id,
        trace_id=session_id,  # Simplified — use actual Langfuse trace ID in production
    )
```

## What Maya Achieved

After a week in production, Maya's dashboard in Langfuse shows:
- **2,400 questions answered** automatically, deflecting 60% of support tickets
- **Average response time** of 1.8 seconds (vs. 4-hour human response)
- **87% positive feedback** from customers
- **$45/day** in OpenAI costs — cheaper than one support agent's hourly rate

The traces in Langfuse help her identify knowledge gaps: questions that consistently get "I don't have information" responses become candidates for new help articles.
