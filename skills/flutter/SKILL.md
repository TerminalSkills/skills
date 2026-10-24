---
name: flutter
description: Expert guidance for Flutter, Google's UI toolkit for building natively compiled applications for mobile, web, and desktop from a single Dart codebase. Helps developers build performant cross-platform apps with custom widgets, state management, platform channels, and production deployment.
license: Apache-2.0
compatibility: Flutter 3.47 stable with Dart 3.13 (flutter_riverpod 3.x, go_router 18.x); an Android or iOS toolchain for mobile targets
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/flutter/flutter
  tags:
  - mobile
  - cross-platform
  - dart
  - ios
  - android
---

# Flutter — Cross-Platform UI Framework

## Overview

Flutter, Google's UI toolkit for building natively compiled applications for mobile, web, and desktop from a single Dart codebase. Helps developers build performant cross-platform apps with custom widgets, state management, platform channels, and production deployment.

## Instructions

### Project Setup

```bash
# Install Flutter (macOS; other systems: https://docs.flutter.dev/install)
brew install --cask flutter

# Verify installation and see which toolchains are missing
flutter doctor

flutter create fleet_tracker --org com.northwindlogistics --platforms ios,android,web
cd fleet_tracker

# Run in development
flutter run                    # Auto-detects connected device/emulator
flutter run -d chrome          # Run on web
flutter test                   # Unit and widget tests
```

The stable channel still ships `package:flutter/material.dart`. Material and Cupertino are being split into the `material_ui` and `cupertino_ui` packages; migrating is optional and done with `dart fix --apply --code=migrate_design_widgets`. Third-party packages that still import the old path keep working through `MaterialUiCompatibilityBridge` once you migrate.

### Widget Composition

```dart
// lib/screens/home_screen.dart — Composable widget architecture
// Flutter UIs are built by composing small, reusable widgets.

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.push('/notifications'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          // Pull-to-refresh logic
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: const [
            Text('Recent Activity', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            SizedBox(height: 12),
            ListTile(title: Text('Truck 14 left Rotterdam depot')),
            ListTile(title: Text('Truck 9 delivered order #4821')),
          ],
        ),
      ),
    );
  }
}
```

### State Management with Riverpod

```dart
// lib/providers/auth_provider.dart — Riverpod 3 (flutter_riverpod ^3.4)
// StateNotifier moved to flutter_riverpod/legacy.dart; use Notifier.

import 'package:flutter_riverpod/flutter_riverpod.dart';

class User {
  final String id;
  final String email;
  final String name;
  const User({required this.id, required this.email, required this.name});
  factory User.fromJson(Map<String, dynamic> j) =>
      User(id: j['id'] as String, email: j['email'] as String, name: j['name'] as String);
}

class AuthState {
  final User? user;
  final bool isLoading;
  final String? error;
  const AuthState({this.user, this.isLoading = false, this.error});
}

class AuthNotifier extends Notifier<AuthState> {
  @override
  AuthState build() => const AuthState();

  Future<void> login(String email, String password) async {
    state = const AuthState(isLoading: true);
    try {
      final response = await ref.read(apiClientProvider).post('/auth/login', {
        'email': email,
        'password': password,
      });
      state = AuthState(user: User.fromJson(response.data as Map<String, dynamic>));
    } catch (e) {
      state = AuthState(error: e.toString());
    }
  }

  void logout() => state = const AuthState();
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

final projectsProvider = FutureProvider<List<String>>((ref) async {
  final response = await ref.watch(apiClientProvider).get('/projects');
  return (response.data as List).cast<String>();
});
```

Wrap the app in `ProviderScope` (`runApp(const ProviderScope(child: MyApp()))`) and read state in a `ConsumerWidget`:

```dart
class ProjectList extends ConsumerWidget {
  const ProjectList({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectsProvider);
    return projects.when(
      data: (names) => ListView(children: [for (final n in names) ListTile(title: Text(n))]),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Could not load projects: $e')),
    );
  }
}
```

Riverpod 3 retries failing providers automatically with backoff, and `AsyncValue.valueOrNull` was removed (use `.value`).

### Navigation with GoRouter

```dart
// lib/router.dart — Declarative routing (go_router ^18)
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

final routerProvider = Provider<GoRouter>((ref) {
  // Tell the router to re-run redirect whenever the login state changes
  final loggedIn = ValueNotifier<bool>(ref.read(authProvider).user != null);
  ref.listen(authProvider, (_, next) => loggedIn.value = next.user != null);
  ref.onDispose(loggedIn.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: loggedIn,
    redirect: (context, state) {
      final isAuthRoute = state.matchedLocation.startsWith('/auth');
      if (!loggedIn.value && !isAuthRoute) return '/auth/login';
      if (loggedIn.value && isAuthRoute) return '/';
      return null; // No redirect needed
    },
    routes: [
      GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
      GoRoute(path: '/auth/login', builder: (_, __) => const LoginScreen()),
      GoRoute(
        path: '/project/:id',
        builder: (_, state) => ProjectScreen(id: state.pathParameters['id']!),
      ),
    ],
  );
});

// MaterialApp.router(routerConfig: ref.watch(routerProvider))
// Navigate with context.go('/project/42') or context.push('/settings').
// Bottom tabs with their own state: StatefulShellRoute.indexedStack.
```

