---
name: flutter
description: Expert guidance for Flutter, Google's UI toolkit for building natively compiled applications for mobile, web, and desktop from a single Dart codebase. Helps developers build performant cross-platform apps with custom widgets, state management, platform channels, and production deployment.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
  - mobile
  - cross-platform
  - dart
  - ios
  - android
---

# Flutter — Cross-Platform UI Framework


## Overview

You are an expert in Flutter, Google's UI toolkit for building natively compiled applications for mobile, web, and desktop from a single Dart codebase. You help developers build performant cross-platform apps with custom widgets, state management, platform channels, and production deployment.

## Instructions

### Project Setup

```bash
# Install Flutter
# macOS
brew install flutter

# Verify installation
flutter doctor

# Create a new project
flutter create my_app --org com.example --platforms ios,android,web
cd my_app

# Run in development
flutter run                    # Auto-detects connected device/emulator
flutter run -d chrome          # Run on web
flutter run -d macos           # Run on desktop
```

### Widget Composition

```dart
// lib/screens/home_screen.dart — Composable widget architecture
// Flutter UIs are built by composing small, reusable widgets.

import 'package:flutter/material.dart';

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
            onPressed: () => Navigator.pushNamed(context, '/notifications'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          // Pull-to-refresh logic
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Stats cards row
            const Row(
              children: [
                Expanded(child: _StatCard(label: 'Revenue', value: '\$12,450', trend: '+12%')),
                SizedBox(width: 12),
                Expanded(child: _StatCard(label: 'Users', value: '1,234', trend: '+5%')),
              ],
            ),
            const SizedBox(height: 24),
            // Recent activity list
            const Text('Recent Activity', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            ...List.generate(10, (i) => _ActivityTile(index: i)),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.search), label: 'Search'),
          NavigationDestination(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String trend;

  const _StatCard({required this.label, required this.value, required this.trend});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 8),
            Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            Text(trend, style: TextStyle(color: trend.startsWith('+') ? Colors.green : Colors.red)),
          ],
        ),
      ),
    );
  }
}
```

### State Management with Riverpod

```dart
// lib/providers/auth_provider.dart — State management with Riverpod
// Riverpod is the recommended state management solution for Flutter.

import 'package:flutter_riverpod/flutter_riverpod.dart';

// User model
class User {
  final String id;
  final String email;
  final String name;
  User({required this.id, required this.email, required this.name});
}

// Auth state
class AuthState {
  final User? user;
  final bool isLoading;
  final String? error;
  const AuthState({this.user, this.isLoading = false, this.error});
}

// Auth notifier — manages login/logout state transitions
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState());

  Future<void> login(String email, String password) async {
    state = const AuthState(isLoading: true);
    try {
      final response = await apiClient.post('/auth/login', {
        'email': email,
        'password': password,
      });
      state = AuthState(user: User.fromJson(response.data));
    } catch (e) {
      state = AuthState(error: e.toString());
    }
  }

  void logout() {
    state = const AuthState();
  }
}

// Provider (global, accessible from any widget)
final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});

// Usage in a widget:
// final auth = ref.watch(authProvider);
// if (auth.isLoading) return CircularProgressIndicator();
// if (auth.user != null) return HomeScreen();
// return LoginScreen();
```

### Navigation with GoRouter

```dart
// lib/router.dart — Declarative routing
import 'package:go_router/go_router.dart';

final router = GoRouter(
  initialLocation: '/',
  redirect: (context, state) {
    final isLoggedIn = authProvider.currentUser != null;
    final isAuthRoute = state.matchedLocation.startsWith('/auth');

    if (!isLoggedIn && !isAuthRoute) return '/auth/login';
    if (isLoggedIn && isAuthRoute) return '/';
    return null;                       // No redirect needed
  },
  routes: [
    GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
    GoRoute(path: '/auth/login', builder: (_, __) => const LoginScreen()),
    GoRoute(
      path: '/project/:id',
      builder: (_, state) => ProjectScreen(id: state.pathParameters['id']!),
    ),
    ShellRoute(
      builder: (_, __, child) => ScaffoldWithNavBar(child: child),
      routes: [
        GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
        GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
      ],
    ),
  ],
);
```

### HTTP Client with Dio

```dart
// lib/services/api_client.dart — HTTP client with interceptors
import 'package:dio/dio.dart';

class ApiClient {
  late final Dio _dio;

  ApiClient() {
    _dio = Dio(BaseOptions(
      baseUrl: 'https://api.example.com/v1',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
    ));

    // Auth interceptor — adds JWT to every request
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await secureStorage.read(key: 'auth_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          // Token expired — try refresh
          final refreshed = await _refreshToken();
          if (refreshed) {
            return handler.resolve(await _dio.fetch(error.requestOptions));
          }
        }
        handler.next(error);
      },
    ));
  }

  Future<Response> get(String path, {Map<String, dynamic>? params}) =>
      _dio.get(path, queryParameters: params);

  Future<Response> post(String path, dynamic data) =>
      _dio.post(path, data: data);
}
```

### Platform Channels (Native Code)

```dart
// lib/services/biometric_service.dart — Call native APIs
import 'package:flutter/services.dart';

class BiometricService {
  static const _channel = MethodChannel('com.example/biometric');

  /// Check if device supports biometric authentication
  Future<bool> isAvailable() async {
    return await _channel.invokeMethod('isAvailable') ?? false;
  }

  /// Authenticate with fingerprint or face
  Future<bool> authenticate(String reason) async {
    return await _channel.invokeMethod('authenticate', {'reason': reason}) ?? false;
  }
}
```

## Installation

```bash
# macOS
brew install flutter

# Or download from https://docs.flutter.dev/get-started/install

# Common packages
flutter pub add flutter_riverpod    # State management
flutter pub add go_router           # Navigation
flutter pub add dio                 # HTTP client
flutter pub add freezed_annotation  # Immutable models
flutter pub add hive                # Local storage
```


## Examples

### Example 1

**User request:** "Help me set up Flutter"

The agent follows the instructions above to configure Flutter with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Flutter configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Composition over inheritance** — Build UIs by composing small widgets; extract widgets when a build method exceeds ~50 lines
2. **Riverpod for state** — Use Riverpod over setState/Provider; it's compile-safe, testable, and handles async naturally
3. **const constructors** — Mark widgets as `const` when possible; Flutter skips rebuilding const widgets entirely
4. **GoRouter for navigation** — Declarative routing with deep linking support; avoid Navigator.push for anything beyond simple flows
5. **Separate business logic from UI** — Keep API calls, data processing in services/providers, not in widget build methods
6. **Platform-adaptive UI** — Use `Platform.isIOS` / `Platform.isAndroid` for platform-specific behavior; Material and Cupertino widgets for native feel
7. **Test at all levels** — Unit tests for logic, widget tests for UI, integration tests for flows; Flutter's test framework is built-in
8. **Flavors for environments** — Use `--dart-define` or flavors for dev/staging/prod configurations; never hardcode API URLs
