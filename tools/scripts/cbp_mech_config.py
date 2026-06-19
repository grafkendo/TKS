"""Paths for CBP 10 LP enemy mechs (mesh_0 .. mesh_5)."""
import os

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
TOOLS_ROOT = os.path.dirname(SCRIPTS_DIR)
REPO_ROOT = os.path.dirname(TOOLS_ROOT)

CBP_UPLOAD_DIR = os.path.join(REPO_ROOT, "uploads_files_6806162_cbp+10+lp")
SEPARATED_DIR = os.path.join(CBP_UPLOAD_DIR, "separated")
SKIP_NAMES = {"ground_grid"}
DECIMATE_RATIO = 0.10  # ~12k tris -> ~1.2k


def cbp_keys() -> list[str]:
    return [f"cbp{i}" for i in range(6)]


def separated_blend(index: int) -> str:
    return os.path.join(SEPARATED_DIR, f"mesh_{index}.blend")


def tools_asset_dir(key: str) -> str:
    return os.path.join(TOOLS_ROOT, "assets", key)


def export_gltf_path(key: str) -> str:
    return os.path.join(tools_asset_dir(key), "scene.gltf")


def public_glb_path(key: str) -> str:
    return os.path.join(REPO_ROOT, "public", "assets", "mechs", f"{key}.glb")
