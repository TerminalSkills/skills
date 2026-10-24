---
name: gcp-firestore
description: |
  Build real-time applications with Google Cloud Firestore. Model data with
  collections and documents, execute queries with composite indexes, set up
  real-time listeners for live updates, enable offline persistence, and write
  security rules for client-side access control.
license: Apache-2.0
compatibility: 'google-cloud-firestore (Python) 2.x, @google-cloud/firestore (Node), firebase-tools, gcloud CLI; a Google Cloud project with Firestore enabled'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/googleapis/python-firestore
  tags:
    - gcp
    - firestore
    - nosql
    - real-time
    - firebase
---

# GCP Firestore

## Overview

Cloud Firestore is a flexible, scalable NoSQL document database. It supports real-time synchronization, offline access, and scales automatically. Native mode (the default) has real-time listeners and offline client support; Datastore mode is server-only. Databases come in a Standard edition and an Enterprise edition (the latter also offers a MongoDB-compatible API).

## Instructions

### Core concepts

- **Document** — a record containing fields (like a JSON object), identified by ID
- **Collection** — a group of documents
- **Subcollection** — a collection nested under a document
- **Reference** — a pointer to a document or collection location
- **Real-time listener** — streams live changes to documents or queries
- **Security Rules** — declarative access control for client SDKs

### Create a database and install the client

```bash
gcloud firestore databases create --location=nam5 --type=firestore-native
pip install google-cloud-firestore          # Python
npm install @google-cloud/firestore         # Node.js server SDK
```

Server libraries authenticate with Application Default Credentials (`gcloud auth application-default login` locally, an attached service account in production) and bypass security rules. Browser and mobile apps use the Firebase SDK (`npm install firebase`, modular `firebase/firestore` API) and are governed by security rules.

### CRUD operations

```python
from google.cloud import firestore

db = firestore.Client()

db.collection('users').document('user-001').set({
    'name': 'Alice Johnson',
    'email': 'alice@northwind.dev',
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
print(f"Created order: {ref[1].id}")  # add() returns (update_time, ref)
```

```python
doc = db.collection('users').document('user-001').get()
print(doc.to_dict() if doc.exists else 'missing')
```

```python
db.collection('users').document('user-001').update({
    'role': 'superadmin',
    'updated_at': firestore.SERVER_TIMESTAMP
})

# Update nested fields with dotted paths
db.collection('users').document('user-001').update({'preferences.theme': 'dark'})
```

```python
# Delete a document, or just one field
db.collection('users').document('user-001').delete()
db.collection('users').document('user-001').update({
    'temporary_field': firestore.DELETE_FIELD
})
```

### Queries

```python
from google.cloud.firestore_v1.base_query import FieldFilter

# Use filter=FieldFilter(...); the positional where(field, op, value) form emits a UserWarning
users_ref = db.collection('users')
admins = users_ref.where(filter=FieldFilter('role', '==', 'admin')).stream()

# Multiple conditions (equality + range + order needs a composite index, see Indexes)
recent_orders = db.collection('orders') \
    .where(filter=FieldFilter('status', '==', 'pending')) \
    .where(filter=FieldFilter('total', '>=', 50)) \
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

last_doc = first_page[-1]
next_page = db.collection('orders') \
    .order_by('created_at', direction=firestore.Query.DESCENDING) \
    .start_after(last_doc) \
    .limit(25) \
    .get()
```

```python
# Array and IN queries
db.collection('users').where(filter=FieldFilter('tags', 'array_contains', 'premium')).stream()

db.collection('orders').where(filter=FieldFilter('status', 'in', ['pending', 'processing'])).stream()

# Count without reading documents
count = db.collection('orders').where(filter=FieldFilter('status', '==', 'pending')).count(alias='n').get()
print(count[0][0].value)
```

### Real-Time Listeners

```javascript
// real-time-listener.js — server-side listener (Node library)
const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore();

const unsubscribe = db.collection('orders').doc('order-001')
  .onSnapshot((doc) => {
    if (doc.exists) {
      console.log('Order updated:', doc.data());
    }
  });

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

In a web app use the modular Firebase SDK: `onSnapshot(query(collection(db, 'orders'), where('status', '==', 'pending')), snap => ...)`; `initializeFirestore(app, { localCache: persistentLocalCache() })` enables offline persistence.

### Batch Writes and Transactions

```python
# Batch write: atomic, no operation-count limit, request must stay under 10 MiB
batch = db.batch()

for i in range(3):
    ref = db.collection('products').document(f'product-{i:04d}')
    batch.set(ref, {
        'name': f'Product {i}',
        'price': round(9.99 + i * 0.5, 2),
        'in_stock': True
    })

batch.commit()
```
For large non-atomic loads use `db.bulk_writer()`.

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

### Security Rules

```javascript
// firestore.rules — access control for client SDKs
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    match /orders/{orderId} {
      allow read: if request.auth != null && request.auth.uid == resource.data.user_id;
      allow create: if request.auth != null
        && request.resource.data.user_id == request.auth.uid
        && request.resource.data.total > 0;
      allow update, delete: if false;
    }

    match /products/{productId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
  }
}
```

`request.auth.token.admin` is a custom claim you set yourself with the Admin SDK. Rules do not filter results: a query must be provably within what the rules allow, or it fails.

```bash
firebase deploy --only firestore:rules   # needs a "firestore" section in firebase.json
```

### Indexes

Composite indexes live in `firestore.indexes.json`:
```json
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
firebase deploy --only firestore:indexes
```

## Examples

**"Store orders and list a user's newest ones."** Write with `add()` as above, then query `where(filter=FieldFilter('user_id','==','user-001')).order_by('created_at', direction=firestore.Query.DESCENDING).limit(25)`. The first run fails with `FailedPrecondition: The query requires an index` and a console link; add the second index from `firestore.indexes.json` and deploy it.

**"Move money between two accounts safely."** Run `transfer_funds` inside a transaction: both reads happen first, then the updates; if another writer changes either balance the function is retried automatically (keep it free of side effects).

## Guidelines

- Design data around your queries and denormalize for reads
- Documents are limited to 1 MiB; use subcollections for unbounded lists or lists read per parent
- Secure all client-accessible data with rules; never trust the client
- Use `bulk_writer()` for bulk loads and batches for small atomic groups; no 500-write cap, but requests are limited to 10 MiB; transactions time out after 270 s
- Enable offline persistence for mobile and web apps with poor connectivity (client SDKs only)
