import { DoubleSide } from "three";
import {
  abs,
  attribute,
  cameraPosition,
  clamp,
  cos,
  cross,
  dot,
  float,
  Fn,
  fract,
  mix,
  normalize,
  normalLocal,
  normalWorld,
  positionGeometry,
  positionWorld,
  pow,
  sin,
  smoothstep,
  step,
  time,
  uniform,
  varying,
  vec3,
} from "three/tsl";
import {
  Color,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
} from "three/webgpu";

export const PACKAGE_COUNT = 80;

const upVec = vec3(0, 1, 0);

const rotateVecToDir = Fn(([v_immutable, dir_immutable, up_immutable]) => {
  const v = vec3(v_immutable);
  const dir = vec3(dir_immutable).normalize();
  const up = vec3(up_immutable).normalize();

  const xaxis = cross(up, dir).normalize();
  const yaxis = cross(dir, xaxis).normalize();
  const zaxis = dir;

  return vec3(
    xaxis.x.mul(v.x).add(yaxis.x.mul(v.y)).add(zaxis.x.mul(v.z)),
    xaxis.y.mul(v.x).add(yaxis.y.mul(v.y)).add(zaxis.y.mul(v.z)),
    xaxis.z.mul(v.x).add(yaxis.z.mul(v.y)).add(zaxis.z.mul(v.z)),
  );
});

const rotateVecEuler = Fn(([v_immutable, e_immutable]) => {
  const v = vec3(v_immutable);
  const e = vec3(e_immutable);

  const sx = sin(e.x),
    cx = cos(e.x);
  const sy = sin(e.y),
    cy = cos(e.y);
  const sz = sin(e.z),
    cz = cos(e.z);

  const x1 = v.x;
  const y1 = v.y.mul(cx).sub(v.z.mul(sx));
  const z1 = v.y.mul(sx).add(v.z.mul(cx));

  const x2 = x1.mul(cy).add(z1.mul(sy));
  const y2 = y1;
  const z2 = x1.mul(sy).negate().add(z1.mul(cy));

  const x3 = x2.mul(cz).sub(y2.mul(sz));
  const y3 = x2.mul(sz).add(y2.mul(cz));
  const z3 = z2;

  return vec3(x3, y3, z3);
});

export function createPackagesMaterial() {
  const material = new MeshStandardNodeMaterial({
    roughness: 0.3,
    metalness: 0.8,
  });

  const aSeed = attribute("aSeed", "vec4"); // x=angle, y=maxRadius, z=yOffset, w=speed
  const aRot = attribute("aRot", "vec3"); // initial random rotation speeds
  const aScale = attribute("aScale", "float");

  const colorAttr = attribute("aColor", "vec3");

  const vCurrentDist = varying(float(0));

  material.positionNode = Fn(() => {
    const localTime = time.mul(aSeed.w).add(aSeed.x);

    // Dynamic fall cycle - smoother and longer approach
    const rawCycle = float(1.0).sub(fract(localTime.mul(0.04)));
    // Reduced from 4.0 to 2.5 to make the final fall longer and more visible
    const inwardProgress = pow(rawCycle, 2.5);

    const startRadius = aSeed.y;
    // Go aggressively deep, effectively trying to hit zero
    const endRadius = float(0.01);
    const currentDist = mix(endRadius, startRadius, inwardProgress);

    // Pass to fragment shader to clip at the event horizon boundary
    vCurrentDist.assign(currentDist);

    const orbitMultiplier = mix(float(2.0), float(0.1), inwardProgress);
    const orbitAngle = aSeed.x.add(localTime.mul(orbitMultiplier));

    const ySquash = smoothstep(float(0.5), float(15.0), currentDist);
    const currentY = aSeed.z.mul(ySquash);

    const localPos = vec3(
      cos(orbitAngle).mul(currentDist),
      currentY,
      sin(orbitAngle).mul(currentDist),
    );

    const dirTowardsCenter = normalize(localPos.negate());

    // We let them be full scale until hitting the black hole entirely
    const singularityShrink = smoothstep(float(0.1), float(2.0), currentDist);
    // Sharp stretch logic returned but tamed for visual clarity at the boundary
    const stretchAmout = clamp(float(1.0).sub(currentDist.mul(1.5)), 0.0, 1.0);
    const stretchLen = stretchAmout.mul(1.2);
    const thinning = mix(float(1.0), float(0.2), stretchAmout);

    const s = aScale.mul(singularityShrink);

    const deformedGeom = vec3(
      positionGeometry.x.mul(s).mul(thinning),
      positionGeometry.y.mul(s).mul(thinning),
      positionGeometry.z.mul(s).add(stretchLen),
    );

    const tumbleAngles = aRot.mul(time);
    const posTumbled = rotateVecEuler(deformedGeom, tumbleAngles);

    const posAligned = rotateVecToDir(deformedGeom, dirTowardsCenter, upVec);

    const alignFactor = clamp(float(5.0).div(currentDist), 0.0, 1.0);

    const finalRotatedBox = mix(posTumbled, posAligned, alignFactor);

    return finalRotatedBox.add(localPos);
  })();

  // No fading, let the camera and depth buffer show the physics.
  material.colorNode = colorAttr;

  // Cut the rendering completely ONLY when it crosses the event horizon
  // match the 0.18 boundary we have in BlackHoleMaterial raymarching!
  material.opacityNode = mix(
    float(0.0),
    float(1.0),
    step(float(0.18), vCurrentDist),
  );
  // Zmieniamy z transparent: true na alphaTest, by obiekty renderowały się
  // w głównym passie (z depthWrite!) i poprawnie działała ich refrakcja w szkle!
  material.transparent = false;
  material.alphaTest = 0.5;

  return material;
}

