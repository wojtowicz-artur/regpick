import { NetworkError } from "@/core/errors.js";
import { Effect, Layer } from "effect";
import { HttpPort } from "./port.js";

export const createFetchHttpLive = (options?: { signal?: AbortSignal }) =>
  Layer.succeed(HttpPort, {
    getJson: <T>(url: string, timeoutMs = 15000) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(url, {
            signal: options?.signal || AbortSignal.timeout(timeoutMs),
          });
          if (!response.ok) {
            throw new Error(
              `HTTP error! status: ${response.status} when fetching JSON from: ${url}`,
            );
          }
          return (await response.json()) as T;
        },
        catch: (cause) =>
          new NetworkError({
            message: `Failed to fetch JSON from: ${url}`,
            cause,
          }),
      }),
    getText: (url: string, timeoutMs = 15000) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(url, {
            signal: options?.signal || AbortSignal.timeout(timeoutMs),
          });
          if (!response.ok) {
            throw new Error(
              `HTTP error! status: ${response.status} when fetching text from: ${url}`,
            );
          }
          return await response.text();
        },
        catch: (cause) =>
          new NetworkError({
            message: `Failed to fetch text from: ${url}`,
            cause,
          }),
      }),
  });
