"""
Normalize medium mech glTF for Tackticus:
- Flatten Sketchfab/FBX hierarchy
- Z-up in Blender (Y-up in exported glTF), feet on ground, centered
- Unit height (~1 m); game scales to PLAYER_CHASSIS_HEIGHT at runtime
- Yaw so model forward matches game +Z at rotation 0
- Origin at bounding-box center (world 0,0,0) for Blender editing
"""
import math
import bpy
import os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "medium")
INPUT_GLTF = os.path.join(ASSET_DIR, "scene.gltf")
OUTPUT_GLTF = os.path.join(ASSET_DIR, "scene.gltf")
BACKUP_GLTF = os.path.join(ASSET_DIR, "scene.sketchfab.gltf")
BACKUP_BIN = os.path.join(ASSET_DIR, "scene.sketchfab.bin")

# Horizontal yaw in degrees (Blender Z axis → glTF Y axis). Tweak if facing is off.
FACE_YAW_DEG = 180


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)


def mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


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


def select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def backup_source():
    import shutil

    if not os.path.isfile(BACKUP_GLTF):
        shutil.copy2(INPUT_GLTF, BACKUP_GLTF)
    bin_path = os.path.join(ASSET_DIR, "scene.bin")
    if os.path.isfile(bin_path) and not os.path.isfile(BACKUP_BIN):
        shutil.copy2(bin_path, BACKUP_BIN)


def import_gltf():
    bpy.ops.import_scene.gltf(filepath=INPUT_GLTF)


def flatten_to_single_mesh():
    objs = mesh_objects()
    if not objs:
        raise RuntimeError("No mesh objects imported")

    select_only(objs)
    if len(objs) > 1:
        bpy.ops.object.join()

    mech = bpy.context.view_layer.objects.active
    mech.name = "medium_mech"

    # Detach from Sketchfab empties so transforms bake cleanly.
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")

    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    mech.select_set(True)
    bpy.context.view_layer.objects.active = mech
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return mech


def make_z_up(mech):
    select_only([mech])
    for _ in range(4):
        mins, maxs = world_bbox([mech])
        size = maxs - mins
        if size.z >= max(size.x, size.y) - 1e-4:
            break
        if size.x >= size.y:
            bpy.ops.transform.rotate(value=1.57079632679, orient_axis="Y")
        else:
            bpy.ops.transform.rotate(value=1.57079632679, orient_axis="X")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def ground_and_center(mech):
    select_only([mech])
    mins, maxs = world_bbox([mech])
    mech.location.x -= (mins.x + maxs.x) * 0.5
    mech.location.y -= (mins.y + maxs.y) * 0.5
    mech.location.z -= mins.z
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)


def apply_yaw(mech, yaw_deg):
    if abs(yaw_deg) < 1e-6:
        return
    select_only([mech])
    bpy.ops.transform.rotate(value=math.radians(yaw_deg), orient_axis="Z")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    ground_and_center(mech)


def center_origin_on_model(mech):
    """Put the object origin at the mesh bounds center, then move to world zero."""
    select_only([mech])
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    mech.location = (0.0, 0.0, 0.0)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)


def normalize_mech(mech):
    make_z_up(mech)
    ground_and_center(mech)

    mins, maxs = world_bbox([mech])
    height = maxs.z - mins.z
    if height > 1e-6:
        s = 1.0 / height
        mech.scale = (s, s, s)
        select_only([mech])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    ground_and_center(mech)

    apply_yaw(mech, FACE_YAW_DEG)
    center_origin_on_model(mech)

    mins, maxs = world_bbox([mech])
    size = maxs - mins
    center = (mins + maxs) * 0.5
    print(f"Final — size: {size.x:.4f} x {size.y:.4f} x {size.z:.4f}")
    print(f"Final — min: {mins}, max: {maxs}")
    print(f"Final — center: {center}")
    if center.length > 1e-3:
        raise RuntimeError(f"Origin not centered (center={center.length:.4f} from world zero)")


def export_gltf(mech):
    bpy.ops.object.select_all(action="DESELECT")
    mech.select_set(True)
    bpy.context.view_layer.objects.active = mech
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_GLTF,
        export_format="GLTF_SEPARATE",
        export_yup=True,
        export_apply=True,
        use_selection=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )


def main():
    if not os.path.isfile(INPUT_GLTF):
        raise FileNotFoundError(INPUT_GLTF)
    backup_source()
    clear_scene()
    import_gltf()
    mech = flatten_to_single_mesh()
    normalize_mech(mech)
    export_gltf(mech)
    print(f"Wrote {OUTPUT_GLTF}")


if __name__ == "__main__":
    main()
