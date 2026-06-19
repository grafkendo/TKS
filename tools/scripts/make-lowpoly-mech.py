"""
Procedural low-poly tactical mech for Tackticus.

Builds a chunky biped (~1.55 m tall, feet on ground), saves a review .blend,
and exports tools/assets/lowpoly_mech/scene.gltf for packing to public/assets.

Usage:
  blender --background --python tools/scripts/make-lowpoly-mech.py
  blender tools/assets/lowpoly_mech/lowpoly_mech_review.blend   # open in GUI
"""
from __future__ import annotations

import os
import sys
import bpy
from mathutils import Vector, Euler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mech_game_hierarchy import export_mech_root, organize_mech_hierarchy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "lowpoly_mech")
BLEND_OUT = os.path.join(ASSET_DIR, "lowpoly_mech_review.blend")
GLTF_OUT = os.path.join(ASSET_DIR, "scene.gltf")


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name: str, rgba: tuple[float, float, float, float]) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = 0.82
    bsdf.inputs["Metallic"].default_value = 0.06
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def shade_flat(obj: bpy.types.Object) -> None:
    for poly in obj.data.polygons:
        poly.use_smooth = False


def add_box(
    name: str,
    center: Vector,
    size: Vector,
    mat: bpy.types.Material,
    rot: Euler | None = None,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center, rotation=rot or (0.0, 0.0, 0.0))
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size.x * 0.5, size.y * 0.5, size.z * 0.5)
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    shade_flat(obj)
    return obj


