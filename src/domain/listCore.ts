type Registries = Record<string, string>;

export function resolveRegistrySourceFromAliases(
  input: string | undefined,
  registries: Registries,
): string | null {
  if (!input) {
    return null;
  }

  return registries[input] ? String(registries[input]) : input;
}

export function resolveListSourceDecision(
  providedInput: string | undefined,
  registries: Registries,
): { source: string | null; requiresPrompt: boolean } {
  const fromInput = resolveRegistrySourceFromAliases(providedInput, registries);
  if (fromInput) {
    return { source: fromInput, requiresPrompt: false };
  }

  const defaultAlias = Object.keys(registries)[0];
  if (defaultAlias) {
    return {
      source: resolveRegistrySourceFromAliases(defaultAlias, registries),
      requiresPrompt: false,
    };
  }

  return { source: null, requiresPrompt: true };
}
