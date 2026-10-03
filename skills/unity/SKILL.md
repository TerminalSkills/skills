---
name: unity
description: >-
  Unity is a cross-platform game engine for 2D, 3D, AR and VR games, scripted in C# with a component system, Universal Render Pipeline, UI Toolkit, Addressables and DOTS. Use when a user asks to write Unity C# scripts, build a player controller, use ScriptableObjects or Addressables, set up input, run headless builds in CI, or pick a Unity version and licence.
license: Apache-2.0
compatibility: "Unity 6 (6000.x, 6.3 LTS) via Unity Hub on Windows, macOS or Linux; C# 9 scripting. Headless builds still need an activated licence."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - unity
    - game-engine
    - c-sharp
    - mobile
    - cross-platform
---

# Unity

## Overview

Unity is a game engine and editor. A scene holds GameObjects; behaviour comes from components, mostly C# `MonoBehaviour` scripts. It builds to desktop, iOS, Android, WebGL, consoles and XR headsets. The current line is Unity 6 (version numbers `6000.x`; 6.3 is a long-term-support release). Projects created before Unity 6 keep working, but several APIs were renamed (see Guidelines).

Licensing as published on unity.com: Unity Personal is free for organisations with less than $200K revenue and funding in the last 12 months; Unity Pro (about $2,310 per seat per year) is required above that; Enterprise is for companies above $25M. The old Unity Plus plan no longer appears. Check the compare-plans page before quoting numbers.

Most agent work here is writing scripts and editor tooling under `Assets/`, so the examples are C#. Unity regenerates `.csproj` files and `Library/`; commit `Assets/`, `Packages/` and `ProjectSettings/`, not `Library/`, `Temp/` or `Logs/`.

## Instructions

### Install and open a project

Install Unity Hub from unity.com/download, then add an editor version (pick an LTS release) with the platform modules you need (Android Build Support, iOS, WebGL). Create projects from the Hub templates; the Universal 3D and Universal 2D templates use URP. Pin the editor version in `ProjectSettings/ProjectVersion.txt` and keep everyone on the same one.

### A character controller with the Input System

New Unity 6 projects use the Input System package. If a project is set to "Input System Package (New)" under Edit > Project Settings > Player > Other Settings > Active Input Handling, calling the legacy `Input.GetAxis` or `Input.GetKey` throws an `InvalidOperationException` at runtime. Use input actions, or set the option to "Both" for old code.

```csharp
// Assets/Scripts/PlayerController.cs
using UnityEngine;
using UnityEngine.InputSystem;

[RequireComponent(typeof(CharacterController))]
public class PlayerController : MonoBehaviour
{
    [Header("Movement")]
    [SerializeField] private float moveSpeed = 7f;
    [SerializeField] private float jumpHeight = 1.6f;
    [SerializeField] private float gravity = -25f;

    [Header("Input (assign actions from an Input Actions asset)")]
    [SerializeField] private InputActionReference move;   // Vector2
    [SerializeField] private InputActionReference jump;   // Button

    private CharacterController controller;
    private Vector3 velocity;

    private void Awake() => controller = GetComponent<CharacterController>();

    private void OnEnable()  { move.action.Enable();  jump.action.Enable(); }
    private void OnDisable() { move.action.Disable(); jump.action.Disable(); }

    private void Update()
    {
        if (controller.isGrounded && velocity.y < 0f)
            velocity.y = -2f;                       // keeps the controller grounded

        Vector2 input = move.action.ReadValue<Vector2>();
        Vector3 direction = transform.right * input.x + transform.forward * input.y;
        controller.Move(direction * (moveSpeed * Time.deltaTime));

        if (jump.action.WasPressedThisFrame() && controller.isGrounded)
            velocity.y = Mathf.Sqrt(jumpHeight * -2f * gravity);

        velocity.y += gravity * Time.deltaTime;
        controller.Move(velocity * Time.deltaTime);
    }
}
```

Use `Update` for input and non-physics logic, `FixedUpdate` for Rigidbody forces, and cache `GetComponent` results in `Awake`.

### ScriptableObjects for data

```csharp
// Assets/Scripts/WeaponData.cs
using UnityEngine;

[CreateAssetMenu(fileName = "NewWeapon", menuName = "Game/Weapon Data")]
public class WeaponData : ScriptableObject
{
    public string weaponName = "Iron Sword";
    public Sprite icon;
    public GameObject prefab;
    public float damage = 12f;
    public float attacksPerSecond = 1.5f;
    public float range = 2f;
    public AudioClip attackSound;
    [TextArea] public string description;
}
```

Create assets with Assets > Create > Game > Weapon Data and drag them into inspector fields. Do not write to a ScriptableObject at runtime for save data: changes persist in the Editor but not in builds. Copy values into plain C# classes and serialize those.

### Events between systems

