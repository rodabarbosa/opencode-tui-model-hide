// @bun
// index.ts
import { Plugin } from "@opencode/plugin";

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

// index.ts
var STORAGE_KEY = "hidden-models";
var opencode_tui_model_hide_default = Plugin.define({
  id: "hide-model",
  async setup(ctx) {
    let hidden = new Map(parseHidden(await ctx.storage.get(STORAGE_KEY)).map((ref) => [keyOf(ref), ref]));
    let catalog = [];
    const state = () => ({ models: catalog, hidden: [...hidden.values()] });
    await ctx.model.transform((editor) => {
      const rows = [];
      for (const model of editor.list()) {
        const ref = { providerID: model.providerID, modelID: model.id, name: model.name };
        const isHidden = hidden.has(keyOf(ref));
        if (!isHidden && (!model.enabled || (model.type ?? "chat") !== "chat"))
          continue;
        rows.push(ref);
        if (!isHidden)
          continue;
        editor.update(ref.providerID, ref.modelID, (target) => {
          target.enabled = false;
        });
      }
      catalog = rows;
    });
    const registration = await ctx.rpc.register(HideModel, {
      list: async () => state(),
      set: async (input) => {
        hidden = new Map(parseHidden(input).map((ref) => [keyOf(ref), ref]));
        await ctx.storage.set(STORAGE_KEY, { hidden: [...hidden.values()] });
        await ctx.model.reload();
        const next = state();
        await registration.events.emit("changed", next);
        return next;
      }
    });
  }
});
export {
  opencode_tui_model_hide_default as default
};
