---
name: mongoose
description: >-
  Mongoose is an object modeling library (ODM) for MongoDB in Node.js: schemas
  declare fields, validation, and defaults, and models built from them run
  typed queries, middleware hooks, population, and transactions. Use when a
  user asks to define a Mongoose schema or model, validate MongoDB documents,
  add pre/post hooks, populate references, run a transaction, type models in
  TypeScript, or migrate code to Mongoose 9.
license: Apache-2.0
compatibility: "Mongoose 9: Node.js 20.19 or newer and MongoDB server 6.x-8.x; TypeScript type inference needs strict mode"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
    - mongodb
    - odm
    - schema
    - typescript
    - node
  repository: https://github.com/Automattic/mongoose
---

# Mongoose — MongoDB ODM for Node.js

## Overview

Mongoose is an object modeling library for MongoDB in Node.js. A schema declares fields, validation, defaults, hooks, methods, and virtuals; a model built from it casts and validates writes and returns typed documents. This skill targets Mongoose 9, which changed middleware (`next()` is gone), update options, and TypeScript types compared with 8.x.

## Instructions

### Installation

```bash
npm install mongoose    # 9.x; ships its own TypeScript types, no @types package
npm install bcrypt && npm install -D @types/bcrypt   # only for the password hashing in the schema example
```

```typescript
import mongoose from "mongoose";

// Build indexes automatically everywhere except production
mongoose.set("autoIndex", process.env.NODE_ENV !== "production");
// MONGODB_URI looks like mongodb://127.0.0.1:27017/storefront
await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 5000 });
```

### Schema Definition

Let Mongoose infer the document type from the schema, and declare virtuals, methods, and statics in the schema options so they are typed too. Do not write an interface that extends `Document`.

```typescript
import bcrypt from "bcrypt";
import mongoose, { Schema, model, type HydratedDocumentFromSchema } from "mongoose";

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true, // creates the index; a second schema.index({ email: 1 }) triggers a duplicate-index warning
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    name: { type: String, required: true, minlength: 2, maxlength: 100 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["user", "admin", "moderator"], default: "user" },
    profile: {
      bio: { type: String, maxlength: 500 },
      avatar: String,
      website: { type: String, match: /^https?:\/\// },
    },
    posts: [{ type: Schema.Types.ObjectId, ref: "Post" }],
  },
  {
    timestamps: true, // adds createdAt and updatedAt
    toJSON: { virtuals: true },
    virtuals: {
      displayName: {
        get() {
          return `${this.name} <${this.email}>`;
        },
      },
    },
    methods: {
      verifyPassword(password: string) {
        return bcrypt.compare(password, this.passwordHash);
      },
    },
    statics: {
      findByEmail(email: string) {
        return this.findOne({ email: email.toLowerCase() });
      },
    },
  },
);

// Index for search
userSchema.index({ name: "text", "profile.bio": "text" });

// Pre-save middleware: an async function with no next(); throw to abort the save
userSchema.pre("save", async function () {
  if (this.isModified("passwordHash")) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  }
});

export const User = model("User", userSchema);
export type UserDoc = HydratedDocumentFromSchema<typeof userSchema>;
```

### Queries

```typescript
// Find with filters, sorting, pagination
const users = await User.find({ role: "user" })
  .sort({ createdAt: -1 })
  .skip(20).limit(10)
  .select("name email profile.avatar")
  .lean();                                // Plain objects: no getters, virtuals, or save()

// select: false fields must be requested explicitly
const account = await User.findOne({ email: "alice@northwind.dev" }).select("+passwordHash").orFail();
const ok = await account.verifyPassword("correct horse battery");

// Update: validators run only when asked; returnDocument replaces the deprecated `new: true`
const promoted = await User.findOneAndUpdate(
  { email: "bruno@northwind.dev" },
  { $set: { role: "moderator" } },
  { returnDocument: "after", runValidators: true },
);

// Populate references
const userWithPosts = await User.findById(account._id)
  .populate({ path: "posts", select: "title createdAt", options: { limit: 5, sort: { createdAt: -1 } } });

// Aggregation pipeline (not cast or validated by the schema)
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const stats = await User.aggregate([
  { $match: { createdAt: { $gte: thirtyDaysAgo } } },
  { $group: { _id: "$role", count: { $sum: 1 }, latest: { $max: "$createdAt" } } },
  { $sort: { count: -1 } },
]);

// Transaction: commits when the function returns, aborts when it throws, retries transient errors.
// Pass the session to every operation and do not run them in parallel.
await mongoose.connection.transaction(async (session) => {
  const [post] = await Post.create([{ title: "Shipping rates for 2027", author: account._id }], { session });
  await User.updateOne({ _id: account._id }, { $push: { posts: post._id } }, { session });
});
```

