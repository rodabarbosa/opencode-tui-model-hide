import solid from "@opentui/solid/bun-plugin"

/**
 * Builds the published entrypoints as plain JS.
 *
 * When OpenCode loads a `.tsx` straight from ~/.cache/opencode/npm, it resolves
 * `@opentui/solid` and `solid-js` from the plugin's own node_modules, creating a
 * second Solid instance and a render loop — the dialog opens but stops responding.
 * Built JS imports those as bare specifiers, so the host maps its own instances.
 */
const result = await Bun.build({
  entrypoints: ["./index.ts", "./tui.tsx", "./rpc.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  external: [
    "@opencode/plugin",
    "@opencode/plugin/tui",
    "@opencode/plugin/rpc",
    "@opentui/solid",
    "@opentui/core",
    "solid-js",
  ],
  plugins: [solid],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

for (const output of result.outputs) console.log(output.path)
