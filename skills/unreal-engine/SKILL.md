---
name: unreal-engine
description: >-
  Unreal Engine is Epic Games' real-time 3D engine for games, architectural
  visualization, film and simulation, programmed with Blueprints (visual
  scripting) or C++. Use when a user asks to write Unreal C++ gameplay classes,
  expose code to Blueprints, set up Enhanced Input, enable Nanite, Lumen or
  World Partition, build or package a project from the command line, or fix
  UnrealBuildTool compile errors.
license: Apache-2.0
compatibility: "Unreal Engine 5.x (5.8 current); Windows with Visual Studio, macOS with Xcode, or Linux with clang for building from source; a GPU with DirectX 12 or Vulkan"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["unreal-engine", "game-engine", "cpp", "blueprints", "3d"]
---

# Unreal Engine — AAA Game Engine

## Overview

Unreal Engine (UE) is Epic Games' engine. The current line is UE 5.8 (June 2026, with hotfixes). Gameplay is written in C++ (modules built by UnrealBuildTool, UBT) and Blueprints (node graphs saved as assets); the two mix freely through `UCLASS`, `UPROPERTY` and `UFUNCTION` reflection macros. Main rendering and world features: Nanite (virtualized geometry), Lumen (dynamic global illumination), Virtual Shadow Maps, MegaLights (many dynamic lights, production-ready in 5.8), World Partition (streamed open worlds), and Iris (new replication system, production-ready in 5.8). Download the engine through the Epic Games Launcher, or build it from source after linking your Epic account to GitHub for access to the `EpicGames/UnrealEngine` repository.

## Instructions

### Project layout and C++ modules

- A project is a `.uproject` file plus `Source/<Module>/` with `<Module>.Build.cs`, `<Module>Editor.Target.cs` and `<Module>.Target.cs`. Add engine modules to `PublicDependencyModuleNames` in `Build.cs`: `"Core", "CoreUObject", "Engine", "InputCore", "EnhancedInput"`.
- Create classes in the editor (Tools > New C++ Class) or add the `.h/.cpp` pair by hand and regenerate project files (right-click the `.uproject` > Generate Visual Studio project files, or `GenerateProjectFiles.sh` for source builds).
- Every reflected header ends its include list with `#include "<ClassName>.generated.h"`. A new `UPROPERTY` or `UFUNCTION` needs the editor closed or Live Coding off for a full rebuild (Live Coding patches function bodies only).
- Use `UPROPERTY()` on every `UObject*` member you hold; otherwise garbage collection can free it. Use `TObjectPtr<T>` for member pointers in UE5.

### A Blueprint-friendly character with Enhanced Input

Enhanced Input has been the default input system since UE 5.1: axis mappings and `BindAxis("MoveForward")` are the legacy path. Create `UInputAction` assets (IA_Move as Axis2D, IA_Jump as Boolean) and a `UInputMappingContext`, then bind them:

```cpp
// MyCharacter.h
#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "InputActionValue.h"
#include "MyCharacter.generated.h"

class UCameraComponent;
class USpringArmComponent;
class UInputAction;
class UInputMappingContext;

UCLASS()
class MYGAME_API AMyCharacter : public ACharacter
{
    GENERATED_BODY()

public:
    AMyCharacter();

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Stats")
    float MaxHealth = 100.0f;

    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Stats")
    float CurrentHealth = 0.0f;

    // Named ApplyHit, not TakeDamage: AActor::TakeDamage already exists and a different signature would hide it
    UFUNCTION(BlueprintCallable, Category = "Combat")
    void ApplyHit(float Damage, AActor* DamageCauser);

    // Blueprint can override this; C++ default is OnDeath_Implementation
    UFUNCTION(BlueprintNativeEvent, Category = "Combat")
    void OnDeath();

protected:
    virtual void BeginPlay() override;
    virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

    void Move(const FInputActionValue& Value);

    UPROPERTY(EditDefaultsOnly, Category = "Input")
    TObjectPtr<UInputMappingContext> DefaultContext;
    UPROPERTY(EditDefaultsOnly, Category = "Input")
    TObjectPtr<UInputAction> MoveAction;
    UPROPERTY(EditDefaultsOnly, Category = "Input")
    TObjectPtr<UInputAction> JumpAction;

    UPROPERTY(VisibleAnywhere)
    TObjectPtr<USpringArmComponent> SpringArmComp;
    UPROPERTY(VisibleAnywhere)
    TObjectPtr<UCameraComponent> CameraComp;
};
```

