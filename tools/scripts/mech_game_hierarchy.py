"""
Shared helpers — organize mech mesh objects into a game-ready hierarchy.

One glTF with separate named meshes + attach empties (not one merged blob).
"""
from __future__ import annotations

import bpy
from mathutils import Vector

SKIP_OBJECTS = {
    "ground_grid",
    "Camera",
    "Light",
    "Sun",
    "Area",
}

LEG_MARKERS = ("hip_", "thigh_", "knee_", "shin_", "ankle_", "foot_", "toe_")
ARM_R_MARKERS = (
    "shoulder_joint_R", "pauldron_R", "upper_arm_R", "elbow_R", "forearm_R",
    "cannon_", "muzzle_", "ammo_box",
)
ARM_L_MARKERS = (
    "shoulder_joint_L", "pauldron_L", "upper_arm_L", "elbow_L", "forearm_L",
    "missile_", "pod_",
)
TORSO_MARKERS = (
    "pelvis", "waist_skirt", "torso_", "chest_plate", "belly_plate", "side_skirt_",
    "collar", "backpack", "vent_", "reactor_cap", "searchlight", "light_bracket",
)
COCKPIT_MARKERS = ("cockpit", "hud_band", "head_guard")
DETAIL_MARKERS = ("sensor_mast", "radar_dish")


def is_skip(obj: bpy.types.Object) -> bool:
    if obj.type not in {"MESH", "EMPTY"}:
        return True
    if obj.name in SKIP_OBJECTS:
        return True
    if obj.type == "MESH" and "grid" in obj.name.lower():
        return True
    return False


def collect_mech_meshes() -> list[bpy.types.Object]:
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and not is_skip(o)]


