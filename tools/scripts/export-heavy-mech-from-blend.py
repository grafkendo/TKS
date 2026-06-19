"""
Export heavy mech rig + meshes from review .blend into tools/assets/w9231/scene.gltf.
Applies a temporary +90° X rotation to the rig (reverted after export) so the
skinned asset is Y-up in glTF/Three.js while the saved .blend stays Z-up for editing.
"""
import math
import bpy
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "w9231")
BLEND_FILE = os.path.join(ASSET_DIR, "heavy_mech_review.blend")
OUTPUT_GLTF = os.path.join(ASSET_DIR, "scene.gltf")
SKIP_NAMES = {"ground_grid"}

EXPORT_ROT_X_DEG = 90


def get_rig():
    return bpy.data.objects.get("heavy_mech_rig")


def mech_meshes():
    return [
        o
        for o in bpy.context.scene.objects
        if o.type == "MESH" and o.name not in SKIP_NAMES
    ]


def select_objects(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def main():
    if not os.path.isfile(BLEND_FILE):
        raise FileNotFoundError(BLEND_FILE)

    bpy.ops.wm.open_mainfile(filepath=BLEND_FILE)

    rig = get_rig()
    meshes = mech_meshes()
    if not rig or not meshes:
        raise RuntimeError("heavy_mech_rig / meshes not found")

    export_objs = [rig, *meshes]
    select_objects(export_objs)
    bpy.ops.transform.rotate(value=math.radians(EXPORT_ROT_X_DEG), orient_axis="X")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

    select_objects(export_objs)
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
    print(f"Exported Y-up corrected heavy mech -> {OUTPUT_GLTF}")
    print("Blend file not saved — review scene stays Z-up for editing")


if __name__ == "__main__":
    main()
