---
name: spring-boot
description: |
  Spring Boot is a Java framework for building production-ready applications:
  auto-configuration, embedded servers and opinionated defaults for REST APIs,
  JPA data access, Spring Security and Actuator monitoring. Use when a user asks
  to create a Spring Boot project, build a REST API with JPA and Flyway, secure
  it with JWT, or write MockMvc tests. Covers Spring Boot 4 (Spring Framework 7).
license: Apache-2.0
compatibility: 'Java 17+ (21 recommended), Maven or Gradle'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/spring-projects/spring-boot
  category: development
  tags:
    - java
    - spring
    - rest
    - jpa
    - enterprise
---

# Spring Boot

## Overview

Spring Boot auto-configures an application from its classpath and runs it on an embedded server. Current release: 4.1.2 (start.spring.io default, October 2026), built on Spring Framework 7 and Spring Security 7, Jackson 3 (`tools.jackson`) and Hibernate 7. Spring Boot 4 split the old monolithic modules into smaller ones, so older snippets break: starters were renamed (`spring-boot-starter-web` is now `spring-boot-starter-webmvc`), every starter has a matching `-test` starter, Flyway needs `spring-boot-starter-flyway`, and test annotations moved packages.

## Instructions

### Step 1: Generate the project

Spring Initializr returns a tarball; extract it into an empty directory. Dependency ids are `web`, `data-jpa`, `postgresql`, `security`, `oauth2-resource-server`, `actuator`, `validation`, `lombok`, `flyway`.

```bash
mkdir newsroom-api && cd newsroom-api
curl -s https://start.spring.io/starter.tgz \
  -d dependencies=web,data-jpa,postgresql,security,oauth2-resource-server,actuator,validation,lombok,flyway \
  -d javaVersion=21 -d type=maven-project \
  -d groupId=com.example -d artifactId=myapp | tar xzf -
./mvnw test          # or ./gradlew test with type=gradle-project
```

The generated `contextLoads` test boots the full context and fails without PostgreSQL; delete it or provide a database.

### Step 2: Entity, repository, migration

Flyway owns the schema (`ddl-auto: validate`); file names are `V<number>__<name>.sql`.

```java
// model/Article.java
@Entity
@Table(name = "articles")
@Getter
@Setter
public class Article {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 200)
    private String title;
    @Column(columnDefinition = "TEXT")
    private String body;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}
```

```sql
-- db/migration/V1__create_articles.sql
CREATE TABLE articles (
    id         BIGSERIAL PRIMARY KEY,
    title      VARCHAR(200) NOT NULL,
    body       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```java
// repository/ArticleRepository.java
public interface ArticleRepository extends JpaRepository<Article, Long> {
    Page<Article> findByTitleContainingIgnoreCase(String title, Pageable pageable);
}
```

### Step 3: DTOs, service, controller, errors

```java
// dto/ArticleRequest.java
public record ArticleRequest(@NotBlank @Size(max = 200) String title, @NotBlank String body) {}
```

```java
// dto/ArticleResponse.java
public record ArticleResponse(Long id, String title, Instant createdAt) {}
```

```java
// service/ArticleService.java
@Service
@RequiredArgsConstructor
public class ArticleService {
    private final ArticleRepository repo;

