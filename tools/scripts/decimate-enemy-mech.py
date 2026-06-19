"""
Decimate all meshes in an enemy review blend (~50% triangles).
Usage: blender --background --python decimate-enemy-mech.py -- needleer
"""
import sys
import bpy
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from enemy_mech_config import (
    SKIP_NAMES,
    TARGET_DECIMATE_RATIO,
    blend_path,
    require_enemy,
)


def tri_count(mesh):
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def mech_meshes():
    return [
        o for o in bpy.context.scene.objects
        if o.type == "MESH" and o.name not in SKIP_NAMES
    ]


def decimate_mesh(obj, ratio: float):
    mesh = obj.data
    before = tri_count(mesh)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    mod = obj.modifiers.new(name="DecimateGame", type="DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)

    after = tri_count(mesh)
    print(f"  {obj.name}: {before:,} -> {after:,} tris ({after / max(before, 1):.1%})")
    return before, after


def main(key: str):
    require_enemy(key)
    path = blend_path(key)
    if not os.path.isfile(path):
        raise FileNotFoundError(path)

    bpy.ops.wm.open_mainfile(filepath=path)
    meshes = mech_meshes()
    if not meshes:
        raise RuntimeError(f"No meshes in {path}")

    total_before = 0
    total_after = 0
    print(f"Decimating {key} ({len(meshes)} meshes) at {TARGET_DECIMATE_RATIO:.0%}...")
    for obj in meshes:
        before, after = decimate_mesh(obj, TARGET_DECIMATE_RATIO)
        total_before += before
        total_after += after

    print(
        f"Total {key}: {total_before:,} -> {total_after:,} tris "
        f"({total_after / max(total_before, 1):.1%})"
    )
    bpy.ops.wm.save_mainfile(filepath=path)
    print(f"Saved {path}")


if __name__ == "__main__":
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    if len(argv) != 1:
        raise SystemExit(f"Usage: blender --background --python {__file__} -- <enemy_key>")
    main(argv[0])
