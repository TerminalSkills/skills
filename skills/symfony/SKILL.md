---
name: symfony
description: >-
   You are an expert in Symfony, the enterprise PHP framework for building web
  applications and APIs. You help developers build production systems with
  Symfony's component architecture, Doctrine ORM, dependency injection, event
  system, security component, API Platform for REST/GraphQL, and Messenger for
  async processing — the backbone of enterprise PHP used by companies
  processing billions of requests.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - php
    - framework
    - enterprise
    - api
    - doctrine
    - dependency-injection
---

# Symfony — Enterprise PHP Framework

You are an expert in Symfony, the enterprise PHP framework for building web applications and APIs. You help developers build production systems with Symfony's component architecture, Doctrine ORM, dependency injection, event system, security component, API Platform for REST/GraphQL, and Messenger for async processing — the backbone of enterprise PHP used by companies processing billions of requests.

## Core Capabilities

### Controllers and Routing

```php
<?php
// src/Controller/UserController.php
namespace App\Controller;

use App\Entity\User;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Validator\Validator\ValidatorInterface;

#[Route('/api/users')]
class UserController extends AbstractController
{
    public function __construct(
        private UserRepository $users,
        private EntityManagerInterface $em,
        private ValidatorInterface $validator,
    ) {}

    #[Route('', methods: ['GET'])]
    public function list(Request $request): JsonResponse
    {
        $page = $request->query->getInt('page', 1);
        $limit = $request->query->getInt('limit', 20);
        $users = $this->users->findPaginated($page, $limit);
        return $this->json($users, 200, [], ['groups' => ['user:list']]);
    }

    #[Route('', methods: ['POST'])]
    public function create(Request $request): JsonResponse
    {
        $data = json_decode($request->getContent(), true);
        $user = new User();
        $user->setName($data['name']);
        $user->setEmail($data['email']);

        $errors = $this->validator->validate($user);
        if (count($errors) > 0) {
            return $this->json(['errors' => (string) $errors], 400);
        }

        $this->em->persist($user);
        $this->em->flush();
        return $this->json($user, 201, [], ['groups' => ['user:detail']]);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function show(User $user): JsonResponse
    {
        return $this->json($user, 200, [], ['groups' => ['user:detail']]);
    }
}
```

### Doctrine Entity

```php
<?php
// src/Entity/User.php
namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: 'users')]
class User
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    #[Groups(['user:list', 'user:detail'])]
    private ?int $id = null;

    #[ORM\Column(length: 100)]
    #[Assert\NotBlank, Assert\Length(min: 2, max: 100)]
    #[Groups(['user:list', 'user:detail'])]
    private string $name;

    #[ORM\Column(unique: true)]
    #[Assert\NotBlank, Assert\Email]
    #[Groups(['user:detail'])]
    private string $email;

    #[ORM\Column(type: 'datetime_immutable')]
    #[Groups(['user:detail'])]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    // Getters/setters...
}
```

### Messenger (Async Processing)

```php
<?php
// src/Message/SendWelcomeEmail.php
namespace App\Message;
class SendWelcomeEmail {
    public function __construct(public readonly int $userId) {}
}

// src/MessageHandler/SendWelcomeEmailHandler.php
namespace App\MessageHandler;
use Symfony\Component\Messenger\Attribute\AsMessageHandler;

#[AsMessageHandler]
class SendWelcomeEmailHandler {
    public function __invoke(SendWelcomeEmail $message): void {
        $user = $this->users->find($message->userId);
        $this->mailer->send(/* ... */);
    }
}

// Dispatch from controller:
$this->bus->dispatch(new SendWelcomeEmail($user->getId()));
```

## Installation

```bash
composer create-project symfony/skeleton my-app
cd my-app
composer require webapp                   # Full web app
# OR
composer require api                      # API only (API Platform)
```

## Best Practices

1. **Dependency injection** — Let Symfony autowire services; define interfaces for swappable implementations
2. **Doctrine migrations** — Use `bin/console doctrine:migrations:diff` to generate migrations from entity changes
3. **Serialization groups** — Use `#[Groups]` to control which fields are serialized per context (list vs detail)
4. **Validation** — Use constraint attributes on entities; validate before persisting
5. **Messenger for async** — Dispatch messages for heavy work (emails, reports); process with workers
6. **API Platform** — Use API Platform for instant REST/GraphQL CRUD from Doctrine entities; customize with attributes
7. **Security voters** — Use voters for authorization logic; cleaner than checking roles in controllers
8. **Events** — Use EventDispatcher for cross-cutting concerns; decouples components