    @Transactional(readOnly = true)
    public Page<ArticleResponse> findAll(Pageable pageable) {
        return repo.findAll(pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public ArticleResponse findById(Long id) {
        return repo.findById(id).map(this::toResponse)
            .orElseThrow(() -> new ResourceNotFoundException("Article " + id + " not found"));
    }

    @Transactional
    public ArticleResponse create(ArticleRequest req) {
        Article article = new Article();
        article.setTitle(req.title());
        article.setBody(req.body());
        return toResponse(repo.save(article));
    }

    @Transactional
    public void delete(Long id) {
        if (!repo.existsById(id)) {
            throw new ResourceNotFoundException("Article " + id + " not found");
        }
        repo.deleteById(id);
    }

    private ArticleResponse toResponse(Article a) {
        return new ArticleResponse(a.getId(), a.getTitle(), a.getCreatedAt());
    }
}
```

```java
// controller/ArticleController.java
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

```java
// exception/ResourceNotFoundException.java
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) {
        super(message);
    }
}
```

```java
// exception/GlobalExceptionHandler.java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleNotFound(ResourceNotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }
}
```

Imports are omitted from the main-code blocks (they are the obvious `org.springframework`, `jakarta` and `lombok` ones; the test shows the moved Boot 4 packages). Add `@EnableSpringDataWebSupport(pageSerializationMode = EnableSpringDataWebSupport.PageSerializationMode.VIA_DTO)` on the application class: returning a `Page` as-is logs a warning that its JSON shape is not stable, and this switch returns the stable `PagedModel` shape.

### Step 4: Security and configuration

The API is a stateless JWT resource server. The context fails at startup unless a `JwtDecoder` can be built, so `issuer-uri` (or `jwk-set-uri`) must be set.

```java
// security/SecurityConfig.java
@Configuration
public class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**", "/actuator/health").permitAll()
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth.jwt(Customizer.withDefaults()));
        return http.build();
    }
}
```

```yaml
# application.yml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/newsroom
    username: ${DB_USER:postgres}
    password: ${DB_PASSWORD:}
  jpa:
    hibernate.ddl-auto: validate
    open-in-view: false
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ${JWT_ISSUER_URI:https://auth.newsroom.dev/realms/newsroom}

management:
  endpoints.web.exposure.include: health,info,metrics
  endpoint.health.show-details: when-authorized
```

Prometheus metrics need the extra `io.micrometer:micrometer-registry-prometheus` dependency before `prometheus` can be added to `management.endpoints.web.exposure.include`. Use profiles (`application-prod.yml`) for per-environment settings and keep secrets in environment variables.

### Step 5: Test

`@WebMvcTest` loads only the web layer, so no database is needed. Add `@MockitoBean` for collaborators (it replaced `@MockBean`). In Boot 4 the annotation lives in `org.springframework.boot.webmvc.test.autoconfigure` (and `@DataJpaTest` in `org.springframework.boot.data.jpa.test.autoconfigure`); the old `org.springframework.boot.test.autoconfigure.web.servlet` import no longer applies.

```java
// controller/ArticleControllerTest.java
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.example.myapp.dto.ArticleResponse;
import com.example.myapp.security.SecurityConfig;
import com.example.myapp.service.ArticleService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.BDDMockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ArticleController.class)
@Import(SecurityConfig.class)
class ArticleControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ArticleService articleService;
    @MockitoBean JwtDecoder jwtDecoder;
    @Test
    void listRequiresAuthentication() throws Exception {
        mvc.perform(get("/api/articles")).andExpect(status().isUnauthorized());
    }

    @Test
    void listReturnsArticles() throws Exception {
        BDDMockito.given(articleService.findAll(org.mockito.ArgumentMatchers.any()))
            .willReturn(new PageImpl<>(List.of(new ArticleResponse(1L, "Hello", Instant.now()))));
        mvc.perform(get("/api/articles").with(jwt())).andExpect(status().isOk());
    }
}
```

## Examples

### Example 1: "Create a Spring Boot REST API for articles with Postgres"

Run Step 1, add the files from Steps 2 to 4, start PostgreSQL, then `DB_PASSWORD=... ./mvnw spring-boot:run`. `GET /api/articles` without a token answers 401; with a valid bearer token it returns a page of articles. `./mvnw test` reports the two tests in the example passing.

### Example 2: "My old Spring Boot 3 tests no longer compile after upgrading to 4"

Swap the dependencies for the new starters (`spring-boot-starter-webmvc`, `spring-boot-starter-webmvc-test`, `spring-boot-starter-data-jpa-test`, `spring-boot-starter-security-test`), change imports to the `org.springframework.boot.webmvc.test.autoconfigure` package, replace `@MockBean` with `@MockitoBean`, and replace `com.fasterxml.jackson` imports with `tools.jackson` (annotations from `com.fasterxml.jackson.annotation` are unchanged in Jackson 3).

## Guidelines

- Use constructor injection (Lombok `@RequiredArgsConstructor` or an explicit constructor), never field injection.
- Use records for DTOs and never expose JPA entities from controllers.
- Keep `spring.jpa.open-in-view: false` and put `@Transactional` on service methods, not controllers.
- Never use `ddl-auto: update` in production; use Flyway or Liquibase.
- Expose only the Actuator endpoints you need and keep them behind authentication except `health`.
- Do not copy Spring Boot 2/3 snippets blindly: `javax.*` imports became `jakarta.*` in 3, and the starter and test-annotation renames came in 4.
