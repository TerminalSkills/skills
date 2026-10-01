---
name: kotlin-multiplatform
description: >-
  Kotlin Multiplatform (KMP) is JetBrains' technology for sharing Kotlin code
  between Android, iOS, web, and desktop applications while keeping the UI
  native on each platform. Use when a user asks to set up a KMP shared module,
  share business logic, networking or a data layer between Android and iOS,
  write expect/actual declarations, use Ktor or SQLDelight in commonMain, write
  a shared ViewModel, test shared code, or migrate a KMP project to Android
  Gradle Plugin 9.
license: Apache-2.0
compatibility: "Kotlin 2.4 on JDK 17 or newer; AGP 9.4 needs Gradle 9.6 or newer (AGP 9.0 needs 9.1). The Android target needs the Android SDK and AGP 9; building or testing iOS targets needs macOS with Xcode."
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
  - kotlin
  - kmp
  - cross-platform
  - mobile
  - ios
  repository: https://github.com/JetBrains/kotlin
---

# Kotlin Multiplatform — Shared Business Logic for Mobile

## Overview

Kotlin Multiplatform (KMP) compiles one Kotlin codebase for Android, iOS, desktop (JVM) and web. Business logic, networking and the data layer live in a shared module; each platform keeps its own UI (or shares it too with Compose Multiplatform). Platform differences are isolated behind `expect`/`actual` declarations.

## Instructions

### Project Structure

Create the project with the Kotlin Multiplatform wizard in IntelliJ IDEA or Android Studio (New Project > Kotlin Multiplatform). Shared code and app entry points are separate modules:

```
tasklane/
├── shared/                              # Kotlin Multiplatform module (build.gradle.kts below)
│   └── src/
│       ├── commonMain/kotlin/           # Platform-independent code
│       ├── commonMain/sqldelight/       # .sq files (SQLDelight)
│       ├── androidMain/, iosMain/, jvmMain/   # actuals per platform (iosMain comes from the default hierarchy)
│       └── jvmTest/kotlin/              # Tests that run on any machine
├── androidApp/                          # Android app (Jetpack Compose), depends on :shared
└── iosApp/                              # Xcode project (SwiftUI), links the Shared framework
```

### Gradle Setup

```kotlin
// shared/build.gradle.kts
plugins {
    kotlin("multiplatform") version "2.4.20"
    kotlin("plugin.serialization") version "2.4.20"
    id("app.cash.sqldelight") version "2.4.0"
    id("com.android.kotlin.multiplatform.library") version "9.4.1"
}
kotlin {
    jvm()
    android {                       // replaces androidTarget() and the top-level android {} block
        namespace = "com.tasklane.shared"
        compileSdk = 36
        minSdk = 24
    }
    listOf(iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "Shared"     // Swift: import Shared
            isStatic = true
        }
    }
    sourceSets {
        commonMain.dependencies {
            implementation("io.ktor:ktor-client-core:3.6.0")
            implementation("io.ktor:ktor-client-content-negotiation:3.6.0")
            implementation("io.ktor:ktor-serialization-kotlinx-json:3.6.0")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")
            implementation("app.cash.sqldelight:coroutines-extensions:2.4.0")
            implementation("org.jetbrains.androidx.lifecycle:lifecycle-viewmodel:2.11.0")
        }
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")
            implementation("io.ktor:ktor-client-mock:3.6.0")
        }
        // One HTTP engine and one SQLite driver per platform
        androidMain.dependencies { implementation("io.ktor:ktor-client-okhttp:3.6.0"); implementation("app.cash.sqldelight:android-driver:2.4.0") }
        jvmMain.dependencies { implementation("io.ktor:ktor-client-okhttp:3.6.0"); implementation("app.cash.sqldelight:sqlite-driver:2.4.0") }
        iosMain.dependencies { implementation("io.ktor:ktor-client-darwin:3.6.0"); implementation("app.cash.sqldelight:native-driver:2.4.0") }
    }
}
sqldelight { databases { create("TaskDatabase") { packageName.set("com.tasklane.db") } } }
```

Useful tasks: `./gradlew :shared:jvmTest` (shared tests on the JVM), `:shared:iosSimulatorArm64Test` (macOS only), `:shared:allTests`. Xcode builds the framework through a run-script phase that calls `./gradlew :shared:embedAndSignAppleFrameworkForXcode`.

### Local Database with SQLDelight

```sql
-- shared/src/commonMain/sqldelight/com/tasklane/db/Task.sq
-- SQLDelight generates TaskDatabase, TaskEntity and typed query functions from this file.
CREATE TABLE TaskEntity (
    id TEXT NOT NULL PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'TODO',
    pending_sync INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
selectAll:
SELECT * FROM TaskEntity ORDER BY created_at DESC;
upsert:
INSERT OR REPLACE INTO TaskEntity(id, title, status, created_at) VALUES (?, ?, ?, ?);
markPendingSync:
UPDATE TaskEntity SET pending_sync = 1 WHERE id = ?;
```