## Examples

### Example 1: Model with a reference and a populated query

**User request:** "Add a Post model that belongs to a user, and a function that returns a user's five latest posts with the author's name."

```typescript
import { Schema, model, type Types } from "mongoose";

const postSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: String,
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: Date,
  },
  { timestamps: true },
);
postSchema.index({ author: 1, publishedAt: -1 }); // matches the filter + sort below

export const Post = model("Post", postSchema);

export function latestPosts(authorId: Types.ObjectId) {
  return Post.find({ author: authorId })
    .sort({ publishedAt: -1 })
    .limit(5)
    .select("title publishedAt author")
    .populate("author", "name")
    .lean();
}
```

**Result** of `console.log(JSON.stringify(await latestPosts(alice._id)))`:

```
[{"_id":"6abe2e23d40ba9d32d2bd4dd","title":"Shipping rates for 2027","author":{"_id":"6abe2e22d40ba9d32d2bd4db","name":"Alice Moreno"},"publishedAt":"2026-10-01T09:55:47.300Z"}]
```

### Example 2: Fix hooks and updates after upgrading to Mongoose 9

**User request:** "We upgraded to Mongoose 9 and saving a user now fails with `TypeError: next is not a function`. Fix it."

```bash
npm install mongoose@9
npm ls mongoose          # mongoose@9.10.3
```

```typescript
// Before (Mongoose 8) — pre hooks no longer receive next()
orderSchema.pre("save", function (next) {
  this.total = this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  next();
});
const paid = await Order.findOneAndUpdate({ _id: orderId }, { status: "paid" }, { new: true });

// After (Mongoose 9)
orderSchema.pre("save", async function () {
  this.total = this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
});
const paid = await Order.findOneAndUpdate({ _id: orderId }, { status: "paid" }, { returnDocument: "after" });
```

**Result:** `order.save()` resolves again and `total` is computed; the `[MONGOOSE] Warning: ... the new option ... is deprecated` line disappears from the logs. Other Mongoose 9 breaks to search the codebase for: update pipelines (an array passed to `updateOne()`) now throw unless `{ updatePipeline: true }` is set, the TypeScript type `FilterQuery` is renamed `QueryFilter`, and UUID fields come back as `bson.UUID` objects instead of strings.

## Guidelines

1. **Schema validation** — Define strict schemas; use `required`, `enum`, `match`, `min/max` validators. They run on `save()` and `create()`; update queries skip them unless `runValidators: true` is passed.
2. **Lean queries** — Use `.lean()` for read-only queries; it returns plain objects, which is faster and uses less memory, but drops virtuals, getters, and document methods.
3. **Indexes** — Add indexes for fields you query/sort by; use `explain()` to verify query plans. Index builds can load a production database, so set `autoIndex` to false there and create indexes deliberately.
4. **Population** — Use `populate()` sparingly; for complex joins, prefer aggregation `$lookup`.
5. **Middleware** — Use `pre('save')` for hashing, validation; `post('save')` for notifications, logging. Save hooks do not run for `updateOne()`, `findOneAndUpdate()`, or `insertMany()`; add query middleware (`pre("findOneAndUpdate")`, `pre("updateOne")`) or the `insertMany` model middleware for those.
6. **Timestamps** — Enable `timestamps: true`; auto-manages `createdAt` and `updatedAt`.
7. **Transactions** — Use sessions for multi-document operations; requires replica set or MongoDB Atlas. A standalone `mongod` rejects them.
8. **TypeScript** — Rely on schema inference with `strict: true` in `tsconfig.json`; use `HydratedDocumentFromSchema` and `InferSchemaType` for document and raw types instead of interfaces extending `Document`.
9. **Untrusted input** — Never pass a request body straight into a filter: `{ email: req.body.email }` lets a client send `{ "$ne": null }`. Cast to the expected type first or enable `mongoose.set("sanitizeFilter", true)`, which makes such a filter fail with a `CastError`. Keep the connection string in an environment variable.
10. **`select: false` only hides a field from query results** — a document you just created still carries it, so strip secrets before returning it from an API.
11. **When not to use Mongoose** — for bulk analytics pipelines or schemaless ingestion the MongoDB driver alone is lighter; Mongoose adds casting and hydration overhead on every document.
