---
name: gcp-firestore
description: |
  Build real-time applications with Google Cloud Firestore. Model data with
  collections and documents, execute queries with composite indexes, set up
  real-time listeners for live updates, enable offline persistence, and write
  security rules for client-side access control.
license: Apache-2.0
compatibility:
  - gcloud-cli
  - firebase-cli
  - python
  - nodejs
metadata:
  author: terminal-skills
  version: 1.0.0
  category: cloud-services
  tags:
    - gcp
    - firestore
    - nosql
    - real-time
    - firebase
---

# GCP Firestore

Cloud Firestore is a flexible, scalable NoSQL document database. It supports real-time synchronization, offline access, and scales automatically. Available in Native mode (real-time + offline) and Datastore mode (server-only, higher throughput).

## Core Concepts

- **Document** — a record containing fields (like a JSON object), identified by ID
- **Collection** — a group of documents
- **Subcollection** — a collection nested under a document
- **Reference** — a pointer to a document or collection location
- **Real-time listener** — streams live changes to documents or queries
- **Security Rules** — declarative access control for client SDKs

## CRUD Operations

```python
# Initialize and write documents
from google.cloud import firestore

db = firestore.Client()

# Create or overwrite a document
db.collection('users').document('user-001').set({
    'name': 'Alice Johnson',
    'email': 'alice@example.com',
    'role': 'admin',
    'created_at': firestore.SERVER_TIMESTAMP
})

# Add a document with auto-generated ID
ref = db.collection('orders').add({
    'user_id': 'user-001',
    'items': [
        {'name': 'Widget', 'qty': 2, 'price': 29.99},
        {'name': 'Gadget', 'qty': 1, 'price': 49.99}
    ],
    'total': 109.97,
    'status': 'pending',
    'created_at': firestore.SERVER_TIMESTAMP
})
print(f"Created order: {ref[1].id}")
```

```python
# Read a document
doc = db.collection('users').document('user-001').get()
if doc.exists:
    print(f"User: {doc.to_dict()}")
```

```python
# Update specific fields (merge)
db.collection('users').document('user-001').update({
    'role': 'superadmin',
    'updated_at': firestore.SERVER_TIMESTAMP
})

# Update nested fields
db.collection('users').document('user-001').update({
    'preferences.theme': 'dark',
    'preferences.notifications': True
})
```

```python
# Delete a document
db.collection('users').document('user-001').delete()

# Delete a specific field
db.collection('users').document('user-001').update({
    'temporary_field': firestore.DELETE_FIELD
})
```

## Queries

```python
# Simple queries
users_ref = db.collection('users')

# Filter by field
admins = users_ref.where('role', '==', 'admin').stream()

# Multiple conditions
recent_orders = db.collection('orders') \
    .where('status', '==', 'pending') \
    .where('total', '>=', 50) \
    .order_by('total', direction=firestore.Query.DESCENDING) \
    .limit(20) \
    .stream()

for order in recent_orders:
    print(f"{order.id}: ${order.to_dict()['total']}")
```

```python
# Pagination with cursors
first_page = db.collection('orders') \
    .order_by('created_at', direction=firestore.Query.DESCENDING) \
    .limit(25) \
    .get()

# Get next page starting after last document
last_doc = first_page[-1]
next_page = db.collection('orders') \
    .order_by('created_at', direction=firestore.Query.DESCENDING) \
    .start_after(last_doc) \
    .limit(25) \
    .get()
```

```python
# Array and IN queries
# Find users with a specific tag
db.collection('users').where('tags', 'array_contains', 'premium').stream()

# Find orders with specific statuses
db.collection('orders').where('status', 'in', ['pending', 'processing']).stream()
```

## Real-Time Listeners

```javascript
// real-time-listener.js — listen for live document changes
const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore();

// Listen to a single document
const unsubscribe = db.collection('orders').doc('order-001')
  .onSnapshot((doc) => {
    if (doc.exists) {
      console.log('Order updated:', doc.data());
    }
  });

// Listen to a query (all pending orders)
const queryUnsubscribe = db.collection('orders')
  .where('status', '==', 'pending')
  .onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        console.log('New order:', change.doc.data());
      } else if (change.type === 'modified') {
        console.log('Updated order:', change.doc.data());
      } else if (change.type === 'removed') {
        console.log('Removed order:', change.doc.id);
      }
    });
  });

// Stop listening
// unsubscribe();
```

## Batch Writes and Transactions

```python
# Batch write (up to 500 operations)
batch = db.batch()

for i in range(100):
    ref = db.collection('products').document(f'product-{i:04d}')
    batch.set(ref, {
        'name': f'Product {i}',
        'price': round(9.99 + i * 0.5, 2),
        'in_stock': True
    })

batch.commit()
print("Batch write complete")
```

```python
# Transaction for atomic read-modify-write
@firestore.transactional
def transfer_funds(transaction, from_ref, to_ref, amount):
    from_doc = from_ref.get(transaction=transaction)
    to_doc = to_ref.get(transaction=transaction)

    from_balance = from_doc.get('balance')
    if from_balance < amount:
        raise ValueError('Insufficient funds')

    transaction.update(from_ref, {'balance': from_balance - amount})
    transaction.update(to_ref, {'balance': to_doc.get('balance') + amount})

transaction = db.transaction()
transfer_funds(
    transaction,
    db.collection('accounts').document('alice'),
    db.collection('accounts').document('bob'),
    50.00
)
```

## Security Rules

```javascript
// firestore.rules — access control for client SDKs
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own profile
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }

    // Orders: owner can read, only server can write
    match /orders/{orderId} {
      allow read: if request.auth.uid == resource.data.user_id;
      allow create: if request.auth != null
        && request.resource.data.user_id == request.auth.uid
        && request.resource.data.total > 0;
      allow update, delete: if false; // server-side only
    }

    // Public read, admin write
    match /products/{productId} {
      allow read: if true;
      allow write: if request.auth.token.admin == true;
    }
  }
}
```

```bash
# Deploy security rules
firebase deploy --only firestore:rules
```

## Indexes

```json
// firestore.indexes.json — composite indexes for complex queries
{
  "indexes": [
    {
      "collectionGroup": "orders",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "status", "order": "ASCENDING"},
        {"fieldPath": "total", "order": "DESCENDING"}
      ]
    },
    {
      "collectionGroup": "orders",
      "queryScope": "COLLECTION",
      "fields": [
        {"fieldPath": "user_id", "order": "ASCENDING"},
        {"fieldPath": "created_at", "order": "DESCENDING"}
      ]
    }
  ]
}
```

```bash
# Deploy indexes
firebase deploy --only firestore:indexes
```

## Best Practices

- Design data around your queries — denormalize for read performance
- Use subcollections for large lists that are always accessed per parent
- Keep documents small (<1MB); use subcollections for unbounded lists
- Use transactions for operations that need atomicity across documents
- Create composite indexes for queries with multiple where/orderBy clauses
- Use security rules for all client-accessible data — never trust the client
- Use batch writes for bulk operations (up to 500 per batch)
- Enable offline persistence for mobile apps with poor connectivity
