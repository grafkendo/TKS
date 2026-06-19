Tackticus procedural low-poly mech (original asset).

- Review: lowpoly_mech_review.blend
- Export: scene.gltf → public/assets/mechs/lowpoly_mech.glb
- Rebuild: npm run export:mech:lowpoly
- Open in Blender: npm run open:lowpoly:mech

Stats: ~56 separate mesh objects in a hierarchy (~592 tris total).

Hierarchy (Outliner):
  mech_root
    legs_L / legs_R     — hip, thigh, knee, shin, foot, toe…
    torso               — pelvis, chest, backpack, vents…
    cockpit_grp         — cockpit, hud_band, head_guard
    arm_R               — pauldron, forearm, weapon_r (cannon)
    arm_L               — pauldron, forearm, weapon_l (missiles)
    rootGround          — attach empty at feet

Attach empties (for muzzle FX / hits):
  rightHand, leftHand, torso, head, shoulderR

Rebuild: npm run export:mech:lowpoly
Re-organize an edited .blend: npm run organize:lowpoly:mech
Open in Blender: npm run open:lowpoly:mech
