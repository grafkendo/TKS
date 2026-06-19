"""Export decimated enemy review blend to tools/assets/<enemy>/scene.gltf."""
import sys
import bpy
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from enemy_mech_config import SKIP_NAMES, blend_path, export_gltf_path, require_enemy, tools_asset_dir


def main(key: str):
    require_enemy(key)
    path = blend_path(key)
    out = export_gltf_path(key)
    os.makedirs(tools_asset_dir(key), exist_ok=True)

    if not os.path.isfile(path):
        raise FileNotFoundError(path)

    bpy.ops.wm.open_mainfile(filepath=path)
    meshes = [
        o for o in bpy.context.scene.objects
        if o.type == "MESH" and o.name not in SKIP_NAMES
    ]
    if not meshes:
        raise RuntimeError(f"No meshes in {path}")

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]

    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLTF_SEPARATE",
        export_yup=True,
        export_apply=True,
        use_selection=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="NONE",
    )
    print(f"Exported {len(meshes)} meshes -> {out}")


if __name__ == "__main__":
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    if len(argv) != 1:
        raise SystemExit(f"Usage: blender --background --python {__file__} -- <enemy_key>")
    main(argv[0])
