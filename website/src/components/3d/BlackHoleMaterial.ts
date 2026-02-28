import { DoubleSide } from "three";
import {
  Break,
  Fn,
  If,
  Loop,
  abs,
  cameraPosition,
  color,
  cos,
  dot,
  faceDirection,
  float,
  fract,
  length,
  max,
  mix,
  normalize,
  positionGeometry,
  positionWorld,
  remapClamp,
  sin,
  smoothstep,
  step,
  sub,
  time,
  uniform,
  vec2,
  vec3,
} from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";

const whiteNoise2D = Fn(([coord_immutable]) => {
  const coord = vec2(coord_immutable).toVar();
  return fract(sin(dot(coord, vec2(12.9898, 78.233))).mul(43758.5453));
});

const simpleRamp = Fn(([val, col1, pos1, col2, pos2, col3, pos3]) => {
  const step1 = smoothstep(pos1, pos2, val);
  const c12 = mix(col1, col2, step1);
  const step2 = smoothstep(pos2, pos3, val);
  return mix(c12, col3, step2);
});

const cheapVolumetricNoise = Fn(([p]) => {
  const t = time.mul(0.5);
  const q = p.mul(12.0).add(t);

  let n = dot(sin(q), vec3(0.333));
  n = n.add(dot(sin(q.mul(2.0)), vec3(0.166)));

  return n.add(1.0).mul(0.5);
});

export function createBlackHoleMaterial() {
  const material = new MeshBasicNodeMaterial({
    side: DoubleSide,
    transparent: true,
    // Enable depthWrite so it acts as a physical occluder for packages passing behind it!
    depthWrite: true,
  });

  const _step = uniform(float(0.025));
  const noiseAmp = uniform(float(0.01));
  const power = uniform(float(0.35));

  const originRadius = uniform(float(0.15));
  const bandWidth = uniform(float(0.12));

  const rampCol1 = uniform(color("#ffeebb")); // core hot, almost white-hot
  const rampPos1 = uniform(float(0.05));
  const rampCol2 = uniform(color("#d94f21")); // middle, intense glowing orange/red
  const rampPos2 = uniform(float(0.5));
  const rampCol3 = uniform(color("#0a0000")); // outer dark
  const rampPos3 = uniform(float(1.0));

  const rampEmission = uniform(float(4.0));
  const emissionColor = uniform(color("#1a0a05"));
  const flipVec = vec3(1, 1, -1);

  material.colorNode = Fn(() => {
    const objCoords = positionGeometry.mul(flipVec).xzy;
    const isBackface = step(0.0, faceDirection.negate());

    const camPointObj = cameraPosition.mul(flipVec).xzy;

    const startCoords = mix(objCoords, camPointObj, isBackface);
    const viewInWorld = normalize(sub(cameraPosition, positionWorld)).mul(
      flipVec,
    ).xzy;
    const rayDir = viewInWorld.negate().toVar();

    const noiseWhite = whiteNoise2D(objCoords.xy);

    const jitter = rayDir.mul(noiseWhite.mul(_step));
    const rayPos = startCoords.sub(jitter).toVar();

    const colorAcc = vec3(0).toVar();
    const alphaAcc = float(0).toVar();

    const bandMin = bandWidth.negate();
    const bandEnds = vec3(bandMin, 0.0, bandWidth);

    // Invariants pulled out of the raymarching loop
    const stepPower = _step.mul(power);

    Loop(32, ({ i }) => {
      // Early exit and full occlusion if ray hits the absolute event horizon
      If(length(rayPos).lessThan(0.18), () => {
        // Break out of the raymarching, but force solid darkness and opacity 1.0
        alphaAcc.assign(1.0);
        colorAcc.assign(vec3(0.0));
        Break();
      });

      const rNorm = normalize(rayPos);
      const rLen = length(rayPos);

      const steerMag = stepPower.div(rLen.mul(rLen));
      const cRange = remapClamp(rLen, 1.0, 0.5, 0.0, 1.0);
      const steer = rNorm.mul(steerMag.mul(cRange));
      const steeredDir = normalize(rayDir.sub(steer));

      const advance = rayDir.mul(_step);
      rayPos.addAssign(advance);

      const xyLen = length(rayPos.xy);
      const rotPhase = xyLen.mul(4.27).sub(time.mul(0.1));

      const s = sin(rotPhase);
      const c = cos(rotPhase);
      const uvRot = vec3(
        rayPos.x.mul(c).sub(rayPos.y.mul(s)),
        rayPos.x.mul(s).add(rayPos.y.mul(c)),
        rayPos.z,
      );

      const dz = sub(bandEnds, vec3(rayPos.z));
      const zQuad = dz.mul(dz).div(bandWidth);
      const zBand = max(bandWidth.sub(zQuad).div(bandWidth), 0.0);

      const nVal = cheapVolumetricNoise(uvRot.mul(2.0));
      const noiseAmpLen = abs(nVal).mul(length(zBand));

      const noiseNormalLen = noiseAmpLen.mul(1.002);

      const rampInput = xyLen
        .add(noiseAmpLen.sub(0.78).mul(1.5))
        .add(noiseAmpLen.sub(noiseNormalLen).mul(19.75));

      const baseCol = simpleRamp(
        rampInput,
        rampCol1,
        rampPos1,
        rampCol2,
        rampPos2,
        rampCol3,
        rampPos3,
      );
      const emissiveCol = baseCol.mul(rampEmission).add(emissionColor);

      const rLenNow = length(rayPos);
      const insideCore = float(step(rLenNow, originRadius));
      const shadedCol = mix(emissiveCol, vec3(0), insideCore);

      const zAbs = abs(rayPos.z);
      const aNoise = noiseAmpLen.sub(0.75).mul(-0.6);
      const aPre = zAbs.add(aNoise);

      const aRadial = mix(1.0, 0.0, smoothstep(0.0, 1.0, xyLen));
      const aBand = mix(aRadial, 0.0, smoothstep(0.0, bandWidth, aPre));

      const alphaLocal = mix(aBand, 1.0, insideCore);

      const oneMinusA = float(1.0).sub(alphaAcc);
      const weight = oneMinusA.mul(alphaLocal);
      const newColor = mix(colorAcc, shadedCol, weight);
      const newAlpha = mix(alphaAcc, 1.0, alphaLocal);

      rayPos.addAssign(advance);
      rayDir.assign(steeredDir);
      colorAcc.assign(newColor);
      alphaAcc.assign(newAlpha);

      If(alphaAcc.greaterThan(0.99), () => {
        Break();
      });
    });

    const trans = float(1.0).sub(alphaAcc);
    const finalColor = mix(colorAcc, vec3(0), trans);

    return finalColor;
  })();

  return material;
}
