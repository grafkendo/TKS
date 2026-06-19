"""
Export medium_mech from the review .blend into tools/assets/medium/scene.gltf
for packing into the game. Does not re-run orientation fixes.
"""
import bpy
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "medium")
BLEND_FILE = os.path.join(ASSET_DIR, "medium_mech_review.blend")
OUTPUT_GLTF = os.path.join(ASSET_DIR, "scene.gltf")


def main():
    if not os.path.isfile(BLEND_FILE):
        raise FileNotFoundError(BLEND_FILE)

    bpy.ops.wm.open_mainfile(filepath=BLEND_FILE)

    mech = bpy.data.objects.get("medium_mech")
    if not mech or mech.type != "MESH":
        meshes = [
            o
            for o in bpy.context.scene.objects
            if o.type == "MESH" and o.name not in {"ground_grid"}
        ]
        if not meshes:
            raise RuntimeError("No mech mesh found in blend file")
        mech = meshes[0]

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
    print(f"Exported {mech.name} -> {OUTPUT_GLTF}")
    print(
        "rotation",
        tuple(mech.rotation_euler),
        "location",
        tuple(mech.location),
        "scale",
        tuple(mech.scale),
    )


if __name__ == "__main__":
    main()
