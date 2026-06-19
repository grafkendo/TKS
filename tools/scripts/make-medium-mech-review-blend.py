"""
Create a review .blend for the medium mech with camera framed on the model.
"""
import bpy
import os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "medium")
INPUT_GLTF = os.path.join(ASSET_DIR, "scene.gltf")
OUTPUT_BLEND = os.path.join(ASSET_DIR, "medium_mech_review.blend")


def world_bbox(obj):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
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
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=INPUT_GLTF)

    mech = bpy.data.objects.get("medium_mech")
    if not mech:
        meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        if not meshes:
            raise RuntimeError("No mesh imported")
        mech = meshes[0]
        mech.name = "medium_mech"

    bpy.ops.object.select_all(action="DESELECT")
    mech.select_set(True)
    bpy.context.view_layer.objects.active = mech

    # Ground grid + axis helpers for orientation checks.
    bpy.ops.mesh.primitive_grid_add(size=4, location=(0, 0, 0))
    grid = bpy.context.active_object
    grid.name = "ground_grid"
    grid.display_type = "WIRE"
    grid.hide_select = True

    # Simple sun so the mesh reads in solid view.
    bpy.ops.object.light_add(type="SUN", location=(2, -2, 4))
    sun = bpy.context.active_object
    sun.data.energy = 2.5
    sun.rotation_euler = (0.9, 0.2, 0.8)

    mins, maxs = world_bbox(mech)
    center = (mins + maxs) * 0.5
    size = maxs - mins
    radius = max(size.x, size.y, size.z) * 1.8

    # Point default camera at the mech.
    cam = bpy.data.objects.get("Camera")
    if cam:
        cam.location = center + Vector((radius, -radius, radius * 0.75))
        direction = center - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND)
    print(f"Wrote {OUTPUT_BLEND}")
    print(f"Mech center {tuple(center)} size {tuple(size)}")


if __name__ == "__main__":
    main()
