import type { Context } from "@opencode/plugin/tui/context"

export interface FakeProvider {
  readonly name?: string
  readonly settings?: Record<string, unknown>
}

export interface FakeContextOptions {
  /** Provider of the model selected in the prompt. Omit for "nothing selected". */
  readonly modelProviderID?: string
  /** Providers `client.provider.get` can answer for; anything else rejects like the API would. */
  readonly providers?: Record<string, FakeProvider>
}

export interface FakeContext {
  readonly context: Context
  /** Provider IDs requested through `client.provider.get`, in call order. */
  readonly lookedUp: string[]
}

/**
 * The smallest context the spend tracker uses: durable-free storage, the model
 * selection, and the provider lookup. Everything else is left out on purpose so
 * a test only fails for reasons the tracker is responsible for.
 */
export function createFakeContext(options: FakeContextOptions = {}): FakeContext {
  const lookedUp: string[] = []

  const context = {
    storage: {
      memory<Value extends object>(_key: string, setup: { readonly initial: Value }) {
        const value = { ...setup.initial }
        return [value, (mutation: (draft: Value) => void) => mutation(value)] as const
      },
    },
    ui: {
      model: {
        current: () =>
          options.modelProviderID
            ? { providerID: options.modelProviderID, modelID: "test-model", variant: undefined }
            : undefined,
      },
    },
    client: {
      provider: {
        get: async (input: { providerID: string }) => {
          lookedUp.push(input.providerID)
          const provider = options.providers?.[input.providerID]
          if (!provider) throw new Error(`Provider ${input.providerID} not found`)
          return {
            data: {
              id: input.providerID,
              name: provider.name ?? input.providerID,
              activation: "enabled",
              package: "@ai-sdk/openai-compatible",
              settings: provider.settings,
            },
          }
        },
      },
    },
  }

  return { context: context as unknown as Context, lookedUp }
}

/** A LiteLLM provider entry as OpenCode exposes it to plugins. */
export function litellmProvider(
  baseURL = "https://litellm.example.com/v1",
  apiKey = "sk-test",
  name = "litellm",
): FakeProvider {
  return { name, settings: { baseURL, apiKey } }
}

export function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

export function abortError(): Error {
  const error = new Error("The operation was aborted")
  error.name = "AbortError"
  return error
}
