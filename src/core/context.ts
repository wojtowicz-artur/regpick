import type { CommandContext, ResolvedRegpickConfig } from "@/domain/models/index.js";
import { Context } from "effect";

export class CommandContextTag extends Context.Tag("CommandContext")<
  CommandContextTag,
  CommandContext
>() {}

export class ConfigTag extends Context.Tag("RegpickConfig")<ConfigTag, ResolvedRegpickConfig>() {}
