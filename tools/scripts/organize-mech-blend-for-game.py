"""
Organize an existing Blender mech file into separate game-ready objects.

Splits a single joined mesh by loose parts (if needed), parents each piece
under group empties (legs / torso / arms), adds attach-point empties, and
exports scene.gltf.

Usage:
  blender --background --python tools/scripts/organize-mech-blend-for-game.py
  blender --background --python tools/scripts/organize-mech-blend-for-game.py -- path/to/file.blend
"""
from __future__ import annotations

import os
import sys
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mech_game_hierarchy import (
    collect_mech_meshes,
    export_mech_root,
    organize_mech_hierarchy,
    separate_loose_parts,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_BLEND = os.path.join(ROOT, "assets", "lowpoly_mech", "lowpoly_mech_review.blend")
DEFAULT_GLTF = os.path.join(ROOT, "assets", "lowpoly_mech", "scene.gltf")


def main(blend_path: str, gltf_path: str) -> None:
    if not os.path.isfile(blend_path):
        raise FileNotFoundError(blend_path)

    bpy.ops.wm.open_mainfile(filepath=blend_path)
    meshes = collect_mech_meshes()

    if len(meshes) == 1 and meshes[0].name in {"lowpoly_mech", "mech", "Mesh"}:
        meshes = separate_loose_parts(meshes[0])

    if not meshes:
        raise RuntimeError("No mesh objects found to organize")

    root = organize_mech_hierarchy(meshes)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"Saved organized hierarchy -> {blend_path}")
    export_mech_root(root, gltf_path)


if __name__ == "__main__":
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []

    blend = argv[0] if len(argv) > 0 else DEFAULT_BLEND
    gltf = argv[1] if len(argv) > 1 else DEFAULT_GLTF
    main(blend, gltf)
