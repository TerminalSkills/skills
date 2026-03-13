---
name: mongoose
description: >-
  You are an expert in Mongoose, the elegant MongoDB object modeling library
  for Node.js. You help developers define schemas with validation, build
  queries with a fluent API, use middleware hooks, populate references, create
  virtual fields, and handle transactions — providing structure and type
  safety on top of MongoDB's flexible document model.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - mongodb
    - odm
    - schema
    - validation
    - typescript
    - node
    - database
---

# Mongoose — MongoDB ODM for Node.js

You are an expert in Mongoose, the elegant MongoDB object modeling library for Node.js. You help developers define schemas with validation, build queries with a fluent API, use middleware hooks, populate references, create virtual fields, and handle transactions — providing structure and type safety on top of MongoDB's flexible document model.

## Core Capabilities

### Schema Definition

```typescript
import mongoose, { Schema, Document, Model } from "mongoose";

interface IUser extends Document {
  email: string;
  name: string;
  passwordHash: string;
  role: "user" | "admin" | "moderator";
  profile: { bio?: string; avatar?: string; website?: string };
  posts: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
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
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual field
userSchema.virtual("fullName").get(function () {
  return this.name;
});

// Index for search
userSchema.index({ email: 1 });
userSchema.index({ name: "text", "profile.bio": "text" });

// Pre-save middleware
userSchema.pre("save", async function (next) {
  if (this.isModified("passwordHash")) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  }
  next();
});

// Static method
userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

// Instance method
userSchema.methods.verifyPassword = async function (password: string) {
  return bcrypt.compare(password, this.passwordHash);
};

const User: Model<IUser> = mongoose.model("User", userSchema);
```

### Queries

```typescript
// Find with filters, sorting, pagination
const users = await User.find({ role: "user" })
  .sort({ createdAt: -1 })
  .skip(20).limit(10)
  .select("name email profile.avatar")
  .lean();                                // Plain objects (faster)

// Populate references
const userWithPosts = await User.findById(id)
  .populate({ path: "posts", select: "title createdAt", options: { limit: 5, sort: { createdAt: -1 } } });

// Aggregation pipeline
const stats = await User.aggregate([
  { $match: { createdAt: { $gte: thirtyDaysAgo } } },
  { $group: { _id: "$role", count: { $sum: 1 }, latest: { $max: "$createdAt" } } },
  { $sort: { count: -1 } },
]);

// Transactions
const session = await mongoose.startSession();
await session.withTransaction(async () => {
  const user = await User.create([{ name: "Alice", email: "alice@example.com", passwordHash: "..." }], { session });
  await Post.create([{ title: "First Post", author: user[0]._id }], { session });
});
```

## Installation

```bash
npm install mongoose
```

## Best Practices

1. **Schema validation** — Define strict schemas; use `required`, `enum`, `match`, `min/max` validators
2. **Lean queries** — Use `.lean()` for read-only queries; returns plain objects, 5x faster than Mongoose documents
3. **Indexes** — Add indexes for fields you query/sort by; use `explain()` to verify query plans
4. **Population** — Use `populate()` sparingly; for complex joins, prefer aggregation `$lookup`
5. **Middleware** — Use `pre('save')` for hashing, validation; `post('save')` for notifications, logging
6. **Timestamps** — Enable `timestamps: true`; auto-manages `createdAt` and `updatedAt`
7. **Transactions** — Use sessions for multi-document operations; requires replica set or MongoDB Atlas
8. **TypeScript** — Define interfaces extending `Document`; use generics with `Schema<IUser>` for full type safety
