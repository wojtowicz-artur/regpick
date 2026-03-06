import { Effect } from "effect";

// Minimal definition of the VFS Engine Port
// Handles all high-level virtual file system routines for memory and real disk.
export interface VFSFile {
  path: string;
  content: string;
}

export interface VFSEnginePort {
  readFile: (path: string) => Effect.Effect<VFSFile, Error, never>;
  writeFile: (file: VFSFile) => Effect.Effect<void, Error, never>;
  exists: (path: string) => Effect.Effect<boolean, never, never>;
  commitToDisk: () => Effect.Effect<void, Error, never>;
  normalizePath: (path: string) => string;
}
