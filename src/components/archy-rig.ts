import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import { SkeletonUtils } from "three-stdlib";

// Names before the separator are the material slots in the supplied rig.
// Values are sRGB paint colours, metalness and roughness.
type Finish = readonly [
  color: string,
  metalness: number,
  roughness: number,
  glow?: string,
  intensity?: number,
];
const finishes: Record<string, Finish> = {
  Shell: ["#426080", 0.28, 0.32],
  "Inlaid ceramic": ["#93adc0", 0.24, 0.35],
  Limbs: ["#27394e", 0.44, 0.35],
  Joints: ["#9db5c2", 0.78, 0.28],
  Circuit: ["#87aebc", 0.64, 0.34],
  Visor: ["#0a182a", 0.2, 0.23],
  Glasses: ["#78bfce", 0.67, 0.26],
  Face: ["#89f7fb", 0.06, 0.31, "#47e6f0", 1.55],
  Chest: ["#10283b", 0.34, 0.24],
  Network: ["#66ccce", 0.24, 0.3, "#22bfc6", 0.75],
  "T node": ["#ffc187", 0.18, 0.28, "#ff9b4f", 0.85],
  "A node": ["#80e7f3", 0.17, 0.26, "#3fbed6", 0.8],
  "P node": ["#b9cfda", 0.32, 0.32, "#80bec3", 0.35],
  Antenna: ["#ffba7e", 0.22, 0.28, "#ff9437", 0.9],
};

/** The loader caches the source model. Each animated instance owns its finish and earpieces. */
export function createArchyRig(source: Object3D) {
  const model = SkeletonUtils.clone(source);
  const materials = new Map<string, MeshStandardMaterial>();
  const finish = (original: Material, part: string) => {
    if (!(original instanceof MeshStandardMaterial)) return original;
    let key = original.name.split(" |")[0] ?? original.name;
    if (key === "Shell" && /^(Hand|Chest)/.test(part)) key = "Inlaid ceramic";
    const spec = finishes[key];
    if (!spec) return original;
    const existing = materials.get(key);
    if (existing) return existing;
    const [paint, metalness, roughness, glow, intensity] = spec;
    const material = original.clone();
    material.color.set(paint);
    material.metalness = metalness;
    material.roughness = roughness;
    material.emissive.set(glow ?? "#000000");
    material.emissiveIntensity = intensity ?? 0;
    materials.set(key, material);
    return material;
  };
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material: Material) =>
          finish(material, object.name),
        )
      : finish(object.material, object.name);
  });

  const head = model.getObjectByName("head");
  const shell = materials.get("Shell"),
    ring = materials.get("Network"),
    cap = materials.get("Visor");
  const geometries: BufferGeometry[] = [];
  if (head && shell && ring && cap) {
    // The mounting points are in the GLB's neutral pose. attach() preserves that pose
    // while letting the two acoustic sensors follow every head and body animation.
    model.updateMatrixWorld(true);
    const housing = new CylinderGeometry(0.202, 0.19, 0.12, 32).rotateX(
      Math.PI / 2,
    );
    const seal = new TorusGeometry(0.156, 0.018, 8, 32);
    const receiver = new CylinderGeometry(0.137, 0.137, 0.02, 32).rotateX(
      Math.PI / 2,
    );
    geometries.push(housing, seal, receiver);
    const hardware = new Group();
    for (const side of [-1, 1]) {
      const ear = new Group();
      ear.name = side < 0 ? "Acoustic receiver R" : "Acoustic receiver L";
      ear.position.set(side * 1.025, 2.32, 0.13);
      ear.rotation.y = side * 1.03;
      const face = new Mesh(receiver, cap);
      face.position.z = 0.067;
      const rim = new Mesh(seal, ring);
      rim.position.z = 0.074;
      ear.add(new Mesh(housing, shell), face, rim);
      hardware.add(ear);
    }
    model.add(hardware);
    head.attach(hardware);
  }
  return {
    model,
    recolor(direction: "atlas" | "signal" | "journal") {
      const [shellColor, ceramic, light] = {
        atlas: ["#24665b", "#dee8df", "#8ff1d2"],
        signal: ["#25445f", "#a6bdcc", "#79eff8"],
        journal: ["#78533b", "#ede1c9", "#ffc484"],
      }[direction] as [string, string, string];
      materials.get("Shell")?.color.set(shellColor);
      materials.get("Inlaid ceramic")?.color.set(ceramic);
      for (const slot of ["Network", "Face", "A node"]) {
        materials.get(slot)?.color.set(light);
        materials.get(slot)?.emissive.set(light);
      }
      materials.get("Glasses")?.color.set(light);
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials.values()) material.dispose();
    },
  };
}
