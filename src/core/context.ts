import { Context } from "effect";
import type { CommandContext } from "@/types.js";

export class CommandContextTag extends Context.Tag("CommandContext")<
  CommandContextTag,
  CommandContext
>() {}
