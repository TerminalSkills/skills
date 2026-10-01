---
name: symfony
description: >-
  Symfony is a PHP framework for building web applications and APIs from
  reusable components: routing and controllers, dependency injection, Doctrine
  ORM, validation, security and the Messenger queue. Use when a user asks to
  create or upgrade a Symfony project, write controllers, entities or
  migrations, validate request payloads, run background jobs with Messenger,
  build a REST API with API Platform, or debug services and routes with
  bin/console.
license: Apache-2.0
compatibility: "Symfony 8.1 needs PHP 8.4+ and Composer 2; the 7.4 LTS runs on PHP 8.2+"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/symfony/symfony
  tags:
    - php
    - framework
    - enterprise
    - api
    - doctrine
---

# Symfony — Enterprise PHP Framework

## Overview

Symfony is a PHP framework built from decoupled components, wired together by a dependency-injection container and configured with PHP attributes. A new project starts as a minimal skeleton; features (Doctrine ORM, Serializer, Validator, Security, Messenger, API Platform) are added with `composer require`, and Symfony Flex recipes register and configure each one. Current stable is **8.1** (PHP 8.4+, maintained until January 2027); **7.4** is the long-term-support line (PHP 8.2+, security fixes until November 2029).

## Instructions

### Installation

```bash
composer create-project symfony/skeleton:"8.1.*" checkout-api    # or "7.4.*" for the LTS
cd checkout-api
composer require orm serializer validator messenger mailer       # API building blocks
composer require --dev maker
composer require webapp                   # OR the full server-rendered stack: Twig, forms, security, profiler
composer require api                      # OR API Platform for REST/GraphQL resources
# Optional Symfony CLI: local HTTPS server, `symfony new`, `symfony check:requirements`
brew install symfony-cli/tap/symfony-cli  # macOS/Linux; Windows: scoop install symfony-cli
symfony serve -d                          # without the CLI: php -S 127.0.0.1:8000 -t public
```

Put machine-specific settings in `.env.local` (git-ignored), for example `DATABASE_URL="postgresql://app:${DB_PASSWORD}@127.0.0.1:5432/checkout?serverVersion=16&charset=utf8"`. The skeleton also ships an `AGENTS.md` with the project's conventions for coding agents — read it.

### Controllers and Routing

```php
<?php
// src/Controller/UserController.php
namespace App\Controller;

use App\Dto\CreateUser;
use App\Entity\User;
use App\Message\SendWelcomeEmail;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapQueryParameter;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Messenger\MessageBusInterface;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/users')]
final class UserController extends AbstractController
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly EntityManagerInterface $em,
        private readonly MessageBusInterface $bus,
    ) {}

    #[Route('', methods: ['GET'])]
    public function list(#[MapQueryParameter] int $page = 1, #[MapQueryParameter] int $limit = 20): JsonResponse
    {
        return $this->json($this->users->findPaginated($page, $limit), context: ['groups' => ['user:list']]);
    }

    #[Route('', methods: ['POST'])]
    public function create(#[MapRequestPayload] CreateUser $input): JsonResponse
    {
        $user = new User($input->name, $input->email);
        $this->em->persist($user);
        $this->em->flush();
        $this->bus->dispatch(new SendWelcomeEmail($user->getId()));

        return $this->json($user, 201, context: ['groups' => ['user:detail']]);
    }

    #[Route('/{id}', requirements: ['id' => '\d+'], methods: ['GET'])]
    public function show(User $user): JsonResponse
    {
        return $this->json($user, context: ['groups' => ['user:detail']]);
    }
}

// src/Dto/CreateUser.php
namespace App\Dto;

use App\Entity\User;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;
use Symfony\Component\Validator\Constraints as Assert;

#[UniqueEntity(fields: ['email'], entityClass: User::class)]
final readonly class CreateUser
{
    public function __construct(
        #[Assert\NotBlank, Assert\Length(min: 2, max: 100)]
        public string $name,
        #[Assert\NotBlank, Assert\Email]
        public string $email,
    ) {}
}
```

