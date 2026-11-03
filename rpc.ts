import { Rpc } from "@opencode/plugin/rpc"

/**
 * RPC contract between the TUI part and the server part of the plugin.
 * Docs: https://opencode.ai/v2/docs/build/plugins/rpc/
 */

/** Model identified the way the server model editor expects it (providerID + catalog id). */
export type ModelRef = {
  readonly providerID: string
  readonly modelID: string
  readonly name: string
}

/** State returned by the server: full catalog + currently hidden models. */
export type HideModelState = {
  readonly models: readonly ModelRef[]
  readonly hidden: readonly ModelRef[]
}

const refSchema = {
  type: "object",
  properties: {
    providerID: { type: "string" },
    modelID: { type: "string" },
    name: { type: "string" },
  },
  required: ["providerID", "modelID", "name"],
  additionalProperties: false,
} as const

const stateSchema = {
  type: "object",
  properties: {
    models: { type: "array", items: refSchema },
    hidden: { type: "array", items: refSchema },
  },
  required: ["models", "hidden"],
  additionalProperties: false,
} as const

const emptySchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const

const setSchema = {
  type: "object",
  properties: {
    hidden: { type: "array", items: refSchema },
  },
  required: ["hidden"],
  additionalProperties: false,
} as const

export const HideModel = {
  id: "hide-model",
  methods: {
    list: { input: emptySchema, output: stateSchema },
    set: { input: setSchema, output: stateSchema },
  },
  events: {
    changed: { schema: stateSchema },
  },
} as const satisfies Rpc.PortableDefinition

export const keyOf = (ref: { providerID: string; modelID: string }): string =>
  `${ref.providerID}/${ref.modelID}`

export const parseRef = (value: unknown): ModelRef | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const candidate = value as Partial<ModelRef>
  if (typeof candidate.providerID !== "string" || typeof candidate.modelID !== "string") return undefined
  return {
    providerID: candidate.providerID,
    modelID: candidate.modelID,
    name: typeof candidate.name === "string" ? candidate.name : candidate.modelID,
  }
}

const parseRefList = (value: unknown): ModelRef[] => {
  if (!Array.isArray(value)) return []
  const refs: ModelRef[] = []
  for (const entry of value) {
    const ref = parseRef(entry)
    if (ref) refs.push(ref)
  }
  return refs
}

/** Normalizes the persisted value (`{ hidden: [...] }`) into a list of refs. */
export const parseHidden = (value: unknown): ModelRef[] => {
  if (typeof value !== "object" || value === null) return []
  return parseRefList((value as { hidden?: unknown }).hidden)
}

/** Normalizes the server response, which arrives as `unknown` because the contract uses JSON Schema. */
export const parseState = (value: unknown): HideModelState => {
  const source = (typeof value === "object" && value !== null ? value : {}) as {
    models?: unknown
    hidden?: unknown
  }
  return { models: parseRefList(source.models), hidden: parseRefList(source.hidden) }
}
