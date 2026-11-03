import { For, Show, createSignal, onMount } from "solid-js"
import type { KeyEvent, ScrollBoxRenderable } from "@opentui/core"
import { Plugin } from "@opencode/plugin/tui"
import { HideModel, keyOf, parseState, type ModelRef } from "./rpc"

/**
 * TUI part: the `/hide-model` command and the window with the model list.
 * Space (or a click) toggles the highlighted model; Enter/Esc close the window.
 * Docs: https://opencode.ai/v2/docs/build/plugins/cli/#commands-and-keymaps
 */

type Row = ModelRef & { hidden: boolean }

const PAGE = 10
const ROW_PREFIX = "hide-model.row."

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const sortRows = (rows: Row[]): Row[] =>
  rows.sort(
    (left, right) =>
      left.providerID.localeCompare(right.providerID) ||
      left.name.localeCompare(right.name) ||
      left.modelID.localeCompare(right.modelID),
  )

/** Joins the current catalog with hidden models that already left it (uninstalled provider, etc.). */
const merge = (input: { models: readonly ModelRef[]; hidden: readonly ModelRef[] }): Row[] => {
  const hiddenKeys = new Set(input.hidden.map(keyOf))
  const rows: Row[] = input.models.map((model) => ({ ...model, hidden: hiddenKeys.has(keyOf(model)) }))
  const known = new Set(rows.map(keyOf))
  for (const model of input.hidden) {
    if (!known.has(keyOf(model))) rows.push({ ...model, hidden: true })
  }
  return sortRows(rows)
}

