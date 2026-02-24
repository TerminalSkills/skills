---
name: spring-boot
description: |
  Spring Boot is a Java framework that simplifies building production-ready applications.
  It provides auto-configuration, embedded servers, and opinionated defaults for REST APIs,
  data access with JPA, security, and monitoring via Actuator.
license: Apache-2.0
compatibility:
  - java >= 17
  - maven or gradle
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - java
    - spring
    - rest
    - jpa
    - enterprise
    - api
---

# Spring Boot

Spring Boot makes it easy to create stand-alone, production-grade Spring applications. It auto-configures components based on classpath dependencies and provides embedded Tomcat/Jetty.

## Quick Start

```bash
# Generate project with Spring Initializr
curl https://start.spring.io/starter.tgz \
  -d dependencies=web,data-jpa,postgresql,security,actuator,validation \
  -d javaVersion=17 -d type=maven-project \
  -d groupId=com.example -d artifactId=myapp | tar xzf -
```

## Project Structure

```
# Standard Spring Boot Maven project
src/main/java/com/example/myapp/
├── MyappApplication.java        # Main class
├── config/                      # Configuration classes
├── controller/                  # REST controllers
├── service/                     # Business logic
├── repository/                  # Data access (JPA)
├── model/                       # Entity classes
├── dto/                         # Data transfer objects
├── exception/                   # Exception handlers
└── security/                    # Security config
src/main/resources/
├── application.yml              # Configuration
└── db/migration/                # Flyway migrations
```

## Entity and Repository

```java
// model/Article.java — JPA entity
package com.example.myapp.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "articles")
public class Article {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String body;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id")
    private User author;

    @Column(updatable = false)
    private Instant createdAt = Instant.now();

    // Getters and setters omitted for brevity
}
```

```java
// repository/ArticleRepository.java — Spring Data JPA repository
package com.example.myapp.repository;

import com.example.myapp.model.Article;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ArticleRepository extends JpaRepository<Article, Long> {
    Page<Article> findByAuthorId(Long authorId, Pageable pageable);
    boolean existsByTitle(String title);
}
```

## REST Controller

```java
// controller/ArticleController.java — REST API endpoints
package com.example.myapp.controller;

import com.example.myapp.dto.ArticleRequest;
import com.example.myapp.dto.ArticleResponse;
import com.example.myapp.service.ArticleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/articles")
@RequiredArgsConstructor
public class ArticleController {
    private final ArticleService articleService;

    @GetMapping
    public Page<ArticleResponse> list(Pageable pageable) {
        return articleService.findAll(pageable);
    }

    @GetMapping("/{id}")
    public ArticleResponse get(@PathVariable Long id) {
        return articleService.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ArticleResponse create(@Valid @RequestBody ArticleRequest request) {
        return articleService.create(request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        articleService.delete(id);
    }
}
```

## DTOs with Validation

```java
// dto/ArticleRequest.java — validated request DTO
package com.example.myapp.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ArticleRequest(
    @NotBlank @Size(max = 200) String title,
    @NotBlank String body
) {}
```

## Service Layer

```java
// service/ArticleService.java — business logic
package com.example.myapp.service;

import com.example.myapp.dto.*;
import com.example.myapp.model.Article;
import com.example.myapp.repository.ArticleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ArticleService {
    private final ArticleRepository repo;

    public Page<ArticleResponse> findAll(Pageable pageable) {
        return repo.findAll(pageable).map(this::toResponse);
    }

    @Transactional
    public ArticleResponse create(ArticleRequest req) {
        Article article = new Article();
        article.setTitle(req.title());
        article.setBody(req.body());
        return toResponse(repo.save(article));
    }

    private ArticleResponse toResponse(Article a) {
        return new ArticleResponse(a.getId(), a.getTitle(), a.getCreatedAt());
    }
}
```

## Global Exception Handler

```java
// exception/GlobalExceptionHandler.java — centralized error handling
package com.example.myapp.exception;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ProblemDetail> handleNotFound(ResourceNotFoundException ex) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        return ResponseEntity.status(404).body(detail);
    }
}
```

## Security Configuration

```java
// security/SecurityConfig.java — Spring Security setup
package com.example.myapp.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf(c -> c.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**", "/actuator/health").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> {}));
        return http.build();
    }
}
```

## Configuration

```yaml
# application.yml — application configuration
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: ${DB_USER:postgres}
    password: ${DB_PASSWORD:}
  jpa:
    hibernate.ddl-auto: validate
    open-in-view: false

management:
  endpoints.web.exposure.include: health,info,metrics,prometheus
  endpoint.health.show-details: when-authorized

server:
  port: 8080
```

## Testing

```java
// controller/ArticleControllerTest.java — integration test
package com.example.myapp.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ArticleControllerTest {
    @Autowired MockMvc mvc;

    @Test
    void listArticles() throws Exception {
        mvc.perform(get("/api/articles")).andExpect(status().isOk());
    }
}
```

## Key Patterns

- Use constructor injection (Lombok `@RequiredArgsConstructor`) over field injection
- Use Java records for DTOs — immutable, concise
- Set `spring.jpa.open-in-view: false` to avoid lazy loading issues in controllers
- Use `@Transactional` on service methods, not controllers
- Use Spring Profiles (`application-dev.yml`, `application-prod.yml`) for env-specific config
- Use Flyway or Liquibase for migrations — never `ddl-auto: update` in production
