"""
Decimate + export all separated CBP mechs for in-game use.

Usage:
  blender --background --python tools/scripts/process-cbp-mechs.py
"""
from __future__ import annotations

import os
import sys
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cbp_mech_config import (
    DECIMATE_RATIO,
    SKIP_NAMES,
    cbp_keys,
    export_gltf_path,
    separated_blend,
    tools_asset_dir,
)

TEAM_BLUE = (0.231, 0.431, 0.914, 1.0)


def tri_count(mesh: bpy.types.Mesh) -> int:
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def mech_meshes() -> list[bpy.types.Object]:
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name not in SKIP_NAMES]


def ensure_team_material() -> bpy.types.Material:
    mat = bpy.data.materials.get("TeamPrimary")
    if mat:
        return mat
    mat = bpy.data.materials.new(name="TeamPrimary")
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = TEAM_BLUE
    bsdf.inputs["Roughness"].default_value = 0.82
    bsdf.inputs["Metallic"].default_value = 0.06
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def primary_mesh() -> bpy.types.Object:
    meshes = mech_meshes()
    if not meshes:
        raise RuntimeError("No meshes in scene")
    return max(meshes, key=lambda o: tri_count(o.data))


def decimate_mesh(obj: bpy.types.Object, ratio: float) -> tuple[int, int]:
    mesh = obj.data
    before = tri_count(mesh)

    mod = obj.modifiers.new(name="DecimateGame", type="DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    mod.use_collapse_triangulate = True

    depsgraph = bpy.context.evaluated_depsgraph_get()
    obj_eval = obj.evaluated_get(depsgraph)
    new_mesh = bpy.data.meshes.new_from_object(obj_eval)
    old_mesh = obj.data
    obj.data = new_mesh
    if old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)
    obj.modifiers.clear()

    after = tri_count(obj.data)
    return before, after


def process_index(index: int, key: str) -> None:
    blend = separated_blend(index)
    if not os.path.isfile(blend):
        raise FileNotFoundError(blend)

    bpy.ops.wm.open_mainfile(filepath=blend)
    obj = primary_mesh()
    mat = ensure_team_material()
    obj.name = key
    obj.data.name = key
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    total_before, total_after = decimate_mesh(obj, DECIMATE_RATIO)

    out_dir = tools_asset_dir(key)
    os.makedirs(out_dir, exist_ok=True)
    out = export_gltf_path(key)

    for scene_obj in bpy.context.scene.objects:
        scene_obj.select_set(scene_obj == obj)
    bpy.context.view_layer.objects.active = obj

    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLTF_SEPARATE",
        export_yup=True,
        export_apply=True,
        use_selection=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="NONE",
    )
    print(
        f"{key}: {blend} -> {out} "
        f"({total_before:,} -> {total_after:,} tris)"
    )


def main() -> None:
    for index, key in enumerate(cbp_keys()):
        process_index(index, key)
    print("All CBP mechs exported to tools/assets/cbp*/scene.gltf")


if __name__ == "__main__":
    main()
