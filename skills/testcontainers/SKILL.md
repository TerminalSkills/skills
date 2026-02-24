---
name: testcontainers
description: When the user wants to run integration tests with real dependencies using Docker containers managed by Testcontainers. Also use when the user mentions "testcontainers," "integration testing with Docker," "database integration tests," "containerized tests," or "test with real database." For API mocking without containers, see mockoon or wiremock.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags:
    - integration-testing
    - docker
    - databases
    - containers
---

# Testcontainers

## Overview

You are an expert in Testcontainers, the library that provides lightweight, throwaway Docker containers for integration testing. You help users spin up real databases (PostgreSQL, MySQL, MongoDB), message brokers (Kafka, RabbitMQ), and other services as part of their test suite. You understand the Testcontainers API for Node.js, Java, Python, Go, and .NET, and know how to optimize container startup times.

## Instructions

### Initial Assessment

1. **Language** — JavaScript/TypeScript, Java, Python, Go, or .NET?
2. **Dependencies** — Which services need containerization? (databases, caches, queues)
3. **Test runner** — Jest, Vitest, JUnit, pytest?
4. **Docker** — Docker Desktop or CI Docker available?

### Setup (Node.js)

```bash
# setup-testcontainers.sh — Install Testcontainers for Node.js.
npm install --save-dev testcontainers
```

### PostgreSQL Integration Test

```typescript
// tests/user-repo.integration.test.ts — Integration test with a real PostgreSQL container.
// Spins up Postgres, runs migrations, tests the repository, tears down.
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { UserRepository } from '../src/repositories/userRepo';
import { runMigrations } from '../src/db/migrate';

describe('UserRepository', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let repo: UserRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('testdb')
      .withUsername('test')
      .withPassword('test')
      .start();

    pool = new Pool({ connectionString: container.getConnectionUri() });
    await runMigrations(pool);
    repo = new UserRepository(pool);
  }, 60000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM users');
  });

  it('should create and retrieve a user', async () => {
    const created = await repo.create({ name: 'Jane', email: 'jane@test.com' });
    expect(created.id).toBeDefined();

    const found = await repo.findById(created.id);
    expect(found).toMatchObject({ name: 'Jane', email: 'jane@test.com' });
  });

  it('should return null for non-existent user', async () => {
    const found = await repo.findById(99999);
    expect(found).toBeNull();
  });
});
```

### Redis Integration Test

```typescript
// tests/cache.integration.test.ts — Integration test with a real Redis container.
// Tests caching behavior with actual Redis commands.
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { createClient, RedisClientType } from 'redis';
import { CacheService } from '../src/services/cache';

describe('CacheService', () => {
  let container: StartedTestContainer;
  let redis: RedisClientType;
  let cache: CacheService;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();

    redis = createClient({
      url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
    });
    await redis.connect();
    cache = new CacheService(redis);
  }, 30000);

  afterAll(async () => {
    await redis.quit();
    await container.stop();
  });

  it('should cache and retrieve values', async () => {
    await cache.set('key1', { data: 'hello' }, 60);
    const result = await cache.get('key1');
    expect(result).toEqual({ data: 'hello' });
  });

  it('should return null for expired keys', async () => {
    await cache.set('temp', 'value', 1);
    await new Promise((r) => setTimeout(r, 1500));
    const result = await cache.get('temp');
    expect(result).toBeNull();
  });
});
```

### Docker Compose Module

```typescript
// tests/full-stack.integration.test.ts — Multi-container test using Docker Compose.
// Spins up an entire stack for end-to-end integration testing.
import { DockerComposeEnvironment, StartedDockerComposeEnvironment } from 'testcontainers';
import { resolve } from 'path';

describe('Full Stack Integration', () => {
  let environment: StartedDockerComposeEnvironment;

  beforeAll(async () => {
    environment = await new DockerComposeEnvironment(
      resolve(__dirname, '..'),
      'docker-compose.test.yml'
    )
      .withWaitStrategy('api-1', { type: 'HTTP', path: '/health', port: 3000 })
      .up();
  }, 120000);

  afterAll(async () => {
    await environment.down();
  });

  it('should process orders end-to-end', async () => {
    const apiContainer = environment.getContainer('api-1');
    const apiPort = apiContainer.getMappedPort(3000);
    const baseUrl = `http://localhost:${apiPort}`;

    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: 'widget', quantity: 3 }),
    });

    expect(res.status).toBe(201);
    const order = await res.json();
    expect(order.id).toBeDefined();
  });
});
```

### Java with JUnit 5

```java
// src/test/java/UserRepoTest.java — Testcontainers with JUnit 5 and PostgreSQL.
// Uses @Container annotation for automatic lifecycle management.
import org.junit.jupiter.api.*;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.*;

@Testcontainers
class UserRepoTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test");

    private Connection conn;

    @BeforeEach
    void setUp() throws SQLException {
        conn = DriverManager.getConnection(
            postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()
        );
        conn.createStatement().execute(
            "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT, email TEXT)"
        );
    }

    @Test
    void shouldInsertAndRetrieveUser() throws SQLException {
        conn.createStatement().execute("INSERT INTO users (name, email) VALUES ('Jane', 'jane@test.com')");
        ResultSet rs = conn.createStatement().executeQuery("SELECT * FROM users WHERE name = 'Jane'");
        Assertions.assertTrue(rs.next());
        Assertions.assertEquals("jane@test.com", rs.getString("email"));
    }
}
```

### CI Integration

```yaml
# .github/workflows/integration.yml — Run Testcontainers tests in GitHub Actions.
# Docker is available by default on ubuntu-latest runners.
name: Integration Tests
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test:integration
        env:
          TESTCONTAINERS_RYUK_DISABLED: "true"
```
