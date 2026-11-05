// @bun
// rpc.ts
var refSchema = {
  type: "object",
  properties: {
    providerID: { type: "string" },
    modelID: { type: "string" },
    name: { type: "string" }
  },
  required: ["providerID", "modelID", "name"],
  additionalProperties: false
};
var stateSchema = {
  type: "object",
  properties: {
    models: { type: "array", items: refSchema },
    hidden: { type: "array", items: refSchema }
  },
  required: ["models", "hidden"],
  additionalProperties: false
};
var emptySchema = {
  type: "object",
  properties: {},
  additionalProperties: false
};
var setSchema = {
  type: "object",
  properties: {
    hidden: { type: "array", items: refSchema }
  },
  required: ["hidden"],
  additionalProperties: false
};
var HideModel = {
  id: "hide-model",
  methods: {
    list: { input: emptySchema, output: stateSchema },
    set: { input: setSchema, output: stateSchema }
  },
  events: {
    changed: { schema: stateSchema }
  }
};
var keyOf = (ref) => `${ref.providerID}/${ref.modelID}`;
var parseRef = (value) => {
  if (typeof value !== "object" || value === null)
    return;
  const candidate = value;
  if (typeof candidate.providerID !== "string" || typeof candidate.modelID !== "string")
    return;
  return {
    providerID: candidate.providerID,
    modelID: candidate.modelID,
    name: typeof candidate.name === "string" ? candidate.name : candidate.modelID
  };
};
var parseRefList = (value) => {
  if (!Array.isArray(value))
    return [];
  const refs = [];
  for (const entry of value) {
    const ref = parseRef(entry);
    if (ref)
      refs.push(ref);
  }
  return refs;
};
var parseHidden = (value) => {
  if (typeof value !== "object" || value === null)
    return [];
  return parseRefList(value.hidden);
};
var parseState = (value) => {
  const source = typeof value === "object" && value !== null ? value : {};
  return { models: parseRefList(source.models), hidden: parseRefList(source.hidden) };
};
export {
  HideModel,
  keyOf,
  parseHidden,
  parseRef,
  parseState
};
