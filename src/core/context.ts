import type { CommandContext, RegpickConfig } from "@/types.js";
import { Context } from "effect";

export class CommandContextTag extends Context.Tag("CommandContext")<
  CommandContextTag,
  CommandContext
>() {}

export class ConfigTag extends Context.Tag("RegpickConfig")<ConfigTag, RegpickConfig>() {}
