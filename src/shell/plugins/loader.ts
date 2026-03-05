import { appError, type AppError } from "@/core/errors.js";
import { PromptPort } from "@/core/ports.js";
import type { RegpickPlugin } from "@/types.js";
import { Effect, Option, Schema as S } from "effect";
import path from "node:path";
import { RegpickPluginSchema } from "../config/index.js";

export function loadPlugins(
  configuredPlugins: (string | unknown)[],
  cwd: string,
): Effect.Effect<RegpickPlugin[], AppError, PromptPort> {
  const decodePlugin = S.decodeUnknownOption(RegpickPluginSchema);

  return Effect.gen(function* () {
    // We request PromptPort to make it explicitly part of the requirements,
    // in case we need to log warnings in the future.
    yield* PromptPort;

    const results = yield* Effect.all(
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
              appError(
                "PluginError",
                `Failed to load plugin module: ${plugin} - ${err instanceof Error ? err.message : String(err)}`,
                err,
              ),
          }).pipe(
            Effect.flatMap((resolved) =>
              Option.match(decodePlugin(resolved), {
                onNone: () =>
                  Effect.fail(
                    appError("PluginError", `Invalid plugin provided from module: ${plugin}`),
                  ),
                onSome: (validPlugin) => Effect.succeed(validPlugin as unknown as RegpickPlugin),
              }),
            ),
          );
        }

        // Inline object or invalid item case
        return Option.match(decodePlugin(plugin), {
          onNone: () => Effect.fail(appError("PluginError", `Invalid inline plugin provided`)),
          onSome: (validPlugin) => Effect.succeed(validPlugin as unknown as RegpickPlugin),
        });
      }),
      { concurrency: "unbounded" },
    );

    return results.filter((p): p is RegpickPlugin => p !== null);
  });
}