```cpp
// MyCharacter.cpp
#include "MyCharacter.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"

AMyCharacter::AMyCharacter()
{
    PrimaryActorTick.bCanEverTick = false;   // enable only if you really need Tick

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

    if (APlayerController* PC = Cast<APlayerController>(GetController()))
    {
        if (auto* Subsystem = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
        {
            Subsystem->AddMappingContext(DefaultContext, 0);
        }
    }
}

void AMyCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
    Super::SetupPlayerInputComponent(PlayerInputComponent);
    if (auto* Input = Cast<UEnhancedInputComponent>(PlayerInputComponent))
    {
        Input->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AMyCharacter::Move);
        Input->BindAction(JumpAction, ETriggerEvent::Started, this, &ACharacter::Jump);
        Input->BindAction(JumpAction, ETriggerEvent::Completed, this, &ACharacter::StopJumping);
    }
}

void AMyCharacter::Move(const FInputActionValue& Value)
{
    const FVector2D Axis = Value.Get<FVector2D>();
    const FRotator Yaw(0.0f, GetControlRotation().Yaw, 0.0f);
    AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), Axis.Y);
    AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), Axis.X);
}

void AMyCharacter::ApplyHit(float Damage, AActor* DamageCauser)
{
    CurrentHealth = FMath::Max(0.0f, CurrentHealth - Damage);
    if (CurrentHealth <= 0.0f)
    {
        OnDeath();
    }
}

void AMyCharacter::OnDeath_Implementation()
{
    GetCharacterMovement()->DisableMovement();
    GetMesh()->SetSimulatePhysics(true);   // ragdoll; Blueprint may override for custom VFX
}
```

### Blueprints

- Use Actor Blueprints for game objects, Widget Blueprints (UMG) for UI, Animation Blueprints for state machines and blending, and a GameMode Blueprint for rules. Build Blueprints as children of your C++ classes so designers tweak the exposed `UPROPERTY` values.
- Avoid Event Tick for polling: use timers, event dispatchers, or Blueprint Interfaces. Heavy casts create hard asset references; prefer interfaces or soft references.
- Blueprint nativization was removed in UE 5.0. Move hot Blueprint logic to C++ by hand.

### Rendering and world features

- Nanite is enabled per static mesh (Details > Nanite Settings) (check the box, or enable "Generate Nanite Mesh" on import); it replaces hand-made LODs for opaque meshes. Lumen is the default dynamic global illumination and reflection method in the UE5 project templates (Project Settings > Rendering). Both need DX12/SM6 or Vulkan on desktop; use the mobile or forward renderer for low-end targets.
- World Partition is the default for new open-world levels (replaces manual level streaming); use Data Layers for toggleable content and One File Per Actor so teams do not conflict on one map file.
- Use the Gameplay Ability System (a plugin you must enable) for abilities, buffs and cooldowns, and Iris (opt-in) or classic replication for multiplayer with a server-authoritative model.

### Build and package from the command line

Run from the engine root (use `.bat` on Windows, `.sh` on Linux and macOS; Mac uses `Mac/Build.sh`):

```bash
# Compile the editor target of a project
Engine/Build/BatchFiles/Linux/Build.sh SpaceDockEditor Linux Development -project="$HOME/Projects/SpaceDock/SpaceDock.uproject"

# Cook, stage and package a shipping build
Engine/Build/BatchFiles/RunUAT.sh BuildCookRun \
  -project="$HOME/Projects/SpaceDock/SpaceDock.uproject" \
  -platform=Linux -clientconfig=Shipping \
  -build -cook -stage -pak -archive -archivedirectory="$HOME/Builds/SpaceDock"
```

Building the engine from source: `./Setup.sh && ./GenerateProjectFiles.sh && make` on Linux; on Windows run `GenerateProjectFiles.bat`, open `UE5.sln`, set Development Editor / Win64 and build the UE5 target (10-40 minutes). Regenerate project files after every sync.

## Examples

### Example 1: Expose a health system to designers

**User request:** "Add health and a death event to my character so my designer can change the numbers and play a death animation in Blueprint."

Create `AMyCharacter` as above, build, then in the editor create a Blueprint class from it (`BP_Hero`). `MaxHealth` appears in Details; in the Blueprint graph right-click and add "Event On Death" to play a montage. After pressing Play, calling `ApplyHit` from a trap Blueprint with 40 reduces `CurrentHealth` from 100 to 60, and three hits fire the Blueprint override.

### Example 2: A CI package build fails

**User request:** "The nightly build says `error: use of undeclared identifier 'UEnhancedInputComponent'`. Fix it."

Add `"EnhancedInput"` to `PublicDependencyModuleNames` in `SpaceDock.Build.cs`, add `#include "EnhancedInputComponent.h"` in the `.cpp`, enable the Enhanced Input plugin in the `.uproject` if missing, regenerate project files and re-run the `Build.sh` command. The log should end with `Result: Succeeded`.

## Guidelines

- Do not name your functions like engine ones (`TakeDamage`, `Jump`, `Tick` with other arguments): a different signature hides the base virtual and causes warnings or silent no-ops.
- Always use `UPROPERTY()` for `UObject` pointers and `TWeakObjectPtr` for non-owning references; never keep a raw `UObject*` across frames without it.
- Change reflected headers only with the editor closed; Live Coding does not support adding properties.
- Keep `Intermediate/`, `Saved/`, `Binaries/` and `DerivedDataCache/` out of source control. Use Perforce or Git LFS for `.uasset` and `.umap` files.
- Profile with `stat unit`, `stat gpu` and Unreal Insights before optimizing; do not leave Tick enabled "just in case".
- Engine source is under the Unreal Engine EULA, not an open-source licence; check the royalty and licence terms before shipping commercial products.
- Unreal is heavy for 2D or small mobile games; consider Godot or Unity there.
