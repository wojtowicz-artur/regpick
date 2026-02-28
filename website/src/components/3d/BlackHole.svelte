<script lang="ts">
  import { onDestroy } from "svelte";
  import { T } from "@threlte/core";
  import { SphereGeometry } from "three";
  import { createBlackHoleMaterial } from "./BlackHoleMaterial";

  const bhMaterial = createBlackHoleMaterial();
  const bhGeometry = new SphereGeometry(1, 32, 32);

  onDestroy(() => {
    bhMaterial?.dispose();
    bhGeometry?.dispose();
  });
</script>

<T.Mesh scale={3.5} geometry={bhGeometry}>
  <T is={bhMaterial} attach="material" />
</T.Mesh>
