---
name: unity
description: >-
   You are an expert in Unity, the most widely-used game engine for indie and
  mobile game development. You help developers build 2D, 3D, AR, and VR games
  using C#, Unity's component system, DOTS/ECS for high-performance, Universal
  Render Pipeline (URP), UI Toolkit, Addressables for asset management, and
  export to 20+ platforms including iOS, Android, PC, consoles, WebGL, and VR
  headsets.
category: Game Development
tags: [game-engine, c-sharp, 2d, 3d, mobile, cross-platform, indie, ar-vr]
version: 1.0.0
author: terminal-skills
---

# Unity — Cross-Platform Game Engine

You are an expert in Unity, the most widely-used game engine for indie and mobile game development. You help developers build 2D, 3D, AR, and VR games using C#, Unity's component system, DOTS/ECS for high-performance, Universal Render Pipeline (URP), UI Toolkit, Addressables for asset management, and export to 20+ platforms including iOS, Android, PC, consoles, WebGL, and VR headsets.

## Core Capabilities

### Component System

```csharp
// PlayerController.cs — MonoBehaviour component
using UnityEngine;

public class PlayerController : MonoBehaviour
{
    [Header("Movement")]
    [SerializeField] private float moveSpeed = 7f;      // Editable in Inspector
    [SerializeField] private float jumpForce = 12f;
    [SerializeField] private float gravity = -25f;

    [Header("Ground Check")]
    [SerializeField] private Transform groundCheck;
    [SerializeField] private float groundDistance = 0.2f;
    [SerializeField] private LayerMask groundMask;

    private CharacterController controller;
    private Vector3 velocity;
    private bool isGrounded;
    private Animator animator;
    private static readonly int IsRunning = Animator.StringToHash("IsRunning");
    private static readonly int IsJumping = Animator.StringToHash("IsJumping");

    private void Start()
    {
        controller = GetComponent<CharacterController>();
        animator = GetComponent<Animator>();
    }

    private void Update()
    {
        // Ground detection
        isGrounded = Physics.CheckSphere(groundCheck.position, groundDistance, groundMask);
        if (isGrounded && velocity.y < 0)
            velocity.y = -2f;                // Stick to ground

        // Movement input
        float x = Input.GetAxis("Horizontal");
        float z = Input.GetAxis("Vertical");
        Vector3 move = transform.right * x + transform.forward * z;
        controller.Move(move * (moveSpeed * Time.deltaTime));

        // Animation
        bool moving = move.magnitude > 0.1f;
        animator.SetBool(IsRunning, moving);

        // Jump
        if (Input.GetButtonDown("Jump") && isGrounded)
        {
            velocity.y = jumpForce;
            animator.SetBool(IsJumping, true);
        }

        // Gravity
        velocity.y += gravity * Time.deltaTime;
        controller.Move(velocity * Time.deltaTime);

        if (isGrounded)
            animator.SetBool(IsJumping, false);
    }
}
```

### ScriptableObjects (Data-Driven Design)

```csharp
// WeaponData.cs — Data container (no MonoBehaviour)
using UnityEngine;

[CreateAssetMenu(fileName = "NewWeapon", menuName = "Game/Weapon Data")]
public class WeaponData : ScriptableObject
{
    public string weaponName;
    public Sprite icon;
    public GameObject prefab;
    public float damage = 10f;
    public float attackSpeed = 1f;         // Attacks per second
    public float range = 2f;
    public AudioClip attackSound;
    public ParticleSystem hitEffect;
    [TextArea] public string description;
}

// Usage: create weapon assets in Project window
// Drag into Inspector fields — fully data-driven
```

### Events and Messaging

```csharp
// GameEvents.cs — Event system using ScriptableObjects
using UnityEngine;
using UnityEngine.Events;

[CreateAssetMenu(menuName = "Game/Event")]
public class GameEvent : ScriptableObject
{
    private readonly List<GameEventListener> listeners = new();

    public void Raise()
    {
        // Notify all listeners in reverse (safe for removal during iteration)
        for (int i = listeners.Count - 1; i >= 0; i--)
            listeners[i].OnEventRaised();
    }

    public void Register(GameEventListener listener) => listeners.Add(listener);
    public void Unregister(GameEventListener listener) => listeners.Remove(listener);
}

// GameEventListener.cs — Attach to any GameObject
public class GameEventListener : MonoBehaviour
{
    [SerializeField] private GameEvent gameEvent;
    [SerializeField] private UnityEvent response;

    private void OnEnable() => gameEvent.Register(this);
    private void OnDisable() => gameEvent.Unregister(this);
    public void OnEventRaised() => response.Invoke();
}
```

### Addressables (Asset Management)

```csharp
// Load assets asynchronously (no Resources folder!)
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

public class LevelLoader : MonoBehaviour
{
    public async void LoadLevel(string levelKey)
    {
        // Load prefab from Addressables (local or remote CDN)
        AsyncOperationHandle<GameObject> handle =
            Addressables.InstantiateAsync(levelKey);

        await handle.Task;

        if (handle.Status == AsyncOperationStatus.Succeeded)
            Debug.Log($"Loaded level: {levelKey}");
    }

    // Download content update from CDN
    public async void CheckForUpdates()
    {
        var checkHandle = Addressables.CheckForCatalogUpdates();
        await checkHandle.Task;

        if (checkHandle.Result.Count > 0)
        {
            var updateHandle = Addressables.UpdateCatalogs(checkHandle.Result);
            await updateHandle.Task;
            Debug.Log("Content updated from server!");
        }
    }
}
```

## Installation

```bash
# Download Unity Hub from https://unity.com/download
# Install editor version (LTS recommended)
# Personal license: FREE (revenue < $200K)
# Plus: $399/year, Pro: $2,040/year

# CLI builds (CI/CD)
unity -batchmode -nographics -projectPath ./MyGame \
  -buildTarget StandaloneWindows64 \
  -executeMethod BuildScript.Build
```

## Best Practices

1. **Component over inheritance** — Compose GameObjects from small, focused components; don't build deep class hierarchies
2. **ScriptableObjects for data** — Weapons, items, abilities as ScriptableObject assets; designers edit without code
3. **Addressables over Resources** — Use Addressables for async asset loading; supports CDN, DLC, and content updates
4. **Object pooling** — Pool bullets, particles, enemies; `Instantiate`/`Destroy` causes GC spikes
5. **URP for performance** — Use Universal Render Pipeline for mobile/VR; HDRP for high-end PC/console
6. **Assembly definitions** — Split code into assemblies; reduces recompile time from 30s to 2s
7. **Events for decoupling** — Use ScriptableObject events or C# events; avoid direct references between systems
8. **Profile always** — Use Unity Profiler and Frame Debugger; test on target hardware early and often