### Platform-Specific Code with expect/actual

```kotlin
// shared/src/commonMain/kotlin/com/tasklane/shared/Platform.kt
// 'expect' declares what each platform must implement.
expect fun platformName(): String
expect class DriverFactory {
    fun createDriver(): SqlDriver
}
// shared/src/androidMain/kotlin/com/tasklane/shared/Platform.android.kt
actual fun platformName(): String = "Android ${android.os.Build.VERSION.SDK_INT}"
actual class DriverFactory(private val context: Context) {
    actual fun createDriver(): SqlDriver = AndroidSqliteDriver(TaskDatabase.Schema, context, "tasks.db")
}
// shared/src/iosMain/kotlin/com/tasklane/shared/Platform.ios.kt
actual fun platformName(): String = UIDevice.currentDevice.systemName() + " " + UIDevice.currentDevice.systemVersion
actual class DriverFactory {
    actual fun createDriver(): SqlDriver = NativeSqliteDriver(TaskDatabase.Schema, "tasks.db")
}
// shared/src/jvmMain/kotlin/com/tasklane/shared/Platform.jvm.kt
actual fun platformName(): String = "JVM ${System.getProperty("java.version")}"
actual class DriverFactory {
    actual fun createDriver(): SqlDriver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY).also { TaskDatabase.Schema.create(it) }
}
```

Imports: `app.cash.sqldelight.db.SqlDriver`, `app.cash.sqldelight.driver.android.AndroidSqliteDriver`, `app.cash.sqldelight.driver.native.NativeSqliteDriver`, `app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver`, `platform.UIKit.UIDevice`.

### Networking with Ktor

```kotlin
// shared/src/commonMain/kotlin/com/tasklane/shared/TaskApi.kt
// (imports from io.ktor.client.*, io.ktor.http.*, kotlinx.serialization.* omitted)
@Serializable
data class TaskDto(val id: String, val title: String, val status: String, val createdAt: Long)

class TaskApi(baseUrl: String, authToken: String, engine: HttpClientEngine? = null) {
    private val config: HttpClientConfig<*>.() -> Unit = {
        install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) } // don't crash on extra API fields
        defaultRequest {
            url(baseUrl)
            bearerAuth(authToken)
            contentType(ContentType.Application.Json) // required for setBody(task)
        }
    }
    // Without an engine argument Ktor picks the one on the classpath: OkHttp on Android, Darwin on iOS
    private val client = if (engine != null) HttpClient(engine, config) else HttpClient(config)

    suspend fun fetchTasks(): List<TaskDto> = client.get("api/tasks").body()
    suspend fun createTask(task: TaskDto): TaskDto = client.post("api/tasks") { setBody(task) }.body()
}
```

### Shared Business Logic

```kotlin
// shared/src/commonMain/kotlin/com/tasklane/shared/TaskRepository.kt
// Runs on every target — write once, test once. Uses asFlow/mapToList from
// app.cash.sqldelight.coroutines and kotlin.time.Clock, kotlin.uuid.Uuid from the standard library.
class TaskRepository(private val api: TaskApi, db: TaskDatabase) {
    private val queries = db.taskQueries

    // Emits the cached list again whenever the table changes
    fun getTasks(): Flow<List<TaskEntity>> = queries.selectAll().asFlow().mapToList(Dispatchers.Default)

    // Pull the server state into the local cache
    suspend fun syncTasks() {
        val remote = api.fetchTasks()
        queries.transaction {
            remote.forEach { queries.upsert(it.id, it.title, it.status, it.createdAt) }
        }
    }

    // Save locally first; if the request fails, flag the row for a later sync
    suspend fun createTask(title: String): String {
        val task = TaskDto(Uuid.random().toString(), title, "TODO", Clock.System.now().toEpochMilliseconds())
        queries.upsert(task.id, task.title, task.status, task.createdAt)
        try { api.createTask(task) } catch (e: Exception) { queries.markPendingSync(task.id) }
        return task.id
    }
}
```

### ViewModel (Shared UI Logic)

```kotlin
// shared/src/commonMain/kotlin/com/tasklane/shared/TaskListViewModel.kt
// androidx.lifecycle.ViewModel is multiplatform; viewModelScope is cancelled when the ViewModel is cleared.
data class TaskListUiState(val tasks: List<TaskEntity> = emptyList(), val isLoading: Boolean = true, val error: String? = null)

class TaskListViewModel(private val repository: TaskRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(TaskListUiState())
    val uiState: StateFlow<TaskListUiState> = _uiState.asStateFlow()
    init {
        repository.getTasks()
            .onEach { tasks -> _uiState.update { it.copy(tasks = tasks, isLoading = false) } }
            .launchIn(viewModelScope)
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            try { repository.syncTasks() } catch (e: Exception) { _uiState.update { it.copy(error = e.message) } }
            _uiState.update { it.copy(isLoading = false) }
        }
    }
    fun createTask(title: String) { viewModelScope.launch { repository.createTask(title) } }
}
```

