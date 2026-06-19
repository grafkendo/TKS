"""
Create a review .blend for the heavy mech with camera framed on the model.
"""
import bpy
import os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "w9231")
INPUT_GLTF = os.path.join(ASSET_DIR, "scene.gltf")
OUTPUT_BLEND = os.path.join(ASSET_DIR, "heavy_mech_review.blend")


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


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=INPUT_GLTF)

    armatures = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and "icosphere" not in o.name.lower()]

    # Drop stray helper meshes from the Sketchfab export.
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj not in meshes:
            bpy.data.objects.remove(obj, do_unlink=True)

    focus = armatures[0] if armatures else meshes[0]
    if not focus:
        raise RuntimeError("No heavy mech objects imported")

    focus.name = "heavy_mech_rig" if focus.type == "ARMATURE" else "heavy_mech"
    for mesh in meshes:
        if mesh.name.startswith("Object_"):
            mesh.name = mesh.name.replace("Object_", "heavy_mech_")

    bpy.ops.object.select_all(action="DESELECT")
    focus.select_set(True)
    bpy.context.view_layer.objects.active = focus

    bpy.ops.mesh.primitive_grid_add(size=8, location=(0, 0, 0))
    grid = bpy.context.active_object
    grid.name = "ground_grid"
    grid.display_type = "WIRE"
    grid.hide_select = True

    bpy.ops.object.light_add(type="SUN", location=(4, -4, 8))
    sun = bpy.context.active_object
    sun.data.energy = 2.5
    sun.rotation_euler = (0.9, 0.2, 0.8)

    bbox_objs = meshes if meshes else [focus]
    mins, maxs = world_bbox(bbox_objs)
    center = (mins + maxs) * 0.5
    size = maxs - mins
    radius = max(size.x, size.y, size.z) * 1.6

    cam = bpy.data.objects.get("Camera")
    if cam:
        cam.location = center + Vector((radius, -radius, radius * 0.65))
        direction = center - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND)
    print(f"Wrote {OUTPUT_BLEND}")
    print(f"Focus {focus.name} center {tuple(center)} size {tuple(size)}")


if __name__ == "__main__":
    main()
