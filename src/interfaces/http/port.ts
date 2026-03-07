import type { NetworkError } from "@/core/errors.js";
import { Context, Effect } from "effect";

export class HttpPort extends Context.Tag("HttpPort")<
  HttpPort,
  {
    getJson<T = unknown>(url: string, timeoutMs?: number): Effect.Effect<T, NetworkError>;
    getText(url: string, timeoutMs?: number): Effect.Effect<string, NetworkError>;
  }
>() {}
