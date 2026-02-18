---
name: blender-addon-dev
description: >-
  Build custom Blender add-ons with Python. Use when the user wants to create
  a Blender add-on, register operators, build UI panels, add custom properties,
  create menus, package an add-on for distribution, or extend Blender with
  custom tools and workflows.
license: Apache-2.0
compatibility: >-
  Requires Blender 3.0+. Add-ons are standard Python modules.
  Test: blender --background --python addon.py
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["blender", "addon", "plugin", "operators", "ui-panels"]
---

# Blender Add-on Development

## Overview

Create custom Blender add-ons that extend the application with new operators, UI panels, properties, and menus. Add-ons are Python modules that register with Blender's internal system and can be installed, enabled, and shared like any Blender extension.

## Instructions

### 1. Add-on structure and bl_info

```python
bl_info = {
    "name": "My Custom Add-on",
    "author": "Your Name",
    "version": (1, 0, 0),
    "blender": (3, 0, 0),
    "location": "View3D > Sidebar > My Tab",
    "description": "A short description of what the add-on does",
    "category": "Object",
}

import bpy

def register():
    """Called when the add-on is enabled."""
    pass

def unregister():
    """Called when the add-on is disabled."""
    pass

if __name__ == "__main__":
    register()
```

### 2. Create a custom operator

```python
class OBJECT_OT_my_operator(bpy.types.Operator):
    """Tooltip shown on hover"""
    bl_idname = "object.my_operator"
    bl_label = "My Operator"
    bl_options = {'REGISTER', 'UNDO'}

    scale_factor: bpy.props.FloatProperty(name="Scale", default=2.0, min=0.1, max=100.0)
    axis: bpy.props.EnumProperty(
        name="Axis",
        items=[('X', "X Axis", ""), ('Y', "Y Axis", ""), ('Z', "Z Axis", ""), ('ALL', "All", "")],
        default='ALL'
    )

    @classmethod
    def poll(cls, context):
        return context.active_object is not None

    def execute(self, context):
        obj = context.active_object
        s = self.scale_factor
        if self.axis == 'ALL':
            obj.scale *= s
        else:
            setattr(obj.scale, self.axis.lower(), getattr(obj.scale, self.axis.lower()) * s)
        self.report({'INFO'}, f"Scaled {obj.name} by {s}")
        return {'FINISHED'}

    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self)
```

Naming convention: `CATEGORY_OT_name` for operators, `CATEGORY_PT_name` for panels, `CATEGORY_MT_name` for menus.

### 3. Create a UI panel

```python
class VIEW3D_PT_my_panel(bpy.types.Panel):
    bl_label = "My Tools"
    bl_idname = "VIEW3D_PT_my_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "My Tab"
    bl_context = "objectmode"

    def draw(self, context):
        layout = self.layout
        obj = context.active_object
        layout.operator("object.my_operator", icon='FULLSCREEN_ENTER')
        if obj:
            layout.label(text=f"Active: {obj.name}", icon='OBJECT_DATA')
            layout.prop(obj, "location")
            box = layout.box()
            box.label(text="Transform", icon='ORIENTATION_GLOBAL')
            col = box.column(align=True)
            col.prop(obj, "location", index=0, text="X")
            col.prop(obj, "location", index=1, text="Y")
            col.prop(obj, "location", index=2, text="Z")
```

Panel spaces: `VIEW_3D`, `PROPERTIES`, `IMAGE_EDITOR`, `NODE_EDITOR`, `SEQUENCE_EDITOR`.

### 4. Add custom properties

```python
class MySettings(bpy.types.PropertyGroup):
    my_bool: bpy.props.BoolProperty(name="Enable", default=False)
    my_float: bpy.props.FloatProperty(name="Factor", default=1.0, min=0.0, max=10.0)
    my_enum: bpy.props.EnumProperty(
        name="Mode",
        items=[('OPT_A', "Option A", ""), ('OPT_B', "Option B", "")],
        default='OPT_A'
    )

def register():
    bpy.utils.register_class(MySettings)
    bpy.types.Scene.my_settings = bpy.props.PointerProperty(type=MySettings)

def unregister():
    del bpy.types.Scene.my_settings
    bpy.utils.unregister_class(MySettings)
```

