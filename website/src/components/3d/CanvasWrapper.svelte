<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { WebGPURenderer } from 'three/webgpu';
  import Scene from './Scene.svelte';

  const createWebGPURenderer = (canvas: HTMLCanvasElement) => {
    return new WebGPURenderer({ canvas, antialias: true, alpha: true });
  };
</script>

<div class="canvas-container">
  <Canvas createRenderer={createWebGPURenderer}>
    <Scene />
  </Canvas>
</div>

<style>
  .canvas-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    overflow: hidden;
  }
</style>
