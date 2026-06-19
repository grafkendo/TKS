"""Frame medium_mech in all 3D viewports after Blender opens."""
import bpy


def frame_mech(_=None):
    mech = bpy.data.objects.get("medium_mech")
    if not mech:
        return None

    bpy.ops.object.select_all(action="DESELECT")
    mech.select_set(True)
    bpy.context.view_layer.objects.active = mech

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
    bpy.app.timers.register(frame_mech, first_interval=0.2)
