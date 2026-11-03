import { Plugin } from "@opencode/plugin"
import { HideModel, keyOf, parseHidden, type ModelRef, type HideModelState } from "./rpc"

/**
 * Server part: keeps the set of hidden models and applies the filter to the catalog
 * that feeds the `/models` selector.
 * Docs: https://opencode.ai/v2/docs/build/plugins/server/#models
 */

const STORAGE_KEY = "hidden-models"

export default Plugin.define({
  id: "hide-model",
  async setup(ctx) {
    let hidden = new Map(parseHidden(await ctx.storage.get(STORAGE_KEY)).map((ref) => [keyOf(ref), ref]))
    let catalog: readonly ModelRef[] = []

    const state = (): HideModelState => ({ models: catalog, hidden: [...hidden.values()] })

    await ctx.model.transform((editor) => {
      const rows: ModelRef[] = []

      for (const model of editor.list()) {
        const ref = { providerID: model.providerID, modelID: model.id, name: model.name }
        const isHidden = hidden.has(keyOf(ref))

        // `editor.list()` includes candidates that never reach `/models`: models disabled
        // by config and non-chat models (image/decision). The window catalog lists what
        // would be visible if this plugin hid nothing, plus whatever is hidden.
        if (!isHidden && (!model.enabled || (model.type ?? "chat") !== "chat")) continue

        rows.push(ref)
        if (!isHidden) continue

        editor.update(ref.providerID, ref.modelID, (target) => {
          // Disabling removes the model from the selector without deleting it from the
          // catalog (an explicit `--model` selection still resolves).
          target.enabled = false
        })
      }

      catalog = rows
    })

    const registration = await ctx.rpc.register(HideModel, {
      list: async () => state(),
      set: async (input) => {
        hidden = new Map(parseHidden(input).map((ref) => [keyOf(ref), ref]))
        await ctx.storage.set(STORAGE_KEY, { hidden: [...hidden.values()] })
        await ctx.model.reload()
        const next = state()
        await registration.events.emit("changed", next)
        return next
      },
    })
  },
})