### HTTP Client with Dio

```dart
// lib/services/api_client.dart — HTTP client with interceptors
import 'package:dio/dio.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

class ApiClient {
  late final Dio _dio;
  final _storage = const FlutterSecureStorage();

  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: 'https://api.northwindlogistics.com/v1',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
    ));

    // Auth interceptor — adds JWT to every request
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: 'auth_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          // Token expired — drop it so the router sends the user to login.
          // (Implement a refresh call here if your API issues refresh tokens.)
          await _storage.delete(key: 'auth_token');
        }
        handler.next(error);
      },
    ));
  }

  Future<Response<dynamic>> get(String path) => _dio.get(path);
  Future<Response<dynamic>> post(String path, dynamic data) => _dio.post(path, data: data);
}
```

### Platform Channels (Native Code)

Call native APIs through a `MethodChannel` (`const MethodChannel('com.northwindlogistics.fleet/battery')`, then `await channel.invokeMethod<int>('level')`); the Kotlin/Swift side must register a handler under the same channel name. Check pub.dev first: biometrics (`local_auth`), camera, location and storage already have maintained plugins.

## Installation

```bash
# macOS (Linux and Windows: follow https://docs.flutter.dev/install)
brew install --cask flutter

# Common packages (pub.dev, versions checked October 2026)
flutter pub add flutter_riverpod         # State management (3.x)
flutter pub add go_router                # Navigation (18.x)
flutter pub add dio                      # HTTP client (5.x)
flutter pub add flutter_secure_storage   # Tokens in Keychain/Keystore
flutter pub add freezed_annotation       # Immutable models, with:
flutter pub add --dev freezed build_runner
flutter pub add hive_ce hive_ce_flutter  # Local storage (the original `hive` package was last released in 2022)
```

## Examples

### Example 1: Login screen that gates the app

**User request:**

```
Add a login screen to my Flutter app. After a successful login it should open the dashboard, and logged-out users must not reach any other page.
```

The agent adds `flutter_riverpod`, `go_router`, `dio` and `flutter_secure_storage` with `flutter pub add`, creates `AuthNotifier` and `authProvider` as above, adds the `routerProvider` with `refreshListenable` and a `redirect` that sends logged-out users to `/auth/login`, and builds `LoginScreen` as a `ConsumerStatefulWidget` that calls `ref.read(authProvider.notifier).login(...)`. Because the router listens to `authProvider`, no manual `context.go('/')` is needed after login. `flutter analyze` should report no issues and `flutter run -d chrome` shows the login page first.

### Example 2: Fixing a build after upgrading Riverpod

**User request:**

```
After upgrading flutter_riverpod to 3.x my app says StateNotifierProvider isn't defined. How do I fix it?
```

The agent finds the `StateNotifier` classes with `grep -rn "StateNotifier" lib/` and rewrites each one as a `Notifier` (move the constructor's initial value into `build()`, replace `StateNotifierProvider(...)` with `NotifierProvider(MyNotifier.new)`). For a large codebase it can instead change the import to `package:flutter_riverpod/legacy.dart` as a stopgap. It then runs `flutter analyze` and `flutter test` and reports the remaining failures, such as code that used `valueOrNull`.

## Guidelines

1. **Composition over inheritance** — Build UIs by composing small widgets; extract widgets when a build method exceeds ~50 lines
2. **Riverpod for state** — Riverpod 3 (`Notifier`/`AsyncNotifier`) is a solid default for shared state; keep `setState` for state local to one widget. Do not start new code on `StateNotifier` (now in `legacy.dart`)
3. **const constructors** — Mark widgets as `const` when possible; Flutter skips rebuilding const widgets entirely
4. **GoRouter for navigation** — Declarative routing with deep links; use Navigator.push only for simple flows
5. **Separate business logic from UI** — Keep API calls, data processing in services/providers, not in widget build methods
6. **Platform-adaptive UI** — Use `defaultTargetPlatform` (from `package:flutter/foundation.dart`) instead of `dart:io` `Platform` when the code may run on web, where `dart:io` is unavailable
7. **Test at all levels** — Unit tests for logic, widget tests for UI, integration tests for flows; Flutter's test framework is built-in
8. **Flavors for environments** — Use `--dart-define` or flavors for dev/staging/prod configurations; never hardcode API URLs or secrets in source (read with `String.fromEnvironment('API_BASE')`); anything compiled into the app can be extracted
