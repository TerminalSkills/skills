---
name: kotlin-multiplatform
description: Expert guidance for Kotlin Multiplatform (KMP), JetBrains' technology for sharing code between Android, iOS, web, and desktop applications. Helps developers build shared business logic, networking, and data layers in Kotlin while keeping UI native on each platform.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
  - kotlin
  - kmp
  - cross-platform
  - mobile
  - ios
---

# Kotlin Multiplatform — Shared Business Logic for Mobile


## Overview

You are an expert in Kotlin Multiplatform (KMP), JetBrains' technology for sharing code between Android, iOS, web, and desktop applications. You help developers build shared business logic, networking, and data layers in Kotlin while keeping UI native on each platform.

## Instructions

### Project Structure

```
my-kmp-app/
├── shared/                              # Shared Kotlin code
│   └── src/
│       ├── commonMain/                  # Platform-independent code
│       │   └── kotlin/com/example/
│       │       ├── data/                # Repositories, models
│       │       ├── domain/              # Use cases, business logic
│       │       └── network/             # API clients
│       ├── androidMain/                 # Android-specific implementations
│       │   └── kotlin/com/example/
│       │       └── platform/
│       └── iosMain/                     # iOS-specific implementations
│           └── kotlin/com/example/
│               └── platform/
├── androidApp/                          # Android app (Jetpack Compose)
├── iosApp/                              # iOS app (SwiftUI)
└── build.gradle.kts
```

### Shared Business Logic

```kotlin
// shared/src/commonMain/kotlin/com/example/domain/TaskRepository.kt
// This code runs on BOTH Android and iOS — write once, test once.

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class TaskRepository(
    private val api: TaskApi,
    private val db: TaskDatabase,
) {
    /**
     * Get all tasks, fetching from API and caching in local DB.
     * Returns a Flow that emits updates when data changes.
     */
    fun getTasks(): Flow<List<Task>> {
        return db.observeAll().map { entities ->
            entities.map { it.toTask() }
        }
    }

    /**
     * Sync tasks from the remote API to the local database.
     * Called on app launch and pull-to-refresh.
     */
    suspend fun syncTasks() {
        val remoteTasks = api.fetchTasks()
        db.upsertAll(remoteTasks.map { it.toEntity() })
    }

    /**
     * Create a new task — saves locally and syncs to server.
     * If offline, saves locally and syncs when connection returns.
     */
    suspend fun createTask(title: String, priority: Priority): Task {
        val task = Task(
            id = generateUuid(),
            title = title,
            priority = priority,
            status = TaskStatus.TODO,
            createdAt = Clock.System.now(),
        )
        db.insert(task.toEntity())

        try {
            api.createTask(task.toRequest())
        } catch (e: Exception) {
            // Queue for sync when online
            db.markPendingSync(task.id)
        }

        return task
    }

    suspend fun updateStatus(taskId: String, status: TaskStatus) {
        db.updateStatus(taskId, status)
        try {
            api.updateTask(taskId, UpdateTaskRequest(status = status))
        } catch (e: Exception) {
            db.markPendingSync(taskId)
        }
    }
}
```

### Networking with Ktor

```kotlin
// shared/src/commonMain/kotlin/com/example/network/TaskApi.kt
// Ktor is Kotlin's multiplatform HTTP client — same code on Android/iOS.

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.client.request.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json

class TaskApi(private val baseUrl: String, private val authToken: String) {
    private val client = HttpClient {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true    // Don't crash on extra API fields
                isLenient = true
            })
        }
        defaultRequest {
            header("Authorization", "Bearer $authToken")
        }
    }

    suspend fun fetchTasks(): List<TaskResponse> {
        return client.get("$baseUrl/api/tasks").body()
    }

    suspend fun createTask(request: CreateTaskRequest): TaskResponse {
        return client.post("$baseUrl/api/tasks") {
            setBody(request)
        }.body()
    }

    suspend fun updateTask(id: String, request: UpdateTaskRequest): TaskResponse {
        return client.patch("$baseUrl/api/tasks/$id") {
            setBody(request)
        }.body()
    }
}
```

### Platform-Specific Code with expect/actual