## Examples

### Example 1: Test the shared repository without an emulator

**User request:** "Add a test for the sync logic in our shared module that I can run on CI without Android or iOS devices."

```kotlin
// shared/src/jvmTest/kotlin/com/tasklane/shared/TaskRepositoryTest.kt
class TaskRepositoryTest {
    private val engine = MockEngine { request ->
        assertEquals("Bearer test-token", request.headers[HttpHeaders.Authorization])
        respond(
            content = """[{"id":"t1","title":"Ship v2","status":"TODO","createdAt":1790000000000,"assignee":"mira"}]""",
            headers = headersOf(HttpHeaders.ContentType, "application/json"),
        )
    }

    @Test
    fun syncStoresRemoteTasks() = runTest {
        val db = TaskDatabase(DriverFactory().createDriver()) // in-memory SQLite on the JVM
        val repository = TaskRepository(TaskApi("https://api.tasklane.dev/", "test-token", engine), db)
        repository.syncTasks()
        assertEquals(listOf("Ship v2"), repository.getTasks().first().map { it.title })
    }
}
```

`./gradlew :shared:jvmTest` compiles commonMain and jvmMain, generates the SQLDelight code and ends with `BUILD SUCCESSFUL`; the report is in `shared/build/reports/tests/jvmTest/index.html`. The unknown `assignee` field is ignored because of `ignoreUnknownKeys`.

### Example 2: Fix the build after upgrading to Android Gradle Plugin 9

**User request:** "After bumping AGP to 9 the build fails: The 'com.android.library' (or 'com.android.application') plugin is not compatible with the 'org.jetbrains.kotlin.multiplatform' plugin since AGP 9.0."

```diff
 // shared/build.gradle.kts
 plugins {
     kotlin("multiplatform") version "2.4.20"
-    id("com.android.library") version "9.4.1"
+    id("com.android.kotlin.multiplatform.library") version "9.4.1"
 }
 kotlin {
-    androidTarget()
+    android {
+        namespace = "com.tasklane.shared"
+        compileSdk = 36
+        minSdk = 24
+    }
 }
-android {
-    namespace = "com.tasklane.shared"
-    compileSdk = 36
-    defaultConfig { minSdk = 24 }
-}
```

Then move `src/main` to `src/androidMain`, `src/test` and `src/androidUnitTest` to `src/androidHostTest`, `src/androidTest` and `src/androidInstrumentedTest` to `src/androidDeviceTest`. Android tests are off until `withHostTest {}` or `withDeviceTest {}` is added inside `android {}`. Keep the application itself (`com.android.application`, `MainActivity`) in a separate `androidApp` module that depends on `:shared`. `./gradlew :shared:tasks` now configures and lists `assembleAndroidMain`.

## Guidelines

1. **Share logic, not UI** — Share business logic, networking, data layer in Kotlin; keep UI native (Jetpack Compose on Android, SwiftUI on iOS)
2. **expect/actual for platform APIs** — Use it for file system, biometrics, notifications. Check the standard library first: `kotlin.uuid.Uuid` and `kotlin.time.Clock`/`Instant` are common code (kotlinx-datetime 0.8 no longer ships `Instant` and `Clock`). `expect class` is still Beta and warns unless `-Xexpect-actual-classes` is set; `expect fun` is stable, and a plain interface implemented per platform avoids the warning
3. **Ktor for HTTP** — Ktor is the standard multiplatform HTTP client; it uses OkHttp on Android and URLSession (the Darwin engine) on iOS
4. **SQLDelight for local DB** — SQLDelight generates type-safe Kotlin from SQL; each target needs its own driver dependency
5. **Kotlin Serialization** — Use `@Serializable` data classes; works across all platforms unlike Gson or Moshi
6. **Coroutines + Flow** — Both are multiplatform. From Swift a `suspend` function is called with a completion handler or `async`; a `Flow` has no Swift counterpart, so expose callbacks or add SKIE or KMP-NativeCoroutines
7. **Start with the shared module** — Build it with tests first (`jvmTest` needs no device); then wrap it with platform UIs. `viewModelScope` uses `Dispatchers.Main`, which a desktop JVM app gets from `kotlinx-coroutines-swing`
8. **Compose Multiplatform for UI** — If you want shared UI too, use Compose Multiplatform (covers Android, iOS, desktop, web)
9. **AGP 9** — `com.android.library` and `com.android.application` no longer work in a multiplatform module. The Android-KMP library plugin has a single variant: no build types, product flavors or `BuildConfig`
10. **iOS needs a Mac** — iOS targets compile and test only on macOS with Xcode; on other hosts Gradle disables them with a warning. `iosX64` (Intel simulators) is a Tier 3 target; use `iosSimulatorArm64`
