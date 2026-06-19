"""
Collapse scanned Sketchfab enemy meshes into one low-poly test asset.

Scanned imports are dozens of separate high-poly shells. Decimating each piece
on its own (see decimate-enemy-mech.py) usually looks shredded. This script:

  1. Imports the full-res source glTF
  2. Joins all mesh objects into one
  3. Merges duplicate vertices
  4. Either:
     - decimate: unified Collapse decimate to a target triangle count (default)
     - voxel:    Voxel Remesh for a blocky but even test mesh

Usage:
  blender --background --python lowpoly-enemy-test.py -- wasp
  blender --background --python lowpoly-enemy-test.py -- wasp decimate 15000
  blender --background --python lowpoly-enemy-test.py -- wasp voxel 0.018

Then export to game:
  blender --background --python export-enemy-mech-from-blend.py -- wasp
  (point export script at lowpoly blend — or use --lowpoly flag below)

Outputs:
  tools/assets/<enemy>/<enemy>_lowpoly_test.blend
  tools/assets/<enemy>/scene.gltf  (when --export is passed)
"""
import argparse
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from enemy_mech_config import (
    MAT_NAME,
    TEAM_BLUE,
    export_gltf_path,
    lowpoly_blend_path,
    require_enemy,
    sketchfab_source_gltf,
    tools_asset_dir,
)


def tri_count(mesh) -> int:
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def make_team_blue_material():
    mat = bpy.data.materials.get(MAT_NAME)
    if mat is None:
        mat = bpy.data.materials.new(name=MAT_NAME)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new(type="ShaderNodeOutputMaterial")
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    output.location = (300, 0)
    bsdf.inputs["Base Color"].default_value = TEAM_BLUE
    bsdf.inputs["Roughness"].default_value = 0.86
    bsdf.inputs["Metallic"].default_value = 0.08
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def import_source(key: str):
    gltf = sketchfab_source_gltf(key)
    if not os.path.isfile(gltf):
        raise FileNotFoundError(gltf)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=gltf)
    meshes = mesh_objects()
    if not meshes:
        raise RuntimeError(f"No meshes imported from {gltf}")
    print(f"Imported {len(meshes)} mesh parts from {gltf}")
    return meshes


def join_meshes(meshes, name: str):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    joined = bpy.context.active_object
    joined.name = name
    return joined


def merge_verts(obj, distance: float = 0.0001):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=distance)
    bpy.ops.object.mode_set(mode="OBJECT")


def decimate_to_target(obj, target_tris: int):
    mesh = obj.data
    before = tri_count(mesh)
    if before <= target_tris:
        print(f"Already {before:,} tris (target {target_tris:,})")
        return before, before

    current = before
    pass_num = 0
    while current > target_tris and pass_num < 8:
        pass_num += 1
        ratio = max(target_tris / current, 0.01)
        mod = obj.modifiers.new(name=f"DecimateCollapse{pass_num}", type="DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        after = tri_count(mesh)
        print(f"Decimate pass {pass_num}: {current:,} -> {after:,} tris (target {target_tris:,})")
        if after >= current:
            print("Decimate stalled; stopping early")
            break
        current = after

    return before, current


def voxel_remesh(obj, voxel_size: float):
    mesh = obj.data
    before = tri_count(mesh)
    mod = obj.modifiers.new(name="VoxelRemesh", type="REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = voxel_size
    mod.adaptivity = 0.0
    mod.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    after = tri_count(mesh)
    print(f"Voxel remesh (size={voxel_size}): {before:,} -> {after:,} tris")
    return before, after


def apply_solid_material(obj):
    mat = make_team_blue_material()
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def export_gltf(obj, path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLTF_SEPARATE",
        export_yup=True,
        export_apply=True,
        use_selection=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="NONE",
    )
    print(f"Exported -> {path}")


def frame_camera(obj):
    bpy.context.view_layer.update()
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mins = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    maxs = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    center = (mins + maxs) * 0.5
    radius = max((maxs - mins).x, (maxs - mins).y, (maxs - mins).z) * 0.8
    cam = bpy.data.objects.get("Camera")
    if cam:
        cam.location = center + Vector((radius, -radius, radius * 0.7))
        cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()


def main():
    parser = argparse.ArgumentParser(description="Join + remesh enemy scan into low-poly test asset")
    parser.add_argument("enemy", choices=list(__import__("enemy_mech_config").ENEMY_MECHS.keys()))
    parser.add_argument(
        "method",
        nargs="?",
        default="decimate",
        choices=["decimate", "voxel"],
        help="decimate = unified collapse to target tris; voxel = voxel remesh",
    )
    parser.add_argument(
        "value",
        nargs="?",
        default="12000",
        help="Target triangle count (decimate) or voxel size (voxel), default 12000",
    )
    parser.add_argument("--export", action="store_true", help="Also write tools/assets/<enemy>/scene.gltf")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])

    require_enemy(args.enemy)
    os.makedirs(tools_asset_dir(args.enemy), exist_ok=True)

    meshes = import_source(args.enemy)
    joined = join_meshes(meshes, f"{args.enemy}_lowpoly")
    merge_verts(joined)

    if args.method == "voxel":
        voxel_remesh(joined, float(args.value))
    else:
        decimate_to_target(joined, int(float(args.value)))

    apply_solid_material(joined)
    frame_camera(joined)

    blend_out = lowpoly_blend_path(args.enemy)
    bpy.ops.wm.save_as_mainfile(filepath=blend_out)
    print(f"Saved {blend_out}")

    if args.export:
        export_gltf(joined, export_gltf_path(args.enemy))


if __name__ == "__main__":
    main()
