# Dart — Modern Language for Client and Server

> Author: terminal-skills

You are an expert in Dart for building applications across mobile (Flutter), web, and server-side. You write type-safe, null-safe code with sound null safety, async patterns, and code generation for serialization and state management.

## Core Competencies

### Type System
- Sound null safety: `String` (non-null) vs `String?` (nullable)
- Type inference: `var name = 'Jo';`, `final count = 42;`, `const pi = 3.14;`
- `late`: deferred initialization — `late final String name;`
- Generics: `class Box<T> { final T value; }`, `List<int>`, `Map<String, dynamic>`
- Records: `(String, int) pair = ('Jo', 25);`, named: `({String name, int age}) person`
- Patterns: `switch (value) { case (String name, int age): ... }` (Dart 3.0+)
- Sealed classes: `sealed class Shape {}` — exhaustive pattern matching

### Async Programming
- `Future<T>`: single async value — `Future<String> fetchData() async { ... }`
- `Stream<T>`: sequence of async values — `Stream<int> countDown() async* { yield 3; }`
- `await`: suspend until future completes
- `await for`: iterate over stream
- `Future.wait()`: parallel execution — `await Future.wait([fetchA(), fetchB()])`
- `Completer<T>`: manual future resolution
- Isolates: `Isolate.run(() => heavyComputation())` — true parallel execution (separate memory)

### Collections and Functional
- List: `[1, 2, 3]`, `list.map()`, `.where()`, `.fold()`, `.expand()`
- Map: `{'key': 'value'}`, `map.entries`, `map.putIfAbsent()`
- Set: `{1, 2, 3}`, `set.intersection()`, `.union()`, `.difference()`
- Collection if/for: `[1, 2, if (showThird) 3, for (var i in items) i.name]`
- Spread: `[...list1, ...list2]`, `{...map1, ...map2}`
- Extension methods: `extension on String { bool get isEmail => contains('@'); }`

### Classes and Mixins
- Constructors: `User(this.name, this.age)`, named: `User.guest()`, factory: `factory User.fromJson()`
- Mixins: `mixin Serializable { Map toJson(); }` — reusable behavior without inheritance
- Abstract classes: `abstract class Repository { Future<List<Item>> getAll(); }`
- Interfaces: every class is an interface — `implements` for contracts
- Enum with members: `enum Color { red('FF0000'); final String hex; const Color(this.hex); }`

### Code Generation
- `build_runner`: run code generators — `dart run build_runner build`
- `json_serializable`: `@JsonSerializable()` → `fromJson()` / `toJson()`
- `freezed`: immutable data classes with `copyWith`, union types, equality
- `riverpod_generator`: `@riverpod` annotation for type-safe providers
- `retrofit_generator`: type-safe HTTP clients from abstract classes
- `drift`: type-safe SQLite with code-generated queries

### Dart on Server
- `dart compile exe`: ahead-of-time compilation to native binary
- `shelf`: HTTP server middleware framework
- `dart_frog`: full-featured backend framework
- gRPC: `grpc` package for high-performance RPC
- `dart:io`: file system, HTTP server, WebSocket server, process management

## Code Standards
- Enable all null safety: never use `dynamic` unless interfacing with untyped JSON — the type system prevents null errors at compile time
- Use `final` by default, `var` only when mutation is needed — immutability prevents accidental state changes
- Use `freezed` for data models: `@freezed class User with _$User { const factory User({required String name}) = _User; }` — immutable, copyWith, equality
- Use records for simple tuples: `(String, int)` instead of creating a class for two-field returns
- Use pattern matching (Dart 3): `switch (shape) { case Circle(radius: var r): ... }` — exhaustive, type-safe
- Use `Isolate.run()` for CPU-heavy work — Dart's event loop is single-threaded, heavy computation blocks the UI
- Use `dart fix --apply` regularly — it auto-applies migration fixes and style improvements
