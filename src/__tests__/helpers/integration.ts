import type { HttpPort, PromptPort } from "@/core/ports.js";
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
  intro: vi.fn().mockReturnValue(Effect.void),
  outro: vi.fn().mockReturnValue(Effect.void),
  cancel: vi.fn().mockReturnValue(Effect.void),
  isCancel: vi
    .fn()
    .mockReturnValue(Effect.void)
    .mockReturnValue(Effect.void)
    .mockImplementation(((v: unknown) => Effect.succeed(v === Symbol.for("cancel"))) as any),
  info: vi.fn().mockReturnValue(Effect.void),
  warn: vi.fn().mockReturnValue(Effect.void),
  error: vi.fn().mockReturnValue(Effect.void),
  success: vi.fn().mockReturnValue(Effect.void),
  log: vi.fn().mockReturnValue(Effect.void),
  text: vi.fn().mockImplementation((options: any) => Effect.succeed(options.defaultValue || "")),
  confirm: vi
    .fn()
    .mockReturnValue(Effect.void)
    .mockReturnValue(Effect.void)
    .mockImplementation(() => Effect.succeed(true)),
  select: vi.fn().mockImplementation((options: any) => Effect.succeed(options.options[0].value)),
  multiselect: vi
    .fn()
    .mockImplementation((options: any) => Effect.succeed(options.options.map((o: any) => o.right))),
  autocompleteMultiselect: vi
    .fn()
    .mockImplementation((options: any) => Effect.succeed(options.options.map((o: any) => o.right))),
});
