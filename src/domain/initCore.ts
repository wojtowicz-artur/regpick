type InitDecision = "created" | "ask-overwrite" | "overwrite" | "keep" | "cancelled";

export function decideInitAfterFirstWrite(firstWriteSucceeded: boolean): InitDecision {
  return firstWriteSucceeded ? "created" : "ask-overwrite";
}

export function decideInitAfterOverwritePrompt(
  isPromptCancelled: boolean,
  shouldOverwrite: boolean,
): InitDecision {
  if (isPromptCancelled) {
    return "cancelled";
  }
  return shouldOverwrite ? "overwrite" : "keep";
}
