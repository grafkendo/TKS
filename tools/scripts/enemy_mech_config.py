"""Paths and ids for Big Brothers enemy mech Blender tooling."""
import os

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
TOOLS_ROOT = os.path.dirname(SCRIPTS_DIR)
REPO_ROOT = os.path.dirname(TOOLS_ROOT)

# Team 2 primary blue (matches TEAM_PALETTES in game).
TEAM_BLUE = (0.231, 0.431, 0.914, 1.0)
MAT_NAME = "TeamBlue"
TARGET_DECIMATE_RATIO = 0.05
SKIP_NAMES = {"ground_grid"}
ENEMY_MECHS = {
    "needleer": {
        "dir": "needleer",
        "glb": "needleer.glb",
        "prefix": "needleer_",
        "blend": "needleer_review.blend",
    },
    "battle_scout": {
        "dir": "battle_scout",
        "glb": "battle_scout.glb",
        "prefix": "battle_scout_",
        "blend": "battle_scout_review.blend",
    },
    "armor_stopper": {
        "dir": "armor_stopper",
        "glb": "armor_stopper.glb",
        "prefix": "armor_stopper_",
        "blend": "armor_stopper_review.blend",
    },
    "wasp": {
        "dir": "wasp",
        "glb": "wasp.glb",
        "prefix": "wasp_",
        "blend": "wasp_review.blend",
    },
}

# Original Sketchfab download folders (full scan resolution).
SKETCHFAB_SOURCE_DIRS = {
    "needleer": "big_brothers_-_needleer",
    "battle_scout": "big_brothers_-_battle_scout",
    "armor_stopper": "big_brothers_-_armor_stopper",
    "wasp": "big_brother_-_the_wasp",
}


def sketchfab_source_gltf(key: str) -> str:
    folder = SKETCHFAB_SOURCE_DIRS.get(key)
    if not folder:
        return source_gltf(key)
    path = os.path.join(REPO_ROOT, folder, "scene.gltf")
    if os.path.isfile(path):
        return path
    return source_gltf(key)


def lowpoly_blend_path(key: str) -> str:
    return os.path.join(tools_asset_dir(key), f"{key}_lowpoly_test.blend")


def require_enemy(key: str) -> dict:
    if key not in ENEMY_MECHS:
        raise KeyError(f"Unknown enemy '{key}'. Choose: {', '.join(ENEMY_MECHS)}")
    return ENEMY_MECHS[key]


def source_gltf(key: str) -> str:
    cfg = require_enemy(key)
    return os.path.join(REPO_ROOT, "public", "assets", "mechs", cfg["dir"], "scene.gltf")


def tools_asset_dir(key: str) -> str:
    cfg = require_enemy(key)
    return os.path.join(TOOLS_ROOT, "assets", cfg["dir"])


def blend_path(key: str) -> str:
    cfg = require_enemy(key)
    return os.path.join(tools_asset_dir(key), cfg["blend"])


def export_gltf_path(key: str) -> str:
    return os.path.join(tools_asset_dir(key), "scene.gltf")


def public_glb_path(key: str) -> str:
    cfg = require_enemy(key)
    return os.path.join(REPO_ROOT, "public", "assets", "mechs", cfg["glb"])
