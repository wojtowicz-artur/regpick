<script lang="ts">
  import { onDestroy } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { InstancedBufferAttribute } from "three";
  import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
  import BlackHole from "./BlackHole.svelte";
  import { createPackagesMaterial, createHolographicMaterial, generatePackageAttributes, PACKAGE_COUNT } from "./PackagesMaterial";

  import { pass } from "three/tsl";
  import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
  import { RenderPipeline } from "three/webgpu";
  import { Environment } from "@threlte/extras";

  const { seeds, rots, scales, colors } = generatePackageAttributes(PACKAGE_COUNT);
  const packagesMaterial = createPackagesMaterial();
  const fluidMaterial = createHolographicMaterial();

  // Cache geometries for memory efficiency and prevent recreation during potential re-renders
  const instancedPackageGeometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.15);
  // Mocno redukujemy masę i ostrość, to ma być latająca stacja, nie budynek
  const fluidBlockGeometry = new RoundedBoxGeometry(1.0, 1.0, 1.0, 4, 0.2);

  const { renderer, scene, camera, size, autoRender } = useThrelte();

  // Set autoRender to false so we can handle our own render loop with post-processing
  autoRender.set(false);

  let postProcessing: RenderPipeline | undefined;
  let currentScenePass: any;
  let rendererSize = { width: 0, height: 0, pixelRatio: 1 };

  $: if (renderer && scene && $camera && $size && $size.width > 0) {
    let currentPixelRatio = renderer.getPixelRatio();
    // If we don't have postProcessing yet or if the window resized
    if (!postProcessing || rendererSize.width !== $size.width || rendererSize.height !== $size.height || rendererSize.pixelRatio !== currentPixelRatio) {
      if (postProcessing) {
        // Dispose old nodes to prevent WebGPU memory leaks
        postProcessing.dispose();
      }

      // Track size to prevent infinite loops
      rendererSize.width = $size.width;
      rendererSize.height = $size.height;
      rendererSize.pixelRatio = currentPixelRatio;

      // Force renderer size to ensure Three.js isn't caught between canvas ref flows using default 600x300 buffers
      renderer.setSize($size.width, $size.height, false);

      postProcessing = new RenderPipeline(renderer);

      // Create the scene pass and bloom pass
      currentScenePass = pass(scene, $camera);
      // bloom( node, strength, radius, threshold )
      const bloomPass = bloom(currentScenePass, 0.6, 0.2, 0.9);

      // Output nodes via RenderPipeline
      postProcessing.outputNode = currentScenePass.add(bloomPass);
    }
  }

  // Obsługa prawidłowego re-size'u okna bez rozmywania Bloom Post-Processingu

  // Garbage Collection for materials when component is unmounted
  onDestroy(() => {
    packagesMaterial?.dispose();
    fluidMaterial?.dispose();
    instancedPackageGeometry.dispose();
    fluidBlockGeometry.dispose();

    if (postProcessing && typeof postProcessing.dispose === 'function') {
      postProcessing.dispose();
    }
  });

  let blockRotY = 0;
  let blockPosY = 0;
  let blockTime = 0;

  // Reactive responsive properties
  $: isMobile = $size && $size.width < 768;
  $: blockScale = isMobile ? 1.8 : 2.8;
  $: blockPosX = isMobile ? 0 : -3.5;
  $: blockOffsetZ = isMobile ? 0 : 3.0;

  useTask((delta) => {
    if (postProcessing) {
      postProcessing.render();
    }

    blockTime += delta;
    blockRotY += delta * 0.3;
    blockPosY = Math.sin(blockTime * 1.5) * 0.2;
  }, { renderOrder: 1 });
</script>

<!-- Camera -->
<T.PerspectiveCamera
  makeDefault
  position={[-5, 2, 15]}
  fov={45}
  lookAt={[2, 0, 0]}
/>

<!-- Environment IBL -->
<Environment url="https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/textures/equirectangular/royal_esplanade_1k.hdr" isBackground={false} />

<!-- Void Darkness -->
<T.AmbientLight intensity={0.1} />

<!-- Black hole main light (Optimized from 3 stacked to 1) -->
<T.PointLight
  position={[12, 1, -12]}
  color="#ffaa22"
  intensity={800}
  distance={120}
  decay={1.8}
/>

<!-- Regpick spotlight -->
<T.SpotLight
  position={[5, 8, 5]}
  angle={0.5}
  penumbra={0.5}
  color="#ffffff"
  intensity={40}
  distance={20}
/>

<!-- Group for both the Black Hole and its orbiting Packages to share the same local coordinate system space -->
<T.Group position={[12, 1, -12]}>
  <T.Group rotation={[0.25, -0.4, -0.1]}>
    <BlackHole />
  </T.Group>

  <!-- Packages -->
  <T.InstancedMesh args={[undefined, undefined, PACKAGE_COUNT]} frustumCulled={false}>
    <T is={instancedPackageGeometry}>
      <T is={InstancedBufferAttribute} attach={"attributes.aSeed"} args={[seeds, 4]} />
      <T is={InstancedBufferAttribute} attach={"attributes.aRot"} args={[rots, 3]} />
      <T is={InstancedBufferAttribute} attach={"attributes.aScale"} args={[scales, 1]} />
      <T is={InstancedBufferAttribute} attach={"attributes.aColor"} args={[colors, 3]} />
    </T>
    <T is={packagesMaterial} attach="material" />
  </T.InstancedMesh>
</T.Group>

<!-- Regpick Block Monolith -->
<!-- Przeniesiony dołem, by pływał swobodnie za oknem CLI, łapiąc refleksy z boku  -->
<T.Group position={[blockPosX, blockPosY - (isMobile ? 1 : -3), blockOffsetZ]} scale={blockScale}>
  <T.Mesh geometry={fluidBlockGeometry} material={fluidMaterial} rotation={[0.4, blockRotY, 0.2]} />
</T.Group>
