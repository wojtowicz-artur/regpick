import { Layer } from "effect";
import { createNodeFileSystemLive } from "../fs/node.js";
import { createFetchHttpLive } from "../http/fetch.js";
import { createClackPromptLive } from "../prompt/clack.js";

// V6 DI Container - merges all infrastructure adapters
export const MainLive = Layer.mergeAll(
  createNodeFileSystemLive(),
  createFetchHttpLive(),
  createClackPromptLive(),
);

export const container = MainLive;
