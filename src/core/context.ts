import type { CommandContext } from "@/types.js";
import { Context } from "effect";

export class CommandContextTag extends Context.Tag("CommandContext")<
  CommandContextTag,
  CommandContext
>() {}