def add_cylinder(
    name: str,
    center: Vector,
    radius: float,
    depth: float,
    mat: bpy.types.Material,
    rot_euler=(0.0, 0.0, 0.0),
    verts: int = 8,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius,
        depth=depth,
        location=center,
        rotation=rot_euler,
        vertices=verts,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    shade_flat(obj)
    return obj


def add_sphere(
    name: str,
    center: Vector,
    radius: float,
    mat: bpy.types.Material,
    scale: Vector | None = None,
    segments: int = 10,
    rings: int = 6,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        radius=radius,
        location=center,
    )
    obj = bpy.context.active_object
    obj.name = name
    if scale:
        obj.scale = scale
        bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(mat)
    shade_flat(obj)
    return obj


def build_leg(
    side: str,
    x: float,
    mat_body: bpy.types.Material,
    mat_accent: bpy.types.Material,
    mat_dark: bpy.types.Material,
) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []

    # Hip ball + socket
    parts.append(add_sphere(f"hip_{side}", Vector((x, 0.0, 0.92)), 0.11, mat_dark, segments=8, rings=4))
    parts.append(add_cylinder(f"hip_collar_{side}", Vector((x, 0.0, 0.92)), 0.14, 0.08, mat_accent))

    # Thigh + knee
    parts.append(add_box(f"thigh_{side}", Vector((x, 0.0, 0.58)), Vector((0.22, 0.24, 0.42)), mat_body))
    parts.append(add_box(f"knee_{side}", Vector((x, 0.04, 0.36)), Vector((0.24, 0.18, 0.14)), mat_accent))
    parts.append(add_cylinder(f"shin_{side}", Vector((x, 0.0, 0.22)), 0.11, 0.34, mat_body))

    # Ankle cuff + foot
    parts.append(add_box(f"ankle_{side}", Vector((x, 0.02, 0.08)), Vector((0.20, 0.16, 0.10)), mat_accent))
    parts.append(add_box(f"foot_{side}", Vector((x, 0.08, 0.04)), Vector((0.30, 0.28, 0.10)), mat_dark))
    parts.append(add_box(f"toe_{side}", Vector((x, 0.18, 0.05)), Vector((0.14, 0.10, 0.08)), mat_accent))

    return parts


def build_torso(
    mat_body: bpy.types.Material,
    mat_accent: bpy.types.Material,
    mat_dark: bpy.types.Material,
) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []

    parts.append(add_box("pelvis", Vector((0, 0, 0.88)), Vector((0.78, 0.56, 0.30)), mat_body))
    parts.append(add_box("waist_skirt", Vector((0, 0.02, 0.78)), Vector((0.82, 0.48, 0.14)), mat_accent))

    parts.append(add_box("torso_core", Vector((0, 0, 1.22)), Vector((0.92, 0.68, 0.62)), mat_body))
    parts.append(add_box("chest_plate", Vector((0, -0.10, 1.30)), Vector((0.72, 0.22, 0.48)), mat_accent))
    parts.append(add_box("belly_plate", Vector((0, 0.08, 1.08)), Vector((0.58, 0.18, 0.28)), mat_dark))

    for side, x in (("L", -0.46), ("R", 0.46)):
        parts.append(add_box(
            f"side_skirt_{side}",
            Vector((x, 0.0, 0.98)),
            Vector((0.14, 0.42, 0.36)),
            mat_accent,
            rot=Euler((0.0, 0.0, 0.18 if side == "L" else -0.18)),
        ))

    parts.append(add_cylinder("collar", Vector((0, 0, 1.48)), 0.34, 0.10, mat_dark))

    # Backpack + vents
    parts.append(add_box("backpack", Vector((0, 0.22, 1.24)), Vector((0.62, 0.28, 0.52)), mat_body))
    for i, z in enumerate((1.08, 1.24, 1.40)):
        parts.append(add_box(f"vent_{i}", Vector((0, 0.36, z)), Vector((0.38, 0.06, 0.08)), mat_dark))
    parts.append(add_cylinder("reactor_cap", Vector((0, 0.34, 1.18)), 0.10, 0.06, mat_accent))

    return parts


def build_cockpit(
    mat_cockpit: bpy.types.Material,
    mat_accent: bpy.types.Material,
    mat_dark: bpy.types.Material,
) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []

    parts.append(add_sphere("cockpit", Vector((0, -0.10, 1.54)), 0.28, mat_cockpit, scale=Vector((1.0, 0.78, 0.88)), segments=12, rings=6))
    parts.append(add_cylinder("cockpit_frame", Vector((0, -0.06, 1.54)), 0.30, 0.06, mat_accent, rot_euler=(1.5708, 0.0, 0.0)))
    parts.append(add_box("hud_band", Vector((0, -0.22, 1.58)), Vector((0.36, 0.04, 0.10)), mat_dark))
    parts.append(add_box("head_guard", Vector((0, -0.04, 1.66)), Vector((0.40, 0.14, 0.08)), mat_accent))

    return parts


def build_shoulder_arm(
    side: str,
    x_sign: float,
    mat_body: bpy.types.Material,
    mat_accent: bpy.types.Material,
    mat_gun: bpy.types.Material,
    mat_dark: bpy.types.Material,
) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    x = 0.64 * x_sign

    parts.append(add_sphere(f"shoulder_joint_{side}", Vector((x, 0.0, 1.36)), 0.12, mat_accent, segments=8, rings=4))
    parts.append(add_box(
        f"pauldron_{side}",
        Vector((x, 0.0, 1.40)),
        Vector((0.24, 0.36, 0.26)),
        mat_body,
        rot=Euler((0.0, 0.0, 0.22 * x_sign)),
    ))

    upper_x = x + 0.14 * x_sign
    parts.append(add_box(f"upper_arm_{side}", Vector((upper_x, 0.0, 1.22)), Vector((0.16, 0.16, 0.34)), mat_body))
    parts.append(add_box(f"elbow_{side}", Vector((upper_x + 0.06 * x_sign, 0.0, 1.02)), Vector((0.14, 0.14, 0.12)), mat_accent))
    fore_x = upper_x + 0.10 * x_sign
    parts.append(add_box(f"forearm_{side}", Vector((fore_x, 0.0, 0.90)), Vector((0.14, 0.14, 0.30)), mat_body))

    if side == "R":
        barrel_y = -0.20
        parts.append(add_cylinder("cannon_sleeve", Vector((fore_x, barrel_y, 0.92)), 0.09, 0.22, mat_gun))
        parts.append(add_cylinder("cannon_barrel", Vector((fore_x, barrel_y - 0.28, 0.92)), 0.06, 0.48, mat_gun, rot_euler=(1.5708, 0.0, 0.0)))
        parts.append(add_cylinder("muzzle_brake", Vector((fore_x, barrel_y - 0.56, 0.92)), 0.075, 0.10, mat_accent, rot_euler=(1.5708, 0.0, 0.0), verts=6))
        parts.append(add_box("ammo_box", Vector((x, -0.08, 1.34)), Vector((0.14, 0.20, 0.18)), mat_dark))
    else:
        pod_x = fore_x - 0.08 * x_sign
        parts.append(add_box("missile_housing", Vector((pod_x, 0.0, 0.96)), Vector((0.20, 0.26, 0.34)), mat_gun))
        for i, y in enumerate((-0.08, 0.0, 0.08)):
            parts.append(add_cylinder(
                f"missile_tube_{i}",
                Vector((pod_x - 0.10 * x_sign, y, 0.98)),
                0.035,
                0.30,
                mat_accent,
                rot_euler=(0.0, 1.5708, 0.0),
            ))
        parts.append(add_box("pod_lid", Vector((pod_x, 0.0, 1.12)), Vector((0.18, 0.22, 0.06)), mat_accent))

    return parts


def build_mech_parts() -> list[bpy.types.Object]:
    """Medium-class walker with layered armor panels and articulated limbs."""
    mat_body = make_mat("TeamPrimary", (0.42, 0.46, 0.52, 1.0))
    mat_accent = make_mat("TeamSecondary", (0.28, 0.32, 0.38, 1.0))
    mat_cockpit = make_mat("TeamAccent", (0.55, 0.72, 0.88, 1.0))
    mat_gun = make_mat("gun", (0.22, 0.24, 0.28, 1.0))
    mat_dark = make_mat("TeamSecondary", (0.18, 0.20, 0.24, 1.0))

    parts: list[bpy.types.Object] = []

    for side, x in (("L", -0.28), ("R", 0.28)):
        parts.extend(build_leg(side, x, mat_body, mat_accent, mat_dark))

    parts.extend(build_torso(mat_body, mat_accent, mat_dark))
    parts.extend(build_cockpit(mat_cockpit, mat_accent, mat_dark))
    parts.extend(build_shoulder_arm("R", 1.0, mat_body, mat_accent, mat_gun, mat_dark))
    parts.extend(build_shoulder_arm("L", -1.0, mat_body, mat_accent, mat_gun, mat_dark))

    # Sensor mast + radar dish
    parts.append(add_cylinder("sensor_mast", Vector((0.0, 0.16, 1.72)), 0.025, 0.14, mat_accent))
    parts.append(add_cylinder("radar_dish", Vector((0.0, 0.16, 1.82)), 0.10, 0.02, mat_dark, rot_euler=(0.35, 0.0, 0.0), verts=10))

    # Hip-mounted searchlight
    parts.append(add_sphere("searchlight", Vector((0.12, -0.18, 0.96)), 0.06, mat_cockpit, segments=8, rings=4))
    parts.append(add_box("light_bracket", Vector((0.10, -0.14, 0.96)), Vector((0.08, 0.06, 0.06)), mat_accent))

    return parts


def frame_scene(root: bpy.types.Object) -> None:
    bpy.ops.mesh.primitive_grid_add(size=6, location=(0, 0, 0))
    grid = bpy.context.active_object
    grid.name = "ground_grid"
    grid.display_type = "WIRE"
    grid.hide_select = True

    bpy.ops.object.light_add(type="SUN", location=(4, -5, 8))
    sun = bpy.context.active_object
    sun.data.energy = 2.8
    sun.rotation_euler = (0.85, 0.15, 0.75)

    bpy.ops.object.light_add(type="AREA", location=(-3, 4, 3))
    fill = bpy.context.active_object
    fill.data.energy = 180
    fill.data.size = 4

    root.select_set(True)
    bpy.context.view_layer.objects.active = root

    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.name == "ground_grid":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins = Vector((min(mins.x, world.x), min(mins.y, world.y), min(mins.z, world.z)))
            maxs = Vector((max(maxs.x, world.x), max(maxs.y, world.y), max(maxs.z, world.z)))
    center = (mins + maxs) * 0.5
    span = max(maxs.x - mins.x, maxs.y - mins.y, maxs.z - mins.z)
    radius = max(span * 1.8, 2.0)

    cam = bpy.data.objects.get("Camera")
    if cam:
        cam.location = center + Vector((radius * 0.85, -radius, radius * 0.55))
        direction = center - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    clear_scene()
    parts = build_mech_parts()
    root = organize_mech_hierarchy(parts)
    mesh_count = sum(1 for o in bpy.context.scene.objects if o.type == "MESH")
    print(f"lowpoly_mech: {mesh_count} separate mesh objects")
    frame_scene(root)
    os.makedirs(ASSET_DIR, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUT)
    print(f"Wrote {BLEND_OUT}")
    export_mech_root(root, GLTF_OUT)


if __name__ == "__main__":
    main()
