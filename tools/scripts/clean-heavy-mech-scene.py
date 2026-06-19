"""
Clean heavy_mech_review.blend: flatten Sketchfab parents, unhide, frame-ready save.
"""
import bpy
import os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "w9231")
BLEND_FILE = os.path.join(ASSET_DIR, "heavy_mech_review.blend")

SKIP_MESH = {"ground_grid"}
STALE_EMPTIES = {
    "Sketchfab_model",
    "W9231_Mech_Mesh_Rigged.fbx",
    "RootNode",
    "W9231",
    "Object_42",
    "heavy_mech_root",
    "_export_orient_root",
}


def world_bbox_meshes(meshes):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    return mins, maxs


def main():
    if not os.path.isfile(BLEND_FILE):
        raise FileNotFoundError(BLEND_FILE)

    bpy.ops.wm.open_mainfile(filepath=BLEND_FILE)

    rig = bpy.data.objects.get("heavy_mech_rig")
    meshes = [
        o
        for o in bpy.context.scene.objects
        if o.type == "MESH" and o.name not in SKIP_MESH
    ]
    if not rig or not meshes:
        raise RuntimeError("heavy_mech_rig or meshes missing")

    # Flatten Sketchfab scale chain — keep world transforms, parent rig to scene.
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")

    for name in STALE_EMPTIES:
        obj = bpy.data.objects.get(name)
        if obj:
            bpy.data.objects.remove(obj, do_unlink=True)

    for obj in list(bpy.context.scene.objects):
        obj.hide_viewport = False
        obj.hide_render = False
        obj.hide_set(False)

    for col in bpy.data.collections:
        col.hide_viewport = False
        col.hide_render = False

    # Ground feet near z=0 for a sensible preview.
    mins, maxs = world_bbox_meshes(meshes)
    dz = -mins.z
    rig.location.z += dz
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    mins, maxs = world_bbox_meshes(meshes)
    print(f"Cleaned — dims {tuple(maxs - mins)}, minZ {mins.z:.4f}")
    print(f"Rig parent: {rig.parent.name if rig.parent else 'None'}")

    bpy.ops.wm.save_mainfile(filepath=BLEND_FILE)
    print(f"Saved {BLEND_FILE}")


if __name__ == "__main__":
    main()
