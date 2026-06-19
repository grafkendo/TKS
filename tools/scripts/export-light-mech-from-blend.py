"""Export light mech meshes from review .blend to tools/assets/light/scene.gltf."""
import bpy
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "light")
BLEND_FILE = os.path.join(ASSET_DIR, "light_mech_review.blend")
OUTPUT_GLTF = os.path.join(ASSET_DIR, "scene.gltf")
SKIP_NAMES = {"ground_grid"}


def main():
    if not os.path.isfile(BLEND_FILE):
        raise FileNotFoundError(BLEND_FILE)

    bpy.ops.wm.open_mainfile(filepath=BLEND_FILE)
    meshes = [
        o
        for o in bpy.context.scene.objects
        if o.type == "MESH" and o.name not in SKIP_NAMES
    ]
    if not meshes:
        raise RuntimeError("No light mech meshes found")

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]

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
    print(f"Exported {len(meshes)} meshes -> {OUTPUT_GLTF}")


if __name__ == "__main__":
    main()
