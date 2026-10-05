/* Loads the browser scripts into Node's global scope for testing. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");
const ENGINE = ["vfs", "sysdata", "seta", "shell", "cmd-core", "cmd-files", "cmd-text", "cmd-system", "cmd-network", "cmd-disk", "cmd-batch", "checker"]
  .map((f) => `src/engine/${f}.js`);
function load(files) {
  const code = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n") +
    "\n;globalThis.__x = { VFS, SysData, SetA, Shell, Checker, " + (files.some((f) => f.includes("content.js")) ? "Content, " : "") + (files.some((f) => f.includes("progress.js")) ? "Store, " : "") + "};";
  vm.runInThisContext(code, { filename: "bundle.js" });
  return globalThis.__x;
}
function content() {
  const p = path.join(ROOT, "dist/content.fa.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
module.exports = { load, ENGINE, content, ROOT };
