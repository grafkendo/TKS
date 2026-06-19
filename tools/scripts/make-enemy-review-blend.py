"""
Import an enemy glTF, apply solid team-blue material, save a review .blend.
Usage: blender --background --python make-enemy-review-blend.py -- needleer
"""
import sys
import bpy
import os
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from enemy_mech_config import (
    ENEMY_MECHS,
    MAT_NAME,
    TEAM_BLUE,
    blend_path,
    require_enemy,
    source_gltf,
    tools_asset_dir,
)


def world_bbox(objs):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    return mins, maxs


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
    bsdf.location = (0, 0)
    output.location = (300, 0)
    bsdf.inputs["Base Color"].default_value = TEAM_BLUE
    bsdf.inputs["Roughness"].default_value = 0.86
    bsdf.inputs["Metallic"].default_value = 0.08
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def mech_meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name != "ground_grid"]


def main(key: str):
    cfg = require_enemy(key)
    input_gltf = source_gltf(key)
    out_blend = blend_path(key)
    os.makedirs(tools_asset_dir(key), exist_ok=True)

    if not os.path.isfile(input_gltf):
        raise FileNotFoundError(input_gltf)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=input_gltf)

    meshes = mech_meshes()
    if not meshes:
        raise RuntimeError(f"No meshes imported for {key}")

    prefix = cfg["prefix"]
    for obj in meshes:
        if not obj.name.startswith(prefix):
            obj.name = f"{prefix}{obj.name}"

    mat = make_team_blue_material()
    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(mat)

    for old in list(bpy.data.materials):
        if old.name != MAT_NAME and old.users == 0:
            bpy.data.materials.remove(old)

    bpy.ops.mesh.primitive_grid_add(size=6, location=(0, 0, 0))
    grid = bpy.context.active_object
    grid.name = "ground_grid"
    grid.display_type = "WIRE"

    bpy.ops.object.light_add(type="SUN", location=(3, -3, 6))
    sun = bpy.context.active_object
    sun.data.energy = 2.5
    sun.rotation_euler = (0.9, 0.2, 0.8)

    mins, maxs = world_bbox(meshes)
    center = (mins + maxs) * 0.5
    size = maxs - mins
    radius = max(size.x, size.y, size.z) * 1.6
    cam = bpy.data.objects.get("Camera")
    if cam:
        cam.location = center + Vector((radius, -radius, radius * 0.7))
        direction = center - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    bpy.ops.wm.save_as_mainfile(filepath=out_blend)
    print(f"Wrote {out_blend} — {len(meshes)} mesh objects")


if __name__ == "__main__":
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    if len(argv) != 1:
        raise SystemExit(f"Usage: blender --background --python {__file__} -- <enemy_key>")
    main(argv[0])
