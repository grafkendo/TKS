"""
Create light_mech_review.blend with solid team-red materials (no textures).
"""
import bpy
import os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "light")
INPUT_GLTF = os.path.join(ASSET_DIR, "scene.gltf")
OUTPUT_BLEND = os.path.join(ASSET_DIR, "light_mech_review.blend")

# Player team 1 primary red (matches TEAM_PALETTES in game).
TEAM_RED = (0.8, 0.27, 0.26, 1.0)
MAT_NAME = "TeamRed"


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


def make_team_red_material():
    mat = bpy.data.materials.get(MAT_NAME)
    if mat is None:
        mat = bpy.data.materials.new(name=MAT_NAME)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    output = nodes.new(type="ShaderNodeOutputMaterial")
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    output.location = (300, 0)
    bsdf.inputs["Base Color"].default_value = TEAM_RED
    bsdf.inputs["Roughness"].default_value = 0.86
    bsdf.inputs["Metallic"].default_value = 0.08
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def apply_solid_red_to_meshes(meshes, mat):
    for obj in meshes:
        if obj.data and hasattr(obj.data, "materials"):
            obj.data.materials.clear()
            obj.data.materials.append(mat)


def mech_meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name != "ground_grid"]


def main():
    if not os.path.isfile(INPUT_GLTF):
        raise FileNotFoundError(INPUT_GLTF)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=INPUT_GLTF)

    meshes = mech_meshes()
    if not meshes:
        raise RuntimeError("No light mech meshes imported")

    for obj in meshes:
        if obj.name.startswith("armor") or obj.name.startswith("body") or obj.name.startswith("foot"):
            pass
        if not obj.name.startswith("light_mech_"):
            obj.name = f"light_mech_{obj.name}"

    mat = make_team_red_material()
    apply_solid_red_to_meshes(meshes, mat)

    # Remove unused textured materials.
    for old in list(bpy.data.materials):
        if old.name != MAT_NAME and old.users == 0:
            bpy.data.materials.remove(old)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]

    bpy.ops.mesh.primitive_grid_add(size=6, location=(0, 0, 0))
    grid = bpy.context.active_object
    grid.name = "ground_grid"
    grid.display_type = "WIRE"
    grid.hide_select = True

    bpy.ops.object.light_add(type="SUN", location=(3, -3, 6))
    sun = bpy.context.active_object
    sun.data.energy = 2.5
    sun.rotation_euler = (0.9, 0.2, 0.8)

    mins, maxs = world_bbox(meshes)
    center = (mins + maxs) * 0.5
    size = maxs - mins
    radius = max(size.x, size.y, size.z) * 1.6

    cam = bpy.data.objects.get("Camera")
    if cam:
        cam.location = center + Vector((radius, -radius, radius * 0.7))
        direction = center - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND)
    print(f"Wrote {OUTPUT_BLEND} — {len(meshes)} parts, material {MAT_NAME}")


if __name__ == "__main__":
    main()
