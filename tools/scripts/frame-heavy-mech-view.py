"""Frame heavy mech rig in all 3D viewports after Blender opens."""
import bpy


def frame_heavy(_=None):
    focus = bpy.data.objects.get("heavy_mech_root")
    if not focus:
        focus = bpy.data.objects.get("heavy_mech_rig")
    if not focus:
        meshes = [
            o
            for o in bpy.context.scene.objects
            if o.type == "MESH" and o.name != "ground_grid"
        ]
        focus = meshes[0] if meshes else None
    if not focus:
        return None

    bpy.ops.object.select_all(action="DESELECT")
    focus.select_set(True)
    bpy.context.view_layer.objects.active = focus

    for window in bpy.context.window_manager.windows:
        screen = window.screen
        for area in screen.areas:
            if area.type != "VIEW_3D":
                continue
            region = next((r for r in area.regions if r.type == "WINDOW"), None)
            if not region:
                continue
            with bpy.context.temp_override(window=window, area=area, region=region):
                bpy.ops.view3d.view_selected(use_all_regions=False)
    return None


if __name__ == "__main__":
    bpy.app.timers.register(frame_heavy, first_interval=0.2)
