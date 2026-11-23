// @vitest-environment node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AnimationMixer, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { expect, it } from "vitest";
import modelAsset from "@/assets/models/archy-rigged.glb.asset.json";
import { archyGestureClips } from "@/components/archy-gestures";
import { createArchyRig } from "@/components/archy-rig";

it("finishes the real rig without modifying its cached materials or detaching its sensors during animation", async () => {
  const bytes = await readFile(resolve("public", modelAsset.url.slice(1)));
  const gltf = await new GLTFLoader().parseAsync(
    new Uint8Array(bytes).buffer,
    "",
  );
  const source = gltf.scene;
  const { model, dispose } = createArchyRig(source);
  const headName = "Head_|_rounded_ivory_shell";
  const original = source.getObjectByName(headName) as Mesh<
    never,
    MeshStandardMaterial
  >;
  const head = model.getObjectByName(headName) as Mesh<
    never,
    MeshStandardMaterial
  >;
  try {
    expect(head.material).not.toBe(original.material);
    expect(head.material.color.getHexString()).toBe("426080");
    expect(original.material.color.getHexString()).not.toBe("426080");
    const eye = model.getObjectByName("Eye_LEDL") as Mesh<
      never,
      MeshStandardMaterial
    >;
    expect(eye.material.emissive.getHexString()).toBe("47e6f0");
    expect(gltf.animations.map((clip) => clip.name).sort()).toEqual([
      "Hop",
      "Idle",
      "Wave",
    ]);
    const receiver = model.getObjectByName("Acoustic receiver L")!;
    expect(receiver.parent?.parent?.name).toBe("head");
    expect(source.getObjectByName(receiver.name)).toBeUndefined();
    const mixer = new AnimationMixer(model);
    mixer
      .clipAction(gltf.animations.find((clip) => clip.name === "Hop")!)
      .play();
    mixer.update(0.01);
    const before = receiver.getWorldPosition(new Vector3());
    mixer.update(0.35);
    expect(
      receiver.getWorldPosition(new Vector3()).distanceTo(before),
    ).toBeGreaterThan(0.02);
    for (const gesture of archyGestureClips(model)) {
      expect(gesture.tracks.length).toBeGreaterThanOrEqual(2);
      mixer.stopAllAction();
      const headBone = model.getObjectByName("head")!;
      const neutral = headBone.quaternion.clone();
      mixer.clipAction(gesture).reset().play();
      mixer.update(.8);
      expect(neutral.angleTo(headBone.quaternion)).toBeGreaterThan(.05);
    }
    mixer.uncacheRoot(model);
  } finally {
    dispose();
  }
});
