---
name: faker
description: When the user wants to generate realistic fake data for testing, seeding databases, or prototyping. Also use when the user mentions "faker," "fake data," "test data generation," "seed data," "mock data," "random names," or "realistic test data." For API mocking, see mockoon or wiremock.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - test-data
    - data-generation
    - seeding
    - prototyping
---

# Faker

## Overview

You are an expert in Faker.js (@faker-js/faker), the library for generating realistic fake data. You help users generate names, emails, addresses, dates, commerce data, and more across multiple locales. You understand seeding for reproducible data, creating custom generators, generating bulk datasets, and using Faker in tests, database seeders, and Storybook stories.

## Instructions

### Initial Assessment

1. **Purpose** — Testing, database seeding, prototyping, or demos?
2. **Language** — JavaScript/TypeScript, Python, Ruby, PHP, or other?
3. **Data shape** — What entities need fake data? (users, products, orders)
4. **Locale** — Which language/region? (en, de, fr, ja, etc.)

### Setup

```bash
# setup-faker.sh — Install Faker.js.
npm install --save-dev @faker-js/faker
```

### Basic Usage

```typescript
// generate-data.ts — Basic Faker.js usage for common data types.
// Generates names, emails, addresses, and more.
import { faker } from '@faker-js/faker';

const user = {
  id: faker.string.uuid(),
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  email: faker.internet.email(),
  avatar: faker.image.avatar(),
  phone: faker.phone.number(),
  address: {
    street: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state(),
    zip: faker.location.zipCode(),
    country: faker.location.country(),
  },
  company: faker.company.name(),
  jobTitle: faker.person.jobTitle(),
  bio: faker.lorem.paragraph(),
  createdAt: faker.date.past(),
};

console.log(user);
```

### Generating Collections

```typescript
// generate-users.ts — Generate an array of fake users with consistent shape.
// Useful for seeding databases or populating test fixtures.
import { faker } from '@faker-js/faker';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'moderator';
  isActive: boolean;
  createdAt: Date;
}

function createRandomUser(): User {
  return {
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    email: faker.internet.email().toLowerCase(),
    role: faker.helpers.arrayElement(['admin', 'user', 'moderator']),
    isActive: faker.datatype.boolean({ probability: 0.8 }),
    createdAt: faker.date.between({ from: '2023-01-01', to: new Date() }),
  };
}

const users = faker.helpers.multiple(createRandomUser, { count: 100 });
console.log(`Generated ${users.length} users`);
```

### Reproducible Data with Seeds

```typescript
// seeded-data.ts — Use seeds for reproducible fake data across test runs.
// Same seed always produces the same data.
import { faker } from '@faker-js/faker';

faker.seed(42);

const user1 = faker.person.fullName();
const email1 = faker.internet.email();

// Reset seed for a different but equally reproducible set
faker.seed(123);
const user2 = faker.person.fullName();
```

### Multiple Locales

```typescript
// localized-data.ts — Generate fake data in different languages and locales.
// Each locale produces culturally appropriate names, addresses, etc.
import { faker, fakerDE, fakerFR, fakerJA } from '@faker-js/faker';

const germanUser = {
  name: fakerDE.person.fullName(),
  address: fakerDE.location.streetAddress(),
  phone: fakerDE.phone.number(),
};

const frenchUser = {
  name: fakerFR.person.fullName(),
  city: fakerFR.location.city(),
};

const japaneseUser = {
  name: fakerJA.person.fullName(),
  city: fakerJA.location.city(),
};
```

### Database Seeder

