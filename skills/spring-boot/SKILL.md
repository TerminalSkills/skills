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
  category: frameworks
  tags:
    - java
    - spring
    - rest
    - jpa
    - enterprise
    - api
---

# Spring Boot

Spring Boot makes it easy to create stand-alone, production-grade Spring applications with auto-configuration and embedded servers.

## Quick Start

```bash
# Generate project with Spring Initializr
curl https://start.spring.io/starter.tgz \
  -d dependencies=web,data-jpa,postgresql,security,actuator,validation \
  -d javaVersion=17 -d type=maven-project | tar xzf -
```

## Entity and Repository

```java
// model/Article.java — JPA entity
@Entity
@Table(name = "articles")
public class Article {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String body;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "author_id")
    private User author;

    private Instant createdAt = Instant.now();
}
```

```java
// repository/ArticleRepository.java — Spring Data JPA repository
public interface ArticleRepository extends JpaRepository<Article, Long> {
    Page<Article> findByAuthorId(Long authorId, Pageable pageable);
}
```

## REST Controller

```java
// controller/ArticleController.java — REST API endpoints
@RestController
@RequestMapping("/api/articles")
@RequiredArgsConstructor
public class ArticleController {
    private final ArticleService articleService;

    @GetMapping
    public Page<ArticleResponse> list(Pageable pageable) {
        return articleService.findAll(pageable);
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
public record ArticleRequest(
    @NotBlank @Size(max = 200) String title,
    @NotBlank String body
) {}
```

## Service Layer

```java
// service/ArticleService.java — business logic
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

## Exception Handler

```java
// exception/GlobalExceptionHandler.java — centralized error handling
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ProblemDetail> handleNotFound(ResourceNotFoundException ex) {
        return ResponseEntity.status(404)
            .body(ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage()));
    }
}
```

## Security Configuration

```java
// security/SecurityConfig.java — Spring Security setup
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
  endpoints.web.exposure.include: health,info,metrics
```

## Testing

```java
// controller/ArticleControllerTest.java — integration test
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
- Use Flyway or Liquibase for migrations — never `ddl-auto: update` in production