`#[MapRequestPayload]` deserializes and validates the JSON body (malformed JSON → 400, violations → 422). A `User` argument is loaded from the `{id}` placeholder; an unknown id gives 404.

### Doctrine Entity

```php
<?php
// src/Entity/User.php
namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: 'users')]
class User
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    #[Groups(['user:list', 'user:detail'])]
    private ?int $id = null;

    #[ORM\Column]
    #[Groups(['user:detail'])]
    private \DateTimeImmutable $createdAt;

    public function __construct(
        #[ORM\Column(length: 100)]
        #[Groups(['user:list', 'user:detail'])]
        private string $name,
        #[ORM\Column(unique: true)]
        #[Groups(['user:detail'])]
        private string $email,
    ) {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function getEmail(): string { return $this->email; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}

// src/Repository/UserRepository.php — a method of the class that extends ServiceEntityRepository
public function findPaginated(int $page, int $limit): array
{
    return $this->createQueryBuilder('u')->orderBy('u.id', 'ASC')
        ->setFirstResult(($page - 1) * $limit)->setMaxResults($limit)
        ->getQuery()->getResult();
}
```

```bash
php bin/console make:migration                   # diff entities against the database -> migrations/VersionYYYYMMDDHHMMSS.php
php bin/console doctrine:migrations:migrate -n   # apply; run the same command on deploy
```

### Messenger (Async Processing)

```php
<?php
// src/Message/SendWelcomeEmail.php
namespace App\Message;

use Symfony\Component\Messenger\Attribute\AsMessage;

#[AsMessage('async')]                      // route to the "async" transport
final readonly class SendWelcomeEmail
{
    public function __construct(public int $userId) {}
}

// src/MessageHandler/SendWelcomeEmailHandler.php
namespace App\MessageHandler;

use App\Message\SendWelcomeEmail;
use App\Repository\UserRepository;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;
use Symfony\Component\Mime\Email;

#[AsMessageHandler]
final class SendWelcomeEmailHandler
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly MailerInterface $mailer,
    ) {}

    public function __invoke(SendWelcomeEmail $message): void
    {
        $user = $this->users->find($message->userId);
        if (null === $user) { return; }    // deleted before the worker got to it
        $this->mailer->send((new Email())->from('hello@northwind.dev')->to($user->getEmail())
            ->subject('Welcome to Northwind')
            ->text(sprintf('Hi %s, your account is ready.', $user->getName())));
    }
}
```

```yaml
# config/packages/messenger.yaml
framework:
    messenger:
        failure_transport: failed
        transports:
            async: '%env(MESSENGER_TRANSPORT_DSN)%'    # doctrine://default, amqp://…, redis://…
            failed: 'doctrine://default?queue_name=failed'
```

```bash
composer require symfony/doctrine-messenger      # each transport is its own package (also amqp-messenger, redis-messenger)
php bin/console messenger:consume async -vv --time-limit=3600    # worker; keep it alive with systemd or Supervisor
php bin/console messenger:failed:show            # inspect failures; messenger:failed:retry to re-run them
```

### Inspect Before You Guess

```bash
php bin/console about                      # Symfony/PHP versions, environment, end-of-maintenance date
php bin/console debug:router               # every route with method and path
php bin/console debug:autowiring mailer    # which type-hints can be injected
php bin/console lint:container             # catches wiring errors without running the app
```

## Examples

### Example 1: A validated JSON endpoint

**User request:** "Add `POST /api/users` to our Symfony API. Reject bad input with proper error responses."

With the controller and `CreateUser` DTO above, no manual `json_decode()` or validator call is needed:

