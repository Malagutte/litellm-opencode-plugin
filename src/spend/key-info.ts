/**
 * Talking to the LiteLLM proxy: which URL and key to use, how to ask for the
 * key's spend, and how a failure should be reported.
 */

import { readString } from "./json.js"
import type { SpendOptions } from "./options.js"

export type SpendErrorKind =
  /** Options or provider settings do not describe a proxy we can query. */
  | "config"
  /** The host answered, but has no `/key/info`: it is not a LiteLLM proxy. */
  | "unsupported"
  /** The proxy knows the endpoint and refused the key. */
  | "auth"
  /** Any other non-2xx answer. */
  | "http"
  /** No answer at all: DNS, TLS, timeout, proxy down. */
  | "network"

export class SpendError extends Error {
  readonly kind: SpendErrorKind

  constructor(kind: SpendErrorKind, message: string) {
    super(message)
    this.name = "SpendError"
    this.kind = kind
  }
}

/** The parts of an OpenCode provider that identify its API endpoint. */
export interface ProviderRef {
  readonly id: string
  readonly name?: string
  readonly settings?: Record<string, unknown>
}

export interface SpendTarget {
  /** Proxy root, without the OpenAI-compatible `/v1` suffix. */
  readonly baseUrl: string
  readonly apiKey: string
}

export function resolveTarget(provider: ProviderRef, options: SpendOptions): SpendTarget {
  const settings = provider.settings ?? {}
  const baseUrl = options.baseUrl ?? readString(settings.baseURL)
  const apiKey = options.apiKey ?? readString(settings.apiKey)
  const label = provider.name ?? provider.id

  if (!baseUrl) {
    throw new SpendError("config", `Provider "${label}" has no baseURL, so there is no proxy to ask.`)
  }
  if (!apiKey) {
    throw new SpendError(
      "config",
      `Provider "${label}" has no apiKey, so the spend cannot be read. Set "apiKey" in the plugin options.`,
    )
  }

  return { baseUrl: proxyRoot(baseUrl), apiKey }
}

/** `https://host/v1`, `https://host/v1/` and `https://host/` all become `https://host`. */
export function proxyRoot(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/v1$/i, "")
    .replace(/\/+$/, "")
}

export interface FetchKeyInfoOptions {
  readonly signal?: AbortSignal
  /** Injectable for tests; defaults to the global fetch. */
  readonly fetch?: (input: string, init?: RequestInit) => Promise<Response>
}

/**
 * Ask the proxy what this virtual key has spent.
 *
 * A virtual key may read its own `/key/info` with a plain bearer token, so the
 * plugin never needs a master key.
 */
export async function fetchKeyInfo(target: SpendTarget, options: FetchKeyInfoOptions = {}): Promise<unknown> {
  const url = `${target.baseUrl}/key/info`
  const doFetch = options.fetch ?? fetch

  const response = await request(doFetch, url, target.apiKey, options.signal)
  return await response.json()
}

async function request(
  doFetch: (input: string, init?: RequestInit) => Promise<Response>,
  url: string,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<Response> {
  let response: Response
  try {
    response = await doFetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal,
    })
  } catch (error) {
    if (isAbort(error)) throw error
    throw new SpendError("network", `Cannot reach ${url}: ${messageOf(error)}`)
  }

  if (response.status === 404 || response.status === 405) {
    throw new SpendError("unsupported", `${url} does not exist, so this provider is not a LiteLLM proxy.`)
  }
  if (response.status === 401 || response.status === 403) {
    throw new SpendError("auth", `The proxy rejected the API key (HTTP ${response.status}) at ${url}`)
  }
  if (!response.ok) {
    throw new SpendError("http", `The proxy answered HTTP ${response.status} for ${url}`)
  }
  return response
}

/**
 * True when the failure means "this provider has no usage to show", as opposed
 * to "the lookup broke" — the footer stays quiet for the former.
 */
export function hasNothingToShow(error: unknown): boolean {
  return error instanceof SpendError && (error.kind === "config" || error.kind === "unsupported")
}

export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