def separate_loose_parts(obj: bpy.types.Object) -> list[bpy.types.Object]:
    """Split a single joined mesh back into loose islands."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    created = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    print(f"Separated {obj.name} -> {len(created)} loose parts")
    return created


def classify_part(name: str) -> str:
    n = name
    if any(m in n for m in COCKPIT_MARKERS):
        return "cockpit"
    if any(m in n for m in ARM_R_MARKERS):
        return "arm_R"
    if any(m in n for m in ARM_L_MARKERS):
        return "arm_L"
    if any(n.startswith(m) or m in n for m in LEG_MARKERS):
        return "legs_L" if "_L" in n else "legs_R"
    if any(m in n for m in TORSO_MARKERS):
        return "torso"
    if any(m in n for m in DETAIL_MARKERS):
        return "torso"
    return "torso"


def _make_empty(name: str, location: Vector = Vector((0.0, 0.0, 0.0))) -> bpy.types.Object:
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=location)
    empty = bpy.context.active_object
    empty.name = name
    empty.empty_display_size = 0.12
    return empty


def _find_part(meshes: list[bpy.types.Object], *needles: str) -> bpy.types.Object | None:
    for obj in meshes:
        low = obj.name.lower()
        if any(n.lower() in low for n in needles):
            return obj
    return None


def _world_tail(obj: bpy.types.Object, local: Vector) -> Vector:
    return obj.matrix_world @ local


def organize_mech_hierarchy(meshes: list[bpy.types.Object]) -> bpy.types.Object:
    """Parent meshes under group empties + add attach-point empties for the game."""
    if not meshes:
        raise RuntimeError("No mech meshes to organize")

    # Remove old hierarchy roots from prior runs.
    for old in list(bpy.context.scene.objects):
        if old.name in {"mech_root", "legs_L", "legs_R", "torso", "arm_R", "arm_L", "cockpit_grp"}:
            bpy.data.objects.remove(old, do_unlink=True)
    for old in list(bpy.context.scene.objects):
        if old.type == "EMPTY" and old.name in {
            "rightHand", "leftHand", "torso", "head", "rootGround", "shoulderR", "shoulderL",
        }:
            bpy.data.objects.remove(old, do_unlink=True)

    root = _make_empty("mech_root", Vector((0.0, 0.0, 0.0)))
    groups = {
        "legs_L": _make_empty("legs_L"),
        "legs_R": _make_empty("legs_R"),
        "torso": _make_empty("torso"),
        "arm_R": _make_empty("arm_R"),
        "arm_L": _make_empty("arm_L"),
        "cockpit_grp": _make_empty("cockpit_grp"),
    }
    for g in groups.values():
        g.parent = root

    buckets: dict[str, list[bpy.types.Object]] = {k: [] for k in groups}
    bucket_alias = {"cockpit": "cockpit_grp"}
    for obj in meshes:
        key = classify_part(obj.name)
        key = bucket_alias.get(key, key)
        buckets[key].append(obj)

    for key, objs in buckets.items():
        parent = groups[key]
        for obj in objs:
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            parent.select_set(True)
            bpy.context.view_layer.objects.active = parent
            bpy.ops.object.parent_set(type="OBJECT", keep_transform=True)

    # Game attach empties (names match GltfMech / README).
    muzzle = _find_part(meshes, "muzzle_brake", "cannon_barrel", "cannon_sleeve")
    pod = _find_part(meshes, "missile_housing", "missile_tube", "pod_lid")
    cockpit = _find_part(meshes, "cockpit")
    chest = _find_part(meshes, "torso_core", "chest_plate", "pelvis")
    pauldron_r = _find_part(meshes, "pauldron_R", "shoulder_joint_R")

    def parent_keep(child: bpy.types.Object, parent_obj: bpy.types.Object) -> None:
        bpy.ops.object.select_all(action="DESELECT")
        child.select_set(True)
        parent_obj.select_set(True)
        bpy.context.view_layer.objects.active = parent_obj
        bpy.ops.object.parent_set(type="OBJECT", keep_transform=True)

    if muzzle:
        hand = _make_empty("rightHand", _world_tail(muzzle, Vector((0.0, -0.08, 0.0))))
        parent_keep(hand, muzzle)
    else:
        hand = _make_empty("rightHand", Vector((0.95, -0.55, 0.92)))
        parent_keep(hand, groups["arm_R"])

    if pod:
        left = _make_empty("leftHand", _world_tail(pod, Vector((-0.12, 0.0, 0.0))))
        parent_keep(left, pod)
    else:
        left = _make_empty("leftHand", Vector((-0.95, 0.0, 0.96)))
        parent_keep(left, groups["arm_L"])

    if cockpit:
        head = _make_empty("head", _world_tail(cockpit, Vector((0.0, -0.12, 0.12))))
        parent_keep(head, cockpit)
    else:
        head = _make_empty("head", Vector((0.0, -0.18, 1.58)))
        parent_keep(head, groups["cockpit_grp"])

    if chest:
        torso_ap = _make_empty("torso", _world_tail(chest, Vector((0.0, -0.12, 0.0))))
        parent_keep(torso_ap, chest)
    else:
        torso_ap = _make_empty("torso", Vector((0.0, 0.0, 1.22)))
        parent_keep(torso_ap, groups["torso"])

    ground = _make_empty("rootGround", Vector((0.0, 0.0, 0.0)))
    parent_keep(ground, root)

    if pauldron_r:
        shoulder = _make_empty("shoulderR", pauldron_r.matrix_world.translation)
        parent_keep(shoulder, pauldron_r)

    # Rename key weapon meshes so material routing picks them up.
    if muzzle and muzzle.name != "weapon_r":
        muzzle.name = "weapon_r"
    if pod and "weapon_l" not in pod.name:
        pod.name = "weapon_l"

    print("Hierarchy:")
    for obj in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if obj.name in {root.name, *groups.keys()} or obj.parent in groups.values() or obj.parent == root:
            par = obj.parent.name if obj.parent else "-"
            print(f"  {obj.name} ({obj.type}) <- {par}")

    return root


def export_mech_root(root: bpy.types.Object, gltf_path: str) -> None:
    """Export mech_root and all descendants."""
    def gather(obj: bpy.types.Object, out: list[bpy.types.Object]) -> None:
        out.append(obj)
        for child in obj.children:
            gather(child, out)

    export_set: list[bpy.types.Object] = []
    gather(root, export_set)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_set:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root

    bpy.ops.export_scene.gltf(
        filepath=gltf_path,
        export_format="GLTF_SEPARATE",
        export_yup=True,
        export_apply=True,
        use_selection=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="NONE",
    )
    print(f"Exported {len(export_set)} objects -> {gltf_path}")
