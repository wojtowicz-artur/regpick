# Przykłady użycia `regpick`

Ten folder zawiera przykłady różnych rodzajów rejestrów i komponentów, które można dystrybuować za pomocą `regpick`. Pokazują one elastyczność narzędzia - od prostych funkcji pomocniczych po złożone komponenty UI z własnymi zależnościami NPM.

## Jak przetestować przykłady?

Możesz uruchomić komendę `list` lub `add` bezpośrednio na plikach JSON z tego folderu:

```bash
# Wylistowanie zawartości prostego rejestru:
npx regpick list ./examples/simple-utils-registry/registry.json

# Interaktywne dodanie komponentu ze złożonego rejestru:
npx regpick add ./examples/complex-ui-registry/registry.json
```

## Dostępne przykłady:

### 1. `simple-utils-registry`
Pokazuje najprostsze zastosowanie: dystrybucję czystej logiki biznesowej (funkcje pomocnicze, hooki) bez dodatkowych zależności NPM. Idealne do uwspólniania kodu między projektami backendowymi i frontendowymi.

### 2. `complex-ui-registry`
Pokazuje zaawansowane możliwości:
- Komponenty składające się z wielu plików (np. główny plik TSX + plik ze stylami CSS/Tailwind).
- Automatyczne instalowanie zależności NPM (np. `lucide-react`, `clsx`, `tailwind-merge`).
- Różne typy elementów w jednym rejestrze (`registry:component`, `registry:hook`, `registry:ui`).