export default Plugin.define({
  id: "hide-model-tui",
  setup(context) {
    const [rows, setRows] = createSignal<Row[]>([])
    const [cursor, setCursor] = createSignal(0)
    // Terminal height: the window uses most of it instead of a fixed cap.
    const [viewport, setViewport] = createSignal(context.renderer.height)
    const onResize = () => setViewport(context.renderer.height)
    context.renderer.on("resize", onResize)

    let isOpen = false
    let queue: Promise<void> = Promise.resolve()
    let list: ScrollBoxRenderable | undefined

    const rowID = (index: number): string => `${ROW_PREFIX}${index}`

    const reveal = (index: number) => list?.scrollChildIntoView(rowID(index), { align: "nearest", inset: 1 })

    const open = async () => {
      try {
        setRows(merge(parseState(await context.client.rpc(HideModel).list({}))))
      } catch (error) {
        context.ui.toast.show({
          message: `Could not list models: ${describe(error)}`,
          variant: "error",
        })
        return
      }

      isOpen = true
      setCursor(0)
      // `prependListener` keeps priority over the OpenCode keymap: without it the keys
      // would reach the prompt (our renderable is not the dialog's focus).
      context.renderer.keyInput.prependListener("keypress", onKey)
      context.ui.dialog.show(() => <View />, release)
      // `set` applies to the *active* dialog: calling it before `show` was ignored and the
      // window fell back to the default size (60 columns). `xlarge` is the widest preset (116).
      context.ui.dialog.set({ size: "xlarge", centered: true })
    }

    const release = () => {
      if (!isOpen) return
      isOpen = false
      context.renderer.keyInput.off("keypress", onKey)
    }

    const close = () => {
      context.ui.dialog.clear()
      release()
    }

    const persist = () => {
      // Persist serially; the payload is built at run time, so the last write wins.
      queue = queue.then(send).catch(() => {})
    }

    const send = async () => {
      const hidden = rows()
        .filter((row) => row.hidden)
        .map(({ providerID, modelID, name }) => ({ providerID, modelID, name }))
      try {
        parseState(await context.client.rpc(HideModel).set({ hidden }))
      } catch (error) {
        context.ui.toast.show({ message: `Failed to save selection: ${describe(error)}`, variant: "error" })
      }
    }

    const toggleAt = (index: number) => {
      const list = rows()
      const row = list[index]
      if (!row) return
      setRows(list.map((item, position) => (position === index ? { ...item, hidden: !item.hidden } : item)))
      persist()
    }

    const move = (delta: number) => {
      const total = rows().length
      if (total === 0) return
      const next = Math.min(total - 1, Math.max(0, cursor() + delta))
      setCursor(next)
      reveal(next)
    }

    const jump = (index: number) => {
      setCursor(index)
      reveal(index)
    }

    /** Runs one key; returns `true` when the window consumed it. */
    const act = (name: string): boolean => {
      switch (name) {
        case "up":
        case "k":
          move(-1)
          return true
        case "down":
        case "j":
          move(1)
          return true
        case "pageup":
          move(-PAGE)
          return true
        case "pagedown":
          move(PAGE)
          return true
        case "home":
          jump(0)
          return true
        case "end":
          jump(Math.max(0, rows().length - 1))
          return true
        case "space":
          toggleAt(cursor())
          return true
        case "return":
        case "escape":
          close()
          return true
        default:
          return false
      }
    }

    const onKey = (event: KeyEvent) => {
      if (!isOpen || event.eventType === "release") return
      if (!act(event.name)) return
      event.preventDefault()
      event.stopPropagation()
    }

    const View = () => {
      const theme = context.theme
      const location = context.location ?? context.data.location.default()

      // Reapplies the widest preset once our content is mounted, so the window never
      // stays at the default 60-column size when another dialog set it earlier.
      onMount(() => context.ui.dialog.set({ size: "xlarge", centered: true }))

      /** Readable provider name (the TUI list already carries `name`); falls back to the ID. */
      const providerLabel = (providerID: string): string => {
        const provider = context.data.location.provider
          .list(location)
          ?.find((item) => item.id === providerID)
        return provider?.name ?? providerID
      }

      // `merge` already sorts by provider then name; here we only group the rows so a
      // provider header can be drawn without touching the index used by the cursor.
      const groups = () => {
        const result: Array<{ providerID: string; rows: Array<{ row: Row; index: number }> }> = []
        rows().forEach((row, index) => {
          const last = result[result.length - 1]
          const entry = { row, index }
          if (last && last.providerID === row.providerID) last.rows.push(entry)
          else result.push({ providerID: row.providerID, rows: [entry] })
        })
        return result
      }

      const height = () => {
        // Title, counter and footer take 3 lines; the rest of the window holds the list,
        // bounded by the usable terminal area so the dialog never overflows.
        const available = Math.max(10, Math.floor(viewport() * 0.78) - 4)
        return Math.max(6, Math.min(rows().length + groups().length, available))
      }

      return (
        <box flexDirection="column" width="100%">
          <text fg={theme.text.base}>Models hidden from /models</text>
          <text fg={theme.text.muted}>
            {`${rows().filter((row) => row.hidden).length} hidden of ${rows().length}`}
          </text>
          <Show
            when={rows().length > 0}
            fallback={<text fg={theme.text.faint}>No models available in this project.</text>}
          >
            <scrollbox
              ref={(node: ScrollBoxRenderable) => {
                list = node
              }}
              height={height()}
              width="100%"
              scrollY
            >
              <For each={groups()}>
                {(group, position) => (
                  <box flexDirection="column" width="100%" marginTop={position() === 0 ? 0 : 1}>
                    <box
                      width="100%"
                      backgroundColor={theme.background.raised.base}
                      paddingLeft={1}
                      paddingRight={1}
                    >
                      <text fg={theme.text.base}>
                        {`${providerLabel(group.providerID)} · ${group.rows.length} model(s) · ${group.rows.filter((entry) => entry.row.hidden).length} hidden`}
                      </text>
                    </box>
                    <For each={group.rows}>
                      {(entry) => (
                        <box
                          id={rowID(entry.index)}
                          width="100%"
                          paddingLeft={1}
                          backgroundColor={
                            entry.index === cursor() ? theme.background.raised.high : undefined
                          }
                          onMouseUp={(event) => {
                            if (event.button !== 0) return
                            jump(entry.index)
                            toggleAt(entry.index)
                          }}
                        >
                          <text fg={entry.index === cursor() ? theme.text.base : theme.text.muted}>
                            {`${entry.index === cursor() ? ">" : " "} ${entry.row.hidden ? "[x]" : "[ ]"} ${entry.row.name} (${entry.row.modelID})`}
                          </text>
                        </box>
                      )}
                    </For>
                  </box>
                )}
              </For>
            </scrollbox>
          </Show>
          <text fg={theme.text.faint}>space toggles · ↑/↓ moves · enter/esc closes · wheel scrolls</text>
        </box>
      )
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "hide-model.open",
          title: "Hide models from /models",
          group: "Models",
          palette: true,
          slash: { name: "hide-model" },
          run: () => (isOpen ? close() : open()),
        },
      ],
    }))

    return () => {
      context.renderer.off("resize", onResize)
    }
  },
})
