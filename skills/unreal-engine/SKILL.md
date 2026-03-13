---
name: unreal-engine
category: Game Development
tags: [game-engine, 3d, aaa, c++, blueprints, rendering, cross-platform, epic]
version: 1.0.0
author: terminal-skills
---

# Unreal Engine — AAA Game Engine

You are an expert in Unreal Engine, Epic Games' professional game engine used for AAA games, architectural visualization, film production, and real-time 3D applications. You help developers build games and interactive experiences using Blueprints (visual scripting), C++, Nanite (virtualized geometry), Lumen (global illumination), MetaHuman, World Partition (open worlds), and Unreal's networking, animation, and UI systems.

## Core Capabilities

### Blueprints (Visual Scripting)

```markdown
## Blueprint System

Blueprints let designers create game logic without C++:

### Blueprint Types
- **Actor Blueprint**: Game objects (characters, items, doors)
- **Widget Blueprint**: UI elements (health bars, menus, HUD)
- **Animation Blueprint**: State machines for character animation
- **Game Mode Blueprint**: Game rules (scoring, win conditions)
- **Level Blueprint**: Level-specific logic (triggers, sequences)

### Common Patterns
- Event BeginPlay → Initialize variables, spawn actors
- Event Tick → Per-frame logic (avoid for performance)
- Custom Events → Reusable function-like nodes
- Event Dispatchers → Observer pattern (like signals in Godot)
- Interfaces → Communication between unrelated actors

### Performance
- Nativize Blueprints → compile to C++ for shipping
- Avoid Tick when possible → use Timers or Events
- Cast is expensive → use Interfaces for polymorphism
```

### C++ Gameplay

```cpp
// MyCharacter.h — C++ character with exposed Blueprint properties
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "MyCharacter.generated.h"

UCLASS()
class MYGAME_API AMyCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    AMyCharacter();

    // Exposed to Blueprint editor
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
    float MaxHealth = 100.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Stats")
    float CurrentHealth;

    UPROPERTY(EditDefaultsOnly, Category = "Combat")
    float AttackDamage = 25.0f;

    // Called from Blueprint
    UFUNCTION(BlueprintCallable, Category = "Combat")
    void TakeDamage(float Damage, AActor* DamageCauser);

    // Event that Blueprint can override
    UFUNCTION(BlueprintNativeEvent, Category = "Combat")
    void OnDeath();

protected:
    virtual void BeginPlay() override;
    virtual void Tick(float DeltaTime) override;
    virtual void SetupPlayerInputComponent(UInputComponent* Input) override;

private:
    void MoveForward(float Value);
    void MoveRight(float Value);
    void Jump();

    UPROPERTY(VisibleAnywhere)
    class UCameraComponent* CameraComp;

    UPROPERTY(VisibleAnywhere)
    class USpringArmComponent* SpringArmComp;
};
```

```cpp
// MyCharacter.cpp
#include "MyCharacter.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/CharacterMovementComponent.h"

AMyCharacter::AMyCharacter()
{
    PrimaryActorTick.bCanEverTick = true;

    // Camera setup
    SpringArmComp = CreateDefaultSubobject<USpringArmComponent>(TEXT("SpringArm"));
    SpringArmComp->SetupAttachment(RootComponent);
    SpringArmComp->TargetArmLength = 300.0f;
    SpringArmComp->bUsePawnControlRotation = true;

    CameraComp = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    CameraComp->SetupAttachment(SpringArmComp);

    GetCharacterMovement()->MaxWalkSpeed = 600.0f;
    GetCharacterMovement()->JumpZVelocity = 500.0f;
}

void AMyCharacter::BeginPlay()
{
    Super::BeginPlay();
    CurrentHealth = MaxHealth;
}

void AMyCharacter::TakeDamage(float Damage, AActor* DamageCauser)
{
    CurrentHealth = FMath::Max(0.0f, CurrentHealth - Damage);
    if (CurrentHealth <= 0.0f)
    {
        OnDeath();                        // Blueprint can override this
    }
}

void AMyCharacter::OnDeath_Implementation()
{
    // Default C++ implementation
    // Blueprint can override with custom death animation/VFX
    DisableInput(Cast<APlayerController>(GetController()));
    GetMesh()->SetSimulatePhysics(true);  // Ragdoll
}
```

### Key Systems

```markdown
## Rendering
- **Nanite**: Virtualized geometry — billions of triangles, no LODs needed
- **Lumen**: Dynamic global illumination + reflections (no baking)
- **Virtual Shadow Maps**: High-quality shadows at any scale
- **MetaHuman**: Photorealistic digital humans

## Open World
- **World Partition**: Auto-streaming of world chunks
- **Level Instancing**: Reuse level chunks procedurally
- **Data Layers**: Toggle content layers (gameplay, cinematic, debug)

## Animation
- **Control Rig**: Procedural animation + IK
- **Animation Blueprints**: State machine for blending animations
- **Motion Matching**: AI-driven animation selection
- **Live Link**: Real-time mocap streaming

## Multiplayer
- **Replication**: Server-authoritative networking
- **Gameplay Ability System**: Multiplayer-ready abilities
- **EOS (Epic Online Services)**: Matchmaking, lobbies, voice
```

## Installation

```bash
# Download Epic Games Launcher → Unreal Engine tab
# Or build from source (requires GitHub access):
git clone https://github.com/EpicGames/UnrealEngine.git
cd UnrealEngine && ./Setup.sh && ./GenerateProjectFiles.sh && make

# CLI builds
UnrealBuildTool -project=MyGame.uproject -configuration=Shipping -platform=Win64
```

## Best Practices

1. **Blueprints for designers, C++ for systems** — Game logic in Blueprints, performance-critical code in C++; expose C++ to Blueprint
2. **Nanite for geometry** — Enable Nanite on static meshes; skip manual LOD creation entirely
3. **Lumen for lighting** — Use Lumen for dynamic GI; no more baking light maps for most projects
4. **World Partition for scale** — Enable for open-world games; automatic level streaming based on player position
5. **Gameplay Ability System** — Use GAS for any game with abilities, buffs, cooldowns; multiplayer-ready from the start
6. **Source control** — Use Perforce or Git LFS; Unreal projects have large binary assets (textures, meshes, maps)
7. **Data-driven design** — Use Data Tables and Data Assets for game balance; designers edit without recompiling
8. **Profiling** — Use Unreal Insights for CPU/GPU profiling; `stat unit` for frame time breakdown in-game
