const directCapabilities = (baseURL: boolean) => ({
  agentAttribution: false,
  apiKey: true,
  appAttribution: false,
  baseURL,
  headers: false,
  modelId: true,
});

interface ProviderDefinitionShape {
  readonly benchmarkVisible: boolean;
  readonly capabilities: ReturnType<typeof directCapabilities>;
  readonly environmentVariable: string;
  readonly id: string;
  readonly kind: "local" | "remote";
  readonly label: string;
  readonly service: string | undefined;
}

/** Ordered, credential-free metadata for every supported language-model route. */
export const PROVIDER_DEFINITIONS = [
  {
    benchmarkVisible: true,
    capabilities: directCapabilities(false),
    environmentVariable: "AI_GATEWAY_API_KEY",
    id: "gateway",
    kind: "remote",
    label: "Vercel AI Gateway",
    service: undefined,
  },
  {
    benchmarkVisible: true,
    capabilities: {
      agentAttribution: true,
      apiKey: true,
      appAttribution: true,
      baseURL: true,
      headers: true,
      modelId: true,
    },
    environmentVariable: "OPENROUTER_API_KEY",
    id: "openrouter",
    kind: "remote",
    label: "OpenRouter",
    service: undefined,
  },
  {
    benchmarkVisible: true,
    capabilities: directCapabilities(false),
    environmentVariable: "ANTHROPIC_API_KEY",
    id: "anthropic",
    kind: "remote",
    label: "Anthropic",
    service: "anthropic",
  },
  {
    benchmarkVisible: true,
    capabilities: directCapabilities(false),
    environmentVariable: "OPENAI_API_KEY",
    id: "openai",
    kind: "remote",
    label: "OpenAI",
    service: "openai",
  },
  {
    benchmarkVisible: true,
    capabilities: directCapabilities(false),
    environmentVariable: "GOOGLE_GEMINI_API_KEY",
    id: "google",
    kind: "remote",
    label: "Google",
    service: "google",
  },
  {
    benchmarkVisible: true,
    capabilities: directCapabilities(true),
    environmentVariable: "DEEPSEEK_API_KEY",
    id: "deepseek",
    kind: "remote",
    label: "DeepSeek",
    service: "deepseek",
  },
  {
    benchmarkVisible: true,
    capabilities: directCapabilities(true),
    environmentVariable: "XAI_API_KEY",
    id: "xai",
    kind: "remote",
    label: "xAI",
    service: "xai",
  },
  {
    benchmarkVisible: true,
    capabilities: directCapabilities(true),
    environmentVariable: "QWEN_API_KEY",
    id: "qwen",
    kind: "remote",
    label: "Qwen",
    service: "qwen",
  },
  {
    benchmarkVisible: true,
    capabilities: directCapabilities(true),
    environmentVariable: "ZAI_API_KEY",
    id: "zai",
    kind: "remote",
    label: "Z.ai",
    service: "zai",
  },
  {
    benchmarkVisible: true,
    capabilities: directCapabilities(true),
    environmentVariable: "MOONSHOT_API_KEY",
    id: "moonshotai",
    kind: "remote",
    label: "Moonshot AI",
    service: "moonshotai",
  },
  {
    benchmarkVisible: true,
    capabilities: directCapabilities(true),
    environmentVariable: "GROQ_API_KEY",
    id: "groq",
    kind: "remote",
    label: "Groq",
    service: "groq",
  },
  {
    benchmarkVisible: true,
    capabilities: {
      agentAttribution: false,
      apiKey: false,
      appAttribution: false,
      baseURL: true,
      headers: false,
      modelId: true,
    },
    environmentVariable: "OLLAMA_BASE_URL",
    id: "ollama",
    kind: "local",
    label: "Ollama",
    service: "ollama",
  },
] as const satisfies readonly ProviderDefinitionShape[];

export type ProviderDefinition = (typeof PROVIDER_DEFINITIONS)[number];
export type ProviderRouteId = ProviderDefinition["id"];

/** Provider route IDs in stable display and CLI order. */
export const PROVIDER_ROUTES = PROVIDER_DEFINITIONS.map(
  ({ id }) => id,
) as readonly ProviderRouteId[];

const PROVIDER_ROUTE_SET = new Set<string>(PROVIDER_ROUTES);

/** Narrow untrusted input to a supported provider route. */
export function isProviderRoute(value: unknown): value is ProviderRouteId {
  return typeof value === "string" && PROVIDER_ROUTE_SET.has(value);
}

export const PROVIDER_DEFINITION_BY_ID = Object.fromEntries(
  PROVIDER_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<ProviderRouteId, ProviderDefinition>;
