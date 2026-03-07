import type { RegistryError } from "@/core/errors.js";
import type { Registry, RegistryFile, RegistryItem } from "@/domain/models/registry.js";
import { Context, Effect } from "effect";

export class RegistryPort extends Context.Tag("RegistryPort")<
  RegistryPort,
  {
    loadManifest(source: string): Effect.Effect<Registry, RegistryError>;
    loadFileContent(file: RegistryFile, item: RegistryItem): Effect.Effect<string, RegistryError>;
  }
>() {}