```kotlin
// shared/src/commonMain/kotlin/com/example/platform/Platform.kt
// 'expect' declares what each platform must implement.

expect fun generateUuid(): String
expect fun getPlatformName(): String

// shared/src/androidMain/kotlin/com/example/platform/Platform.kt
actual fun generateUuid(): String = java.util.UUID.randomUUID().toString()
actual fun getPlatformName(): String = "Android ${android.os.Build.VERSION.SDK_INT}"

// shared/src/iosMain/kotlin/com/example/platform/Platform.kt
import platform.Foundation.NSUUID
import platform.UIKit.UIDevice

actual fun generateUuid(): String = NSUUID().UUIDString()
actual fun getPlatformName(): String = UIDevice.currentDevice.systemName() +
    " " + UIDevice.currentDevice.systemVersion
```

### Local Database with SQLDelight

```kotlin
// shared/src/commonMain/sqldelight/com/example/db/Task.sq
// SQLDelight generates type-safe Kotlin from SQL — works on all platforms.

CREATE TABLE TaskEntity (
    id TEXT NOT NULL PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    pending_sync INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

selectAll:
SELECT * FROM TaskEntity ORDER BY created_at DESC;

insert:
INSERT OR REPLACE INTO TaskEntity(id, title, status, priority, created_at)
VALUES (?, ?, ?, ?, ?);

updateStatus:
UPDATE TaskEntity SET status = ? WHERE id = ?;

markPendingSync:
UPDATE TaskEntity SET pending_sync = 1 WHERE id = ?;

getPendingSync:
SELECT * FROM TaskEntity WHERE pending_sync = 1;
```

### ViewModel (Shared UI Logic)

```kotlin
// shared/src/commonMain/kotlin/com/example/viewmodel/TaskListViewModel.kt
// Shared ViewModel — both Android and iOS consume this.

import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class TaskListViewModel(private val repository: TaskRepository) {
    private val _uiState = MutableStateFlow(TaskListUiState())
    val uiState: StateFlow<TaskListUiState> = _uiState.asStateFlow()

    init {
        // Observe local database changes
        repository.getTasks()
            .onEach { tasks ->
                _uiState.update { it.copy(tasks = tasks, isLoading = false) }
            }
            .launchIn(viewModelScope)

        // Initial sync from server
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                repository.syncTasks()
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    fun createTask(title: String, priority: Priority) {
        viewModelScope.launch {
            repository.createTask(title, priority)
        }
    }
}

data class TaskListUiState(
    val tasks: List<Task> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
)
```

## Installation

```kotlin
// build.gradle.kts (shared module)
plugins {
    kotlin("multiplatform")
    kotlin("plugin.serialization")
    id("app.cash.sqldelight")
}

kotlin {
    androidTarget()
    iosX64()
    iosArm64()
    iosSimulatorArm64()

    sourceSets {
        commonMain.dependencies {
            implementation("io.ktor:ktor-client-core:2.3.7")
            implementation("io.ktor:ktor-client-content-negotiation:2.3.7")
            implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.7")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.0")
            implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.5.0")
            implementation("app.cash.sqldelight:coroutines-extensions:2.0.1")
        }
        androidMain.dependencies {
            implementation("io.ktor:ktor-client-okhttp:2.3.7")
            implementation("app.cash.sqldelight:android-driver:2.0.1")
        }
        iosMain.dependencies {
            implementation("io.ktor:ktor-client-darwin:2.3.7")
            implementation("app.cash.sqldelight:native-driver:2.0.1")
        }
    }
}
```


## Examples

### Example 1

**User request:** "Help me set up Kotlin Multiplatform"

The agent follows the instructions above to configure Kotlin Multiplatform with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Kotlin Multiplatform configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Share logic, not UI** — Share business logic, networking, data layer in Kotlin; keep UI native (Jetpack Compose on Android, SwiftUI on iOS)
2. **expect/actual for platform APIs** — Use expect/actual for platform-specific code (file system, biometrics, notifications)
3. **Ktor for HTTP** — Ktor is the standard multiplatform HTTP client; it uses OkHttp on Android and URLSession on iOS under the hood
4. **SQLDelight for local DB** — SQLDelight generates type-safe Kotlin from SQL; works on all platforms with platform-specific drivers
5. **Kotlin Serialization** — Use `@Serializable` data classes; works across all platforms unlike Gson or Moshi
6. **Coroutines + Flow** — Use Kotlin Coroutines for async work and Flow for reactive streams; both are fully multiplatform
7. **Start with shared module** — Build the shared module with tests first; then wrap with platform UIs
8. **Compose Multiplatform for UI** — If you want shared UI too, use Compose Multiplatform (covers Android, iOS, desktop, web)
