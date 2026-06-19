"""
Split each mesh_* object in cbp 10 lp.blend into its own .blend file.

Usage:
  blender --background "path/to/cbp 10 lp.blend" --python tools/scripts/split-cbp-mechs-to-blends.py
"""
from __future__ import annotations

import os
import bpy
from mathutils import Vector

SRC = bpy.data.filepath
if not SRC:
    raise SystemExit("Open or pass the source .blend on the command line.")

OUT_DIR = os.path.join(os.path.dirname(SRC), "separated")
os.makedirs(OUT_DIR, exist_ok=True)


def frame_camera_on(obj: bpy.types.Object) -> None:
    for old in [o for o in bpy.data.objects if o.type in {"CAMERA", "LIGHT"}]:
        bpy.data.objects.remove(old, do_unlink=True)

    bpy.ops.object.light_add(type="SUN", location=(3, -3, 6))
    sun = bpy.context.active_object
    sun.name = "Sun"
    sun.data.energy = 2.5

    bpy.ops.object.camera_add()
    cam = bpy.context.active_object
    cam.name = "Camera"
    bpy.context.scene.camera = cam

    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for corner in obj.bound_box:
        w = obj.matrix_world @ Vector(corner)
        mins = Vector((min(mins.x, w.x), min(mins.y, w.y), min(mins.z, w.z)))
        maxs = Vector((max(maxs.x, w.x), max(maxs.y, w.y), max(maxs.z, w.z)))
    center = (mins + maxs) * 0.5
    span = max(maxs.x - mins.x, maxs.y - mins.y, maxs.z - mins.z)
    dist = max(span * 2.2, 1.5)
    cam.location = center + Vector((dist * 0.8, -dist, dist * 0.55))
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    mesh_names = sorted(o.name for o in bpy.data.objects if o.type == "MESH")
    if not mesh_names:
        raise RuntimeError("No mesh objects found in scene")

    saved: list[str] = []
    for name in mesh_names:
        bpy.ops.wm.open_mainfile(filepath=SRC)
        keep = bpy.data.objects.get(name)
        if keep is None:
            continue

        bpy.ops.object.select_all(action="DESELECT")
        for obj in list(bpy.context.scene.objects):
            if obj != keep:
                obj.select_set(True)
        bpy.ops.object.delete()

        frame_camera_on(keep)

        out_path = os.path.join(OUT_DIR, f"{name}.blend")
        bpy.ops.wm.save_as_mainfile(filepath=out_path)
        verts = len(keep.data.vertices)
        tris = len(keep.data.polygons)
        print(f"Wrote {out_path} ({verts} verts, {tris} tris)")
        saved.append(out_path)

    print(f"Done — {len(saved)} files in {OUT_DIR}")


if __name__ == "__main__":
    main()
