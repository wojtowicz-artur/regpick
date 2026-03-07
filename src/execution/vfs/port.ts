import type { FileSystemError, PluginError, VfsError } from "@/core/errors.js";
import type { TransformContext, TransformPlugin } from "@/sdk/TransformPlugin.js";
import { Context, Effect } from "effect";

export type VFSFile = { id: string; content: string };
export type VFSOutput = { mutations: VFSFile[]; additionalDeps: string[] };

export class VFSPort extends Context.Tag("VFSPort")<
  VFSPort,
  {
    transform(
      files: VFSFile[],
      plugins: TransformPlugin[],
      ctx: TransformContext,
    ): Effect.Effect<VFSOutput, PluginError>;

    flush(output: VFSOutput, cwd: string): Effect.Effect<void, VfsError | FileSystemError>;
  }
>() {}
