// Builds the browser code that connects the page to the real services.
// Reads the PUPS_* environment variables, so flags are set on the host, not in code.
import { build } from "esbuild";
import { rmSync } from "node:fs";

rmSync("public/live", { recursive: true, force: true });

// Each switch is read as PUPS_<NAME>; the older PUPS_<NAME> spelling is accepted too.
const env = (name) => process.env["PUPS_" + name] ?? process.env["PUPS_" + name];
const on = (name) => ["1", "true", "on", "yes"].includes(String(env(name) ?? "").toLowerCase());
const flags = {
  scour: on("SCOUR"),
  launch: on("LAUNCH"),
  ask: on("ASK"),
  board: on("BOARD"),
  watch: on("WATCH"),
  litter: on("LITTER"),
  vesting: on("VESTING"),
};
const pct = Number(env("LITTER_PCT") ?? 0);

await build({
  entryPoints: ["src/live.ts"],
  bundle: true,
  format: "esm",
  splitting: true,
  outdir: "public/live",
  platform: "browser",
  target: "es2020",
  minify: true,
  inject: ["src/shim.ts"],
  define: {
    global: "globalThis",
    "process.env.NODE_ENV": '"production"',
    __PAWS_FLAGS__: JSON.stringify(flags),
    __PUBLIC_RPC_URL__: JSON.stringify(env("PUBLIC_RPC_URL") ?? ""),
    __SITE_URL__: JSON.stringify(process.env.SITE_URL ?? ""),
    __LITTER_SHARE_PCT__: String(Number.isFinite(pct) && pct > 0 ? pct : 0),
  },
  logLevel: "info",
});

console.log("PUPS live features:", Object.entries(flags).filter(([, v]) => v).map(([k]) => k).join(", ") || "none (demo mode)");
