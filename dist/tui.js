// @bun
// tui.tsx
import { memo as _$memo } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { For, Show, createSignal, onMount } from "solid-js";
import { Plugin } from "@opencode/plugin/tui";

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

// tui.tsx
var PAGE = 10;
var ROW_PREFIX = "hide-model.row.";
var TEXT_BOLD = 1;
var TEXT_NONE = 0;
var describe = (error) => error instanceof Error ? error.message : String(error);
var sortRows = (rows) => rows.sort((left, right) => left.providerID.localeCompare(right.providerID) || left.name.localeCompare(right.name) || left.modelID.localeCompare(right.modelID));
var merge = (input) => {
  const hiddenKeys = new Set(input.hidden.map(keyOf));
  const rows = input.models.map((model) => ({
    ...model,
    hidden: hiddenKeys.has(keyOf(model))
  }));
  const known = new Set(rows.map(keyOf));
  for (const model of input.hidden) {
    if (!known.has(keyOf(model)))
      rows.push({
        ...model,
        hidden: true
      });
  }
  return sortRows(rows);
};
var tui_default = Plugin.define({
  id: "hide-model-tui",
  setup(context) {
    const [rows, setRows] = createSignal([]);
    const [cursor, setCursor] = createSignal(0);
    const [viewport, setViewport] = createSignal(context.renderer.height);
    const onResize = () => setViewport(context.renderer.height);
    context.renderer.on("resize", onResize);
    const theme = () => {
      try {
        return context.theme.surface?.("dialog") || context.theme;
      } catch {
        return context.theme;
      }
    };
    let isOpen = false;
    let queue = Promise.resolve();
    let list;
    const rowID = (index) => `${ROW_PREFIX}${index}`;
    const reveal = (index) => list?.scrollChildIntoView(rowID(index), {
      align: "nearest",
      inset: 1
    });
    const open = async () => {
      try {
        setRows(merge(parseState(await context.client.rpc(HideModel).list({}))));
      } catch (error) {
        context.ui.toast.show({
          message: `Could not list models: ${describe(error)}`,
          variant: "error"
        });
        return;
      }
      isOpen = true;
      setCursor(0);
      context.renderer.keyInput.prependListener("keypress", onKey);
      context.ui.dialog.show(() => _$createComponent(View, {}), release);
      context.ui.dialog.set({
        size: "xlarge",
        centered: true
      });
    };
    const release = () => {
      if (!isOpen)
        return;
      isOpen = false;
      context.renderer.keyInput.off("keypress", onKey);
    };
    const close = () => {
      context.ui.dialog.clear();
      release();
    };
    const persist = () => {
      queue = queue.then(send).catch(() => {});
    };
    const send = async () => {
      const hidden = rows().filter((row) => row.hidden).map(({
        providerID,
        modelID,
        name
      }) => ({
        providerID,
        modelID,
        name
      }));
      try {
        parseState(await context.client.rpc(HideModel).set({
          hidden
        }));
      } catch (error) {
        context.ui.toast.show({
          message: `Failed to save selection: ${describe(error)}`,
          variant: "error"
        });
      }
    };
    const toggleAt = (index) => {
      const list = rows();
      const row = list[index];
      if (!row)
        return;
      setRows(list.map((item, position) => position === index ? {
        ...item,
        hidden: !item.hidden
      } : item));
      persist();
    };
    const toggleProvider = (providerID) => {
      const list = rows();
      if (!list.some((row) => row.providerID === providerID))
        return;
      const hideAll = list.some((row) => row.providerID === providerID && !row.hidden);
      setRows(list.map((row) => row.providerID === providerID ? {
        ...row,
        hidden: hideAll
      } : row));
      persist();
    };
    const move = (delta) => {
      const total = rows().length;
      if (total === 0)
        return;
      const next = Math.min(total - 1, Math.max(0, cursor() + delta));
      setCursor(next);
      reveal(next);
    };
    const jump = (index) => {
      setCursor(index);
      reveal(index);
    };
    const act = (name) => {
      switch (name) {
        case "up":
        case "k":
          move(-1);
          return true;
        case "down":
        case "j":
          move(1);
          return true;
        case "pageup":
          move(-PAGE);
          return true;
        case "pagedown":
          move(PAGE);
          return true;
        case "home":
          jump(0);
          return true;
        case "end":
          jump(Math.max(0, rows().length - 1));
          return true;
        case "space":
          toggleAt(cursor());
          return true;
        case "return":
        case "escape":
          close();
          return true;
        default:
          return false;
      }
    };
    const onKey = (event) => {
      if (!isOpen || event.eventType === "release")
        return;
      if (!act(event.name))
        return;
      event.preventDefault();
      event.stopPropagation();
    };
    const View = () => {
      const location = context.location ?? context.data.location.default();
      onMount(() => context.ui.dialog.set({
        size: "xlarge",
        centered: true
      }));
      const providerLabel = (providerID) => {
        const provider = context.data.location.provider.list(location)?.find((item) => item.id === providerID);
        return provider?.name ?? providerID;
      };
      const groups = () => {
        const result = [];
        rows().forEach((row, index) => {
          const last = result[result.length - 1];
          const entry = {
            row,
            index
          };
          if (last && last.providerID === row.providerID)
            last.rows.push(entry);
          else
            result.push({
              providerID: row.providerID,
              rows: [entry]
            });
        });
        return result;
      };
      const height = () => {
        const available = Math.max(10, Math.floor(viewport() * 0.78) - 4);
        return Math.max(6, Math.min(rows().length + groups().length, available));
      };
      return (() => {
        var _el$ = _$createElement("box"), _el$2 = _$createElement("text"), _el$4 = _$createElement("text"), _el$6 = _$createElement("text");
        _$insertNode(_el$, _el$2);
        _$insertNode(_el$, _el$4);
        _$insertNode(_el$, _el$6);
        _$setProp(_el$, "flexDirection", "column");
        _$setProp(_el$, "width", "100%");
        _$insertNode(_el$2, _$createTextNode(`Models hidden from /models`));
        _$setProp(_el$2, "attributes", 1);
        _$insert(_el$4, () => `${rows().filter((row) => row.hidden).length} hidden of ${rows().length}`);
        _$insert(_el$, _$createComponent(Show, {
          get when() {
            return rows().length > 0;
          },
          get fallback() {
            return (() => {
              var _el$8 = _$createElement("text");
              _$insertNode(_el$8, _$createTextNode(`No models available in this project.`));
              _$effect((_$p) => _$setProp(_el$8, "fg", theme().text?.muted || "gray", _$p));
              return _el$8;
            })();
          },
          get children() {
            var _el$5 = _$createElement("scrollbox");
            _$use((node) => {
              list = node;
            }, _el$5);
            _$setProp(_el$5, "width", "100%");
            _$setProp(_el$5, "scrollY", true);
            _$insert(_el$5, _$createComponent(For, {
              get each() {
                return groups();
              },
              children: (group, position) => (() => {
                var _el$0 = _$createElement("box"), _el$1 = _$createElement("box"), _el$10 = _$createElement("box"), _el$11 = _$createElement("text"), _el$12 = _$createElement("text"), _el$13 = _$createElement("text");
                _$insertNode(_el$0, _el$1);
                _$setProp(_el$0, "flexDirection", "column");
                _$setProp(_el$0, "width", "100%");
                _$insertNode(_el$1, _el$10);
                _$setProp(_el$1, "width", "100%");
                _$setProp(_el$1, "paddingLeft", 1);
                _$setProp(_el$1, "paddingRight", 1);
                _$setProp(_el$1, "onMouseUp", (event) => {
                  if (event.button !== 0)
                    return;
                  toggleProvider(group.providerID);
                });
                _$insertNode(_el$10, _el$11);
                _$insertNode(_el$10, _el$12);
                _$insertNode(_el$10, _el$13);
                _$setProp(_el$10, "flexDirection", "row");
                _$setProp(_el$10, "gap", 1);
                _$setProp(_el$10, "width", "100%");
                _$setProp(_el$11, "attributes", 1);
                _$setProp(_el$11, "wrapMode", "none");
                _$insert(_el$11, (() => {
                  var _c$ = _$memo(() => !!group.rows.every((entry) => entry.row.hidden));
                  return () => _c$() ? "[x]" : group.rows.some((entry) => entry.row.hidden) ? "[~]" : "[ ]";
                })());
                _$setProp(_el$12, "attributes", 1);
                _$setProp(_el$12, "wrapMode", "none");
                _$insert(_el$12, () => providerLabel(group.providerID));
                _$setProp(_el$13, "wrapMode", "none");
                _$insert(_el$13, () => `\xB7 ${group.rows.length} model(s) \xB7 ${group.rows.filter((entry) => entry.row.hidden).length} hidden \xB7 click to toggle all`);
                _$insert(_el$0, _$createComponent(For, {
                  get each() {
                    return group.rows;
                  },
                  children: (entry) => {
                    const isCursor = () => entry.index === cursor();
                    return (() => {
                      var _el$14 = _$createElement("box"), _el$15 = _$createElement("box"), _el$16 = _$createElement("text"), _el$17 = _$createElement("text"), _el$18 = _$createElement("text"), _el$19 = _$createElement("text");
                      _$insertNode(_el$14, _el$15);
                      _$setProp(_el$14, "width", "100%");
                      _$setProp(_el$14, "paddingLeft", 1);
                      _$setProp(_el$14, "paddingRight", 1);
                      _$setProp(_el$14, "onMouseUp", (event) => {
                        if (event.button !== 0)
                          return;
                        jump(entry.index);
                        toggleAt(entry.index);
                      });
                      _$insertNode(_el$15, _el$16);
                      _$insertNode(_el$15, _el$17);
                      _$insertNode(_el$15, _el$18);
                      _$insertNode(_el$15, _el$19);
                      _$setProp(_el$15, "flexDirection", "row");
                      _$setProp(_el$15, "gap", 1);
                      _$setProp(_el$16, "wrapMode", "none");
                      _$insert(_el$16, () => isCursor() ? "\u25B6" : " ");
                      _$setProp(_el$17, "wrapMode", "none");
                      _$insert(_el$17, () => entry.row.hidden ? "[x]" : "[ ]");
                      _$setProp(_el$18, "wrapMode", "none");
                      _$insert(_el$18, () => entry.row.name);
                      _$setProp(_el$19, "wrapMode", "none");
                      _$insert(_el$19, () => `(${entry.row.modelID})`);
                      _$effect((_p$) => {
                        var _v$8 = rowID(entry.index), _v$9 = isCursor() ? TEXT_BOLD : TEXT_NONE, _v$0 = isCursor() ? theme().text?.selected || "cyan" : theme().text?.base || "white", _v$1 = entry.row.hidden ? "yellow" : theme().text?.muted || "gray", _v$10 = isCursor() ? TEXT_BOLD : TEXT_NONE, _v$11 = isCursor() ? theme().text?.selected || "cyan" : theme().text?.base || "white", _v$12 = theme().text?.muted || "gray";
                        _v$8 !== _p$.e && (_p$.e = _$setProp(_el$14, "id", _v$8, _p$.e));
                        _v$9 !== _p$.t && (_p$.t = _$setProp(_el$16, "attributes", _v$9, _p$.t));
                        _v$0 !== _p$.a && (_p$.a = _$setProp(_el$16, "fg", _v$0, _p$.a));
                        _v$1 !== _p$.o && (_p$.o = _$setProp(_el$17, "fg", _v$1, _p$.o));
                        _v$10 !== _p$.i && (_p$.i = _$setProp(_el$18, "attributes", _v$10, _p$.i));
                        _v$11 !== _p$.n && (_p$.n = _$setProp(_el$18, "fg", _v$11, _p$.n));
                        _v$12 !== _p$.s && (_p$.s = _$setProp(_el$19, "fg", _v$12, _p$.s));
                        return _p$;
                      }, {
                        e: undefined,
                        t: undefined,
                        a: undefined,
                        o: undefined,
                        i: undefined,
                        n: undefined,
                        s: undefined
                      });
                      return _el$14;
                    })();
                  }
                }), null);
                _$effect((_p$) => {
                  var _v$4 = position() === 0 ? 0 : 1, _v$5 = theme().text?.selected || "cyan", _v$6 = theme().text?.selected || "cyan", _v$7 = theme().text?.muted || "gray";
                  _v$4 !== _p$.e && (_p$.e = _$setProp(_el$0, "marginTop", _v$4, _p$.e));
                  _v$5 !== _p$.t && (_p$.t = _$setProp(_el$11, "fg", _v$5, _p$.t));
                  _v$6 !== _p$.a && (_p$.a = _$setProp(_el$12, "fg", _v$6, _p$.a));
                  _v$7 !== _p$.o && (_p$.o = _$setProp(_el$13, "fg", _v$7, _p$.o));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined,
                  a: undefined,
                  o: undefined
                });
                return _el$0;
              })()
            }));
            _$effect((_$p) => _$setProp(_el$5, "height", height(), _$p));
            return _el$5;
          }
        }), _el$6);
        _$insertNode(_el$6, _$createTextNode(`space toggles row \xB7 click provider header toggles all its models \xB7 \u2191/\u2193 moves \xB7 enter/esc closes \xB7 wheel scrolls`));
        _$setProp(_el$6, "wrapMode", "none");
        _$effect((_p$) => {
          var _v$ = theme().text?.base || "white", _v$2 = theme().text?.muted || "gray", _v$3 = theme().text?.muted || "gray";
          _v$ !== _p$.e && (_p$.e = _$setProp(_el$2, "fg", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp(_el$4, "fg", _v$2, _p$.t));
          _v$3 !== _p$.a && (_p$.a = _$setProp(_el$6, "fg", _v$3, _p$.a));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined
        });
        return _el$;
      })();
    };
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "hide-model.open",
        title: "Hide models from /models",
        group: "Models",
        palette: true,
        slash: {
          name: "hide-model"
        },
        run: () => isOpen ? close() : open()
      }]
    }));
    return () => {
      context.renderer.off("resize", onResize);
    };
  }
});
export {
  tui_default as default
};
