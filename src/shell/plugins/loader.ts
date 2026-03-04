import type { RegpickPlugin } from "@/types.js";
import { Effect, Option, Schema as S } from "effect";
import path from "node:path";
import { PluginSchema } from "../config/index.js";

export function loadPlugins(
  configuredPlugins: (string | unknown)[],
  cwd: string,
): Effect.Effect<RegpickPlugin[], never> {
  const decodePlugin = S.decodeUnknownOption(PluginSchema);

  return Effect.all(
    configuredPlugins.map((plugin) => {
      // Dynamic import case
      if (typeof plugin === "string") {
        let importPath = plugin;
        if (plugin.startsWith(".") || plugin.startsWith("/")) {
          importPath = path.resolve(cwd, plugin);
        }

        return Effect.tryPromise({
          try: () => import(importPath).then((i) => i.default || i.plugin || i),
          catch: (err) =>
            new Error(
              `[regpick] Failed to load plugin module: ${plugin} - ${err instanceof Error ? err.message : String(err)}`,
            ),
        }).pipe(
          Effect.flatMap((resolved) =>
            Option.match(decodePlugin(resolved), {
              onNone: () =>
                Effect.fail(new Error(`[regpick] Invalid plugin provided from module: ${plugin}`)),
              onSome: (validPlugin) => Effect.succeed(validPlugin as unknown as RegpickPlugin),
            }),
          ),
          Effect.catchAll((err) => {
            console.warn(err.message);
            return Effect.succeed(null);
          }),
        );
      }

      // Inline object or invalid item case
      return Option.match(decodePlugin(plugin), {
        onNone: () => {
          console.warn(`[regpick] Invalid plugin provided`);
          return Effect.succeed(null);
        },
        onSome: (validPlugin) => Effect.succeed(validPlugin as unknown as RegpickPlugin),
      });
    }),
    { concurrency: "unbounded" },
  ).pipe(Effect.map((results) => results.filter((p): p is RegpickPlugin => p !== null)));
}