export function createHolographicMaterial() {
  const material = new MeshPhysicalNodeMaterial({
    transparent: true,
    side: DoubleSide,
    transmission: 1.0, // Szkło w pełni przepuszczające, podstawa do łamania barw
    opacity: 1.0,
    roughness: 0.1, // Ultra-gładkie wyostrza separację kolorów
    ior: 2.4, // Diamantowy IOR - niezwykle silne załamywanie światła
    dispersion: 4.0, // Masywna aberracja chromatyczna (rozdzielenie barw) dla WebGPU w r160+
    thickness: 2.5, // Grubsza objętość to więcej fizycznego miejsca na rozejście się tarczy RGB
    clearcoat: 1.0, // Podbija jasność refleksów powierzchniowych i zmusza envMapę do odświeżeń
    attenuationColor: new Color(0xffffff), // Utrzymujemy neutralną/białą bazę bryły szkła
    attenuationDistance: 5.0,
  });

  const neonColor = uniform(new Color("#34d399")); // Jaskrawy szmaragdowo-zielony

  // Używamy normalWorld dla prawidłowego wzięcia pod uwagę obrotów nakładanych przez Svelte w <T.Group>
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const normal = normalize(normalWorld);

  // Światło z naszego reflektora w scenie (z Scene.svelte)
  const lightPos = vec3(5.0, 8.0, 5.0);
  const lightDir = normalize(lightPos.sub(positionWorld));

  // Zjawisko fresnela - abs zapobiega ucinaniu tylnych scian dla DoubleSide (wszystkie strony dają wynik 0 do 1)
  const viewDot = abs(dot(viewDir, normal));
  const fresnelTerm = float(1.0).sub(viewDot);

  const lightDot = abs(dot(lightDir, normal));

  // Maska krawędziowa symulująca wewnętrzne odbicia i rozchodzenie się promieni
  const edgeIllumination = pow(fresnelTerm, 12.0).mul(lightDot).mul(6.0);

  // Maska na płaskie ściany z użyciem lokalnego wektora normalnego
  const absLocalNormal = abs(normalLocal);
  const l1Norm = absLocalNormal.x.add(absLocalNormal.y).add(absLocalNormal.z);
  // Narrowing the mask to only the extremeties (> 1.15 avoids the broad shoulders of the curve)
  const edgeMask = smoothstep(float(1.15), float(1.35), l1Norm);

  material.emissiveNode = neonColor.mul(edgeIllumination).mul(edgeMask);
  material.colorNode = uniform(new Color(0xffffff));

  return material;
}

export function generatePackageAttributes(count: number) {
  const seeds = new Float32Array(count * 4);
  const rots = new Float32Array(count * 3);
  const scales = new Float32Array(count * 1);
  const colors = new Float32Array(count * 3);

  const tempColor = new Color();

  for (let i = 0; i < count; i++) {
    seeds[i * 4 + 0] = Math.random() * Math.PI * 2; // angle

    // Non-linear radius distribution - more packages closer to the event horizon, fewer on the outskirts
    const radiusRand = Math.pow(Math.random(), 1.5);
    seeds[i * 4 + 1] = 8 + radiusRand * 13; // maxRadius (zapewnia bezpieczeństwo przed zderzeniem ze szklanym klockiem)

    // Gaussian-like Y distribution for the Accretion Disk (dense at equator, rare at poles)
    const yRand = (Math.random() - 0.5) * 2.0;
    const yDistribution = Math.pow(Math.abs(yRand), 2.5) * Math.sign(yRand);
    seeds[i * 4 + 2] = yDistribution * 5.0; // yOffset (squashed disc)

    seeds[i * 4 + 3] = 0.015 + Math.random() * 0.05; // speed (slightly slower for majestic math feel)

    // Sterile, constrained rotations (less chaotic tumble)
    rots[i * 3 + 0] = (Math.random() - 0.5) * 0.1;
    rots[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
    rots[i * 3 + 2] = (Math.random() - 0.5) * 0.1;

    // Slightly smaller packages to simulate vastness
    scales[i] = 0.05 + Math.random() * 0.12;

    // Darker, colder color palette for vacuum theme
    tempColor.setHSL(0, 0, 0.1 + Math.random() * 0.25);
    colors[i * 3 + 0] = tempColor.r;
    colors[i * 3 + 1] = tempColor.g;
    colors[i * 3 + 2] = tempColor.b;
  }

  return { seeds, rots, scales, colors };
}
