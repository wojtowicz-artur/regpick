import type { HttpPort, PromptPort } from "@/shell/runtime/ports";
import { type Mock, vi } from "vitest";

export const createMockHttp = (): {
  getJson: Mock<HttpPort["getJson"]>;
  getText: Mock<HttpPort["getText"]>;
} => ({
  getJson: vi.fn(),
  getText: vi.fn(),
});

export const createMockPrompt = (): {
  [K in keyof PromptPort]: Mock<PromptPort[K]>;
} => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn().mockImplementation(async (v) => v === Symbol.for("cancel")),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  text: vi
    .fn()
    .mockImplementation(
      async (options: Parameters<PromptPort["text"]>[0]) => options.defaultValue || "",
    ),
  confirm: vi.fn().mockImplementation(async () => true),
  select: vi
    .fn()
    .mockImplementation(
      async (options: Parameters<PromptPort["select"]>[0]) => options.options[0].value,
    ),
  multiselect: vi
    .fn()
    .mockImplementation(async (options: Parameters<PromptPort["multiselect"]>[0]) =>
      options.options.map((o) => o.value),
    ),
  autocompleteMultiselect: vi
    .fn()
    .mockImplementation(async (options: Parameters<PromptPort["autocompleteMultiselect"]>[0]) =>
      options.options.map((o) => o.value),
    ),
});
