"""
Decimate all heavy mech mesh parts in the review blend (~50% triangles), then save.
"""
import bpy
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "w9231")
BLEND_FILE = os.path.join(ASSET_DIR, "heavy_mech_review.blend")

TARGET_RATIO = 0.5
SKIP_NAMES = {"ground_grid"}


def tri_count(mesh):
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def mech_meshes():
    return [
        o
        for o in bpy.context.scene.objects
        if o.type == "MESH" and o.name not in SKIP_NAMES
    ]


def decimate_mesh(obj):
    mesh = obj.data
    before = tri_count(mesh)

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    mod = obj.modifiers.new(name="DecimateHalf", type="DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = TARGET_RATIO
    mod.use_collapse_triangulate = True

    # Decimate base mesh before armature deformation.
    while obj.modifiers.find(mod.name) > 0:
        bpy.ops.object.modifier_move_up(modifier=mod.name)

    bpy.ops.object.modifier_apply(modifier=mod.name)

    after = tri_count(mesh)
    print(f"{obj.name} — {before} -> {after} tris ({after / before:.1%})")
    return before, after


def main():
    if not os.path.isfile(BLEND_FILE):
        raise FileNotFoundError(BLEND_FILE)

    bpy.ops.wm.open_mainfile(filepath=BLEND_FILE)
    meshes = mech_meshes()
    if not meshes:
        raise RuntimeError("No heavy mech meshes found")

    total_before = 0
    total_after = 0
    for obj in meshes:
        before, after = decimate_mesh(obj)
        total_before += before
        total_after += after

    print(f"Total — {total_before} -> {total_after} tris ({total_after / total_before:.1%})")

    bpy.ops.wm.save_mainfile(filepath=BLEND_FILE)
    print(f"Saved {BLEND_FILE}")


if __name__ == "__main__":
    main()
