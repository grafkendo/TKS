"""
Legacy helper — orientation is applied at export time (see export-heavy-mech-from-blend.py).
This script removes any stale orientation empties from the review blend.
"""
import bpy
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, "assets", "w9231")
BLEND_FILE = os.path.join(ASSET_DIR, "heavy_mech_review.blend")

STALE_EMPTIES = {"heavy_mech_root", "_export_orient_root"}


def main():
    if not os.path.isfile(BLEND_FILE):
        raise FileNotFoundError(BLEND_FILE)

    bpy.ops.wm.open_mainfile(filepath=BLEND_FILE)
    rig = bpy.data.objects.get("heavy_mech_rig")

    for name in STALE_EMPTIES:
        empty = bpy.data.objects.get(name)
        if not empty:
            continue
        if rig and rig.parent == empty:
            rig.parent = None
        bpy.data.objects.remove(empty, do_unlink=True)
        print(f"Removed {name}")

    bpy.ops.wm.save_mainfile(filepath=BLEND_FILE)
    print(f"Saved {BLEND_FILE}")


if __name__ == "__main__":
    main()