```typescript
// seeds/seed-database.ts — Database seeder using Faker for realistic test data.
// Creates users, products, and orders with proper relationships.
import { faker } from '@faker-js/faker';
import { db } from '../src/db';

async function seed() {
  faker.seed(42);

  const userIds: string[] = [];
  for (let i = 0; i < 50; i++) {
    const [user] = await db('users').insert({
      name: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      avatar_url: faker.image.avatar(),
      created_at: faker.date.past({ years: 2 }),
    }).returning('id');
    userIds.push(user.id);
  }

  const productIds: string[] = [];
  for (let i = 0; i < 200; i++) {
    const [product] = await db('products').insert({
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      price: parseFloat(faker.commerce.price({ min: 5, max: 500 })),
      category: faker.commerce.department(),
      image_url: faker.image.urlPicsumPhotos(),
      in_stock: faker.datatype.boolean({ probability: 0.85 }),
    }).returning('id');
    productIds.push(product.id);
  }

  for (let i = 0; i < 500; i++) {
    const userId = faker.helpers.arrayElement(userIds);
    const itemCount = faker.number.int({ min: 1, max: 5 });

    const [order] = await db('orders').insert({
      user_id: userId,
      status: faker.helpers.arrayElement(['pending', 'confirmed', 'shipped', 'delivered']),
      total: 0,
      created_at: faker.date.recent({ days: 90 }),
    }).returning('id');

    let total = 0;
    for (let j = 0; j < itemCount; j++) {
      const productId = faker.helpers.arrayElement(productIds);
      const quantity = faker.number.int({ min: 1, max: 3 });
      const price = parseFloat(faker.commerce.price({ min: 5, max: 100 }));
      total += price * quantity;

      await db('order_items').insert({
        order_id: order.id,
        product_id: productId,
        quantity,
        price,
      });
    }

    await db('orders').where({ id: order.id }).update({ total });
  }

  console.log('Seeded: 50 users, 200 products, 500 orders');
}

seed().then(() => process.exit(0));
```

### Using in Tests

```typescript
// tests/user-service.test.ts — Using Faker inside unit tests for random but realistic data.
// Each test gets unique data; seed for reproducibility when debugging.
import { faker } from '@faker-js/faker';
import { UserService } from '../src/services/userService';

describe('UserService', () => {
  const service = new UserService();

  it('should validate email format', () => {
    const validEmail = faker.internet.email();
    expect(service.isValidEmail(validEmail)).toBe(true);

    const invalidEmail = faker.person.firstName();
    expect(service.isValidEmail(invalidEmail)).toBe(false);
  });

  it('should create user with all fields', async () => {
    const input = {
      name: faker.person.fullName(),
      email: faker.internet.email(),
      age: faker.number.int({ min: 18, max: 99 }),
    };

    const user = await service.create(input);
    expect(user.name).toBe(input.name);
    expect(user.email).toBe(input.email);
    expect(user.id).toBeDefined();
  });
});
```

### Custom Helpers

```typescript
// helpers/fake-helpers.ts — Custom Faker helpers for domain-specific data.
// Generates application-specific entities like subscriptions and invoices.
import { faker } from '@faker-js/faker';

export function fakeSubscription() {
  const plans = ['free', 'pro', 'enterprise'] as const;
  const plan = faker.helpers.arrayElement(plans);

  return {
    id: faker.string.uuid(),
    plan,
    price: plan === 'free' ? 0 : plan === 'pro' ? 19.99 : 99.99,
    startDate: faker.date.past(),
    renewalDate: faker.date.future(),
    isActive: faker.datatype.boolean({ probability: 0.9 }),
  };
}

export function fakeInvoice() {
  return {
    id: `INV-${faker.string.alphanumeric(8).toUpperCase()}`,
    amount: parseFloat(faker.finance.amount({ min: 10, max: 5000 })),
    currency: faker.finance.currencyCode(),
    status: faker.helpers.arrayElement(['draft', 'sent', 'paid', 'overdue']),
    dueDate: faker.date.soon({ days: 30 }),
    lineItems: faker.helpers.multiple(
      () => ({
        description: faker.commerce.productName(),
        quantity: faker.number.int({ min: 1, max: 10 }),
        unitPrice: parseFloat(faker.commerce.price()),
      }),
      { count: { min: 1, max: 5 } }
    ),
  };
}
```
