export type { RegistryAdapter, RawRegistryData, AdapterContext } from "./RegistryAdapter.js";
export type { TransformPlugin, TransformContext } from "./TransformPlugin.js";
export type { PackageManagerPlugin } from "./PackageManagerPlugin.js";
export type { PathResolverPlugin } from "./PathResolverPlugin.js";
export type { InstallCommand } from "../domain/models/index.js";

export type RegpickPlugin =
  | import("./RegistryAdapter.js").RegistryAdapter
  | import("./TransformPlugin.js").TransformPlugin
  | import("./PackageManagerPlugin.js").PackageManagerPlugin
  | import("./PathResolverPlugin.js").PathResolverPlugin;