Access in panels: `context.scene.my_settings.my_bool`.

### 5. Add menu entries and keymaps

```python
class OBJECT_MT_my_menu(bpy.types.Menu):
    bl_label = "My Custom Menu"
    bl_idname = "OBJECT_MT_my_menu"

    def draw(self, context):
        self.layout.operator("object.my_operator", text="Scale Up")
        self.layout.separator()
        self.layout.operator("mesh.primitive_cube_add", text="Add Cube")

# Append to existing menus in register():
#   bpy.types.VIEW3D_MT_object.append(draw_menu_item)
# Remove in unregister():
#   bpy.types.VIEW3D_MT_object.remove(draw_menu_item)

# Keymaps
addon_keymaps = []

def register_keymaps():
    wm = bpy.context.window_manager
    kc = wm.keyconfigs.addon
    if kc:
        km = kc.keymaps.new(name='Object Mode', space_type='EMPTY')
        kmi = km.keymap_items.new("object.my_operator", type='T', value='PRESS', ctrl=True, shift=True)
        addon_keymaps.append((km, kmi))

def unregister_keymaps():
    for km, kmi in addon_keymaps:
        km.keymap_items.remove(kmi)
    addon_keymaps.clear()
```

### 6. Package for distribution

```
my_addon/
├── __init__.py          # bl_info + register/unregister + imports
├── operators.py         # operator classes
├── panels.py            # UI panel classes
├── properties.py        # property group classes
└── utils.py             # helper functions
```

```python
# __init__.py
bl_info = { "name": "My Add-on", "author": "Your Name", "version": (1, 0, 0), "blender": (3, 0, 0), "category": "Object" }

from . import operators, panels, properties
classes = (properties.MySettings, operators.OBJECT_OT_my_operator, panels.VIEW3D_PT_my_panel)

def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.my_settings = bpy.props.PointerProperty(type=properties.MySettings)

def unregister():
    del bpy.types.Scene.my_settings
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
```

Zip the folder and install via Edit > Preferences > Add-ons > Install.

## Examples

### Example 1: Quick FBX export add-on

**User request:** "Create an add-on with a panel button that exports selected objects as FBX"

**Output:** Single-file add-on with `EXPORT_OT_quick_fbx` operator (iterates selected objects, exports each as FBX to a configurable directory), `QuickFBXSettings` property group with `export_path`, and `VIEW3D_PT_quick_fbx` panel with path input and export button showing selected object count.

### Example 2: Batch rename add-on with UI

**User request:** "Create an add-on to batch rename objects with a prefix and auto-numbering"

**Output:** Add-on with `RenameSettings` (prefix, separator enum, start number, padding), `OBJECT_OT_batch_rename` operator that sorts selected objects and applies `prefix + separator + zero-padded number`, and panel showing all settings with a live preview of the naming pattern.

## Guidelines

- Follow the naming convention strictly: `CATEGORY_OT_name` for operators, `CATEGORY_PT_name` for panels, `CATEGORY_MT_name` for menus. Blender enforces this.
- Register classes in dependency order: PropertyGroups first, then Operators, then Panels. Unregister in reverse.
- Always implement `poll()` on operators to prevent errors when context is wrong.
- Use `{'REGISTER', 'UNDO'}` in `bl_options` for operators that modify scene data.
- Clean up everything in `unregister()`: delete custom properties, remove menu entries, clear keymaps.
- Use `bpy.path.abspath()` to resolve `//` relative paths in file path properties.
- For multi-file add-ons, put `bl_info` only in `__init__.py`.
- Test with `blender --background --python addon.py` for registration errors.
- Use `self.report({'INFO'}, "message")` in operators to show status in Blender's status bar.
