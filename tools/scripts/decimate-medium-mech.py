"""
Decimate medium_mech in the review blend to a target triangle ratio, then save.
"""
import bpy
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "medium")
BLEND_FILE = os.path.join(ASSET_DIR, "medium_mech_review.blend")

# Keep this fraction of triangles (0.5 = about half).
TARGET_RATIO = 0.5


def tri_count(mesh):
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def get_mech():
    mech = bpy.data.objects.get("medium_mech")
    if mech and mech.type == "MESH":
        return mech
    meshes = [
        o
        for o in bpy.context.scene.objects
        if o.type == "MESH" and o.name not in {"ground_grid"}
    ]
    if not meshes:
        raise RuntimeError("No mech mesh found")
    return meshes[0]


def main():
    if not os.path.isfile(BLEND_FILE):
        raise FileNotFoundError(BLEND_FILE)

    bpy.ops.wm.open_mainfile(filepath=BLEND_FILE)
    mech = get_mech()
    mesh = mech.data

    before = tri_count(mesh)
    print(f"Before — verts {len(mesh.vertices)} tris {before}")

    bpy.ops.object.select_all(action="DESELECT")
    mech.select_set(True)
    bpy.context.view_layer.objects.active = mech

    mod = mech.modifiers.new(name="DecimateHalf", type="DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = TARGET_RATIO
    mod.use_collapse_triangulate = True

    bpy.ops.object.modifier_apply(modifier=mod.name)

    after = tri_count(mesh)
    print(f"After — verts {len(mesh.vertices)} tris {after} ({after / before:.1%} of original)")

    bpy.ops.wm.save_mainfile(filepath=BLEND_FILE)
    print(f"Saved {BLEND_FILE}")


if __name__ == "__main__":
    main()
