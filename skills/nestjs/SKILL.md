---
name: nestjs
description: |
  NestJS is a progressive TypeScript framework for building scalable server-side
  applications on Node.js. It uses decorators, modules, dependency injection, and
  an opinionated architecture inspired by Angular.
license: Apache-2.0
compatibility:
  - node >= 18
  - npm or yarn or pnpm
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frameworks
  tags:
    - typescript
    - node
    - api
    - rest
    - graphql
    - enterprise
---

# NestJS

NestJS provides a modular architecture with dependency injection, decorators for routing and validation, guards for auth, and interceptors for cross-cutting concerns.

## Installation

```bash
# Create new NestJS project
npm i -g @nestjs/cli
nest new my-api
cd my-api
npm i @nestjs/typeorm typeorm pg class-validator class-transformer
```

## Project Structure

```
# Standard NestJS project layout
src/
├── main.ts                  # Bootstrap
├── app.module.ts            # Root module
├── articles/
│   ├── articles.module.ts   # Feature module
│   ├── articles.controller.ts
│   ├── articles.service.ts
│   ├── entities/article.entity.ts
│   └── dto/
│       ├── create-article.dto.ts
│       └── update-article.dto.ts
├── auth/
│   ├── auth.module.ts
│   ├── auth.guard.ts
│   └── auth.service.ts
└── common/
    ├── filters/
    └── interceptors/
```

## Module

```typescript
// src/articles/articles.module.ts — feature module
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { Article } from './entities/article.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Article])],
  controllers: [ArticlesController],
  providers: [ArticlesService],
  exports: [ArticlesService],
})
export class ArticlesModule {}
```

## Entity

```typescript
// src/articles/entities/article.entity.ts — TypeORM entity
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity()
export class Article {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 200 })
  title: string;

  @Column('text')
  body: string;

  @ManyToOne(() => User, (user) => user.articles)
  author: User;

  @CreateDateColumn()
  createdAt: Date;
}
```

## DTOs with Validation

```typescript
// src/articles/dto/create-article.dto.ts — validated DTO
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateArticleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;
}
```

## Controller

```typescript
// src/articles/articles.controller.ts — REST controller
import {
  Controller, Get, Post, Body, Param, Delete,
  ParseIntPipe, UseGuards, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Get()
  findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.articlesService.findAll(+page, +limit);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.articlesService.findOne(id);
  }

  @Post()
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateArticleDto) {
    return this.articlesService.create(dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.articlesService.remove(id);
  }
}
```

## Service

```typescript
// src/articles/articles.service.ts — business logic with DI
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article } from './entities/article.entity';
import { CreateArticleDto } from './dto/create-article.dto';

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article)
    private readonly repo: Repository<Article>,
  ) {}

  async findAll(page: number, limit: number) {
    return this.repo.find({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['author'],
    });
  }

  async findOne(id: number) {
    const article = await this.repo.findOne({ where: { id }, relations: ['author'] });
    if (!article) throw new NotFoundException(`Article #${id} not found`);
    return article;
  }

  async create(dto: CreateArticleDto) {
    const article = this.repo.create(dto);
    return this.repo.save(article);
  }

  async remove(id: number) {
    const result = await this.repo.delete(id);
    if (result.affected === 0) throw new NotFoundException();
  }
}
```

## Guards

```typescript
// src/auth/auth.guard.ts — JWT auth guard
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException();
    try {
      request['user'] = await this.jwtService.verifyAsync(token);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
```

## App Module and Bootstrap

```typescript
// src/app.module.ts — root module with TypeORM config
import { Module, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticlesModule } from './articles/articles.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: 5432,
      database: process.env.DB_NAME ?? 'mydb',
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? '',
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    ArticlesModule,
  ],
})
export class AppModule {}
```

```typescript
// src/main.ts — bootstrap with global pipes
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();
  await app.listen(3000);
}
bootstrap();
```

## Testing

```typescript
// src/articles/articles.service.spec.ts — unit test
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ArticlesService } from './articles.service';
import { Article } from './entities/article.entity';

describe('ArticlesService', () => {
  let service: ArticlesService;
  const mockRepo = { find: jest.fn().mockResolvedValue([]), create: jest.fn(), save: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ArticlesService,
        { provide: getRepositoryToken(Article), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(ArticlesService);
  });

  it('returns articles', async () => {
    expect(await service.findAll(1, 20)).toEqual([]);
  });
});
```

## Key Patterns

- One module per feature; import only what you need
- Use `ValidationPipe` with `whitelist: true` to strip unknown properties
- Use guards for auth, interceptors for response mapping, filters for exceptions
- Set `synchronize: false` in production — use TypeORM migrations instead
- Use `@nestjs/config` with `ConfigModule.forRoot()` for environment variables