```
$ curl -s -i -X POST http://127.0.0.1:8000/api/users -H 'Content-Type: application/json' \
    -H 'Accept: application/json' -d '{"name":"Dana Whitfield","email":"dana@northwind.dev"}'
HTTP/1.1 201 Created
{"id":1,"createdAt":"2026-10-01T17:18:37+00:00","name":"Dana Whitfield","email":"dana@northwind.dev"}

$ curl -s -i -X POST http://127.0.0.1:8000/api/users -H 'Content-Type: application/json' \
    -H 'Accept: application/json' -d '{"name":"D","email":"not-an-email"}'
HTTP/1.1 422 Unprocessable Content
{"type":"https:\/\/symfony.com\/errors\/validation","title":"Validation Failed","status":422,
 "detail":"name: This value is too short. It should have 2 characters or more.\nemail: This value is not a valid email address.", …}
```

Posting the same email again returns 422 with `email: This value is already used.`; a body that is not JSON returns 400. `GET /api/users?page=1&limit=10` returns `[{"id":1,"name":"Dana Whitfield"}]` because only `user:list` fields are serialized.

### Example 2: Send the welcome email in the background

**User request:** "Signup is slow because we send the email inline. Move it to a queue."

The controller dispatches `SendWelcomeEmail`; `#[AsMessage('async')]` routes it to the `async` transport, so the request returns immediately. Create the queue table and run a worker:

```
$ php bin/console make:migration && php bin/console doctrine:migrations:migrate -n
$ php bin/console messenger:consume async --limit=1 -vv
 [OK] Consuming messages from transport "async".
[info] Received message App\Message\SendWelcomeEmail
[info] Message Symfony\Component\Mailer\Messenger\SendEmailMessage handled by Symfony\Component\Mailer\Messenger\MessageHandler::__invoke
[info] Message App\Message\SendWelcomeEmail handled by App\MessageHandler\SendWelcomeEmailHandler::__invoke
[info] App\Message\SendWelcomeEmail was handled successfully (acknowledging to transport).
[info] Worker stopped due to maximum count of 1 messages processed
```

## Guidelines

1. **Dependency injection** — let Symfony autowire constructor arguments; use `#[Autowire]` for parameters and env vars, and interfaces for swappable implementations. YAML service definitions are the last resort.
2. **Attributes only** — `#[Route]`, `#[Groups]`, `#[Assert\…]`, `#[AsMessageHandler]`. Doctrine annotations and the `Annotation\` namespaces of older tutorials are gone; import from `…\Attribute\…`.
3. **Doctrine migrations** — change the schema with `make:migration` (or `doctrine:migrations:diff`) and `doctrine:migrations:migrate`; never `doctrine:schema:update --force` in production.
4. **Serialization groups** — `#[Groups]` decides which fields each endpoint exposes (list vs detail); without groups every getter is serialized.
5. **Validation** — put constraints on a request DTO and bind it with `#[MapRequestPayload]` / `#[MapQueryString]`. Clients must send `Accept: application/json` to get JSON errors; otherwise the error page is HTML.
6. **Messenger for async** — dispatch messages for heavy work (emails, reports). Messages carry ids, not entities. Workers load code once: run `messenger:stop-workers` on every deploy so the process manager restarts them.
7. **API Platform** — for CRUD-heavy REST/GraphQL APIs, `composer require api` and mark entities with `#[ApiResource]` instead of hand-writing controllers.
8. **Security voters** — keep authorization in voters and call them with `#[IsGranted('EDIT', subject: 'post')]` or `denyAccessUnlessGranted()`; do not scatter role checks through controllers.
9. **Events** — use `#[AsEventListener]` for cross-cutting concerns instead of calling services from every controller.
10. **Secrets and production** — `.env` is committed and holds defaults only; real secrets go to `.env.local` or `bin/console secrets:set`. Deploy with `APP_ENV=prod`, `composer install --no-dev --optimize-autoloader` and `composer dump-env prod`; debug mode exposes stack traces.
11. **Makers are interactive** — `bin/console make:*` prompts on a terminal; in scripts and agent sessions pass every argument and `--no-interaction`, or write the class by hand.
12. **When not to use** — for a single script or a tiny service, standalone components (`symfony/console`, `symfony/http-client`) without the full framework are enough.
