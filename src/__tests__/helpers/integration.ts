import type { HttpPort } from "@/interfaces/http/port.js";
import type { PromptPort } from "@/interfaces/prompt/port.js";
import { Context, Effect } from "effect";
import { type Mock, vi } from "vitest";

export const createMockHttp = (): {
  [K in keyof Context.Tag.Service<HttpPort>]: Mock<Context.Tag.Service<HttpPort>[K]>;
} => ({
  getJson: vi.fn<any>().mockReturnValue(Effect.void) as any,
  getText: vi.fn<any>().mockReturnValue(Effect.void) as any,
});

export const createMockPrompt = (): {
  [K in keyof Context.Tag.Service<PromptPort>]: Mock<Context.Tag.Service<PromptPort>[K]>;
} => ({
  selectItems: vi.fn().mockImplementation((items) => Effect.succeed(items)),
  resolveConflicts: vi
    .fn()
    .mockImplementation((conflicts) => Effect.succeed({ writes: conflicts, skipped: [] })),
  confirmInstall: vi.fn().mockReturnValue(Effect.void),
  confirmDependencyInstall: vi.fn().mockReturnValue(Effect.void),
  intro: vi.fn().mockReturnValue(Effect.void),
  outro: vi.fn().mockReturnValue(Effect.void),
  info: vi.fn().mockReturnValue(Effect.void),
  warn: vi.fn().mockReturnValue(Effect.void),
  error: vi.fn().mockReturnValue(Effect.void),
  success: vi.fn().mockReturnValue(Effect.void),
  log: vi.fn().mockReturnValue(Effect.void),
  text: vi.fn().mockImplementation((options: any) => Effect.succeed(options.defaultValue || "")),
  confirm: vi.fn().mockImplementation(() => Effect.succeed(true)),
  select: vi.fn().mockImplementation((options: any) => Effect.succeed(options.options[0].value)),
  multiselect: vi
    .fn()
    .mockImplementation((options: any) => Effect.succeed(options.options.map((o: any) => o.value))),
});