```csharp
// Assets/Scripts/GameEvent.cs
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;

[CreateAssetMenu(menuName = "Game/Event")]
public class GameEvent : ScriptableObject
{
    private readonly List<GameEventListener> listeners = new();

    public void Raise()
    {
        for (int i = listeners.Count - 1; i >= 0; i--)   // safe if a listener unregisters
            listeners[i].OnEventRaised();
    }
    public void Register(GameEventListener l) => listeners.Add(l);
    public void Unregister(GameEventListener l) => listeners.Remove(l);
}

public class GameEventListener : MonoBehaviour
{
    [SerializeField] private GameEvent gameEvent;
    [SerializeField] private UnityEvent response;

    private void OnEnable()  => gameEvent.Register(this);
    private void OnDisable() => gameEvent.Unregister(this);
    public void OnEventRaised() => response.Invoke();
}
```

Put each `MonoBehaviour` in a file with the same name as the class (`GameEventListener.cs`), or Unity cannot attach it. The listing above shows two classes only for brevity.

### Addressables

Install the Addressables package from Package Manager, mark assets as Addressable, and set groups in Window > Asset Management > Addressables > Groups. Load and release explicitly:

```csharp
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

public class LevelLoader : MonoBehaviour
{
    private GameObject currentLevel;

    public async Task LoadLevel(string levelKey)
    {
        AsyncOperationHandle<GameObject> handle = Addressables.InstantiateAsync(levelKey);
        await handle.Task;
        if (handle.Status == AsyncOperationStatus.Succeeded)
            currentLevel = handle.Result;
        else
            Debug.LogError($"Could not load {levelKey}: {handle.OperationException}");
    }

    public void UnloadLevel()
    {
        if (currentLevel != null) Addressables.ReleaseInstance(currentLevel);  // not Destroy
        currentLevel = null;
    }

    public async Task UpdateRemoteContent()
    {
        var check = Addressables.CheckForCatalogUpdates(false);
        await check.Task;
        if (check.Result.Count > 0)
            await Addressables.UpdateCatalogs(check.Result).Task;
        Addressables.Release(check);
    }
}
```

### Headless builds in CI

Put the build method in an `Editor` folder and call it from the command line:

```csharp
// Assets/Editor/BuildScript.cs
using UnityEditor;
using UnityEditor.Build.Reporting;

public static class BuildScript
{
    public static void Build()
    {
        var options = new BuildPlayerOptions
        {
            scenes = new[] { "Assets/Scenes/Main.unity" },
            locationPathName = "Builds/Win64/Skyline.exe",
            target = BuildTarget.StandaloneWindows64,
        };
        BuildReport report = BuildPipeline.BuildPlayer(options);
        EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
    }
}
```

```bash
Unity -batchmode -nographics -quit -projectPath ./Skyline \
  -buildTarget StandaloneWindows64 -executeMethod BuildScript.Build \
  -logFile - -accept-apiupdate
```

The editor must be activated for batch mode (a Pro or Personal licence, activated with `-username`/`-serial` or a licence file from the Hub). Only one editor instance can open a project at a time. A non-zero exit code means a failure; read the log. For CI, the open-source GameCI Docker images and GitHub Actions wrap this.

## Examples

### Example 1: Add a jump to the player

Request: "My character walks but can't jump, and I get an InvalidOperationException about UnityEngine.Input."

The project uses the new Input System, so legacy `Input` calls throw. Replace them with the `PlayerController` above: create an Input Actions asset with a `Move` (Vector2) and a `Jump` (Button) action, assign both to the component, and press Play. The error disappears and Space or the gamepad south button now jumps about 1.6 units.

### Example 2: Load a level from a CDN

Request: "Ship levels as downloadable content so the app stays under 150 MB."

Mark each level prefab Addressable in a "Levels" group, set the group's build and load paths to Remote, host the build output folder on a CDN, and call `LevelLoader.UpdateRemoteContent()` on startup followed by `LoadLevel("Level_03")`. The first launch downloads the catalog and bundles; later launches use the cache.

## Guidelines

- Pitfalls with Unity 6: `Rigidbody.velocity` is now `linearVelocity` (and `drag` is `linearDamping`); `FindObjectOfType` is deprecated in favour of `FindFirstObjectByType`.
- Avoid `Resources` folders and `Find` calls in `Update`; pool frequently spawned objects instead of `Instantiate`/`Destroy` to avoid garbage-collection spikes.
- Release every Addressables handle you create, or the memory stays loaded.
- Use the Profiler and Frame Debugger on real target hardware early; the Editor is not representative for mobile.
- Split code into assembly definitions to cut script recompile time.
- URP suits mobile, VR and most projects; HDRP is for high-end PC and console.
- Do not edit `.meta` files or `Library/` by hand, and keep `.meta` files in version control; missing ones break asset references.
- Pre-Unity 6 or Unity 2022 tutorials show `UnityEngine.Input` and the Built-in Render Pipeline; check the project's editor version first.
- For a code-first alternative with a smaller footprint see Godot; Unity is the better fit when you need its console, XR or asset-store ecosystem.
