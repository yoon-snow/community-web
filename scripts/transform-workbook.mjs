/** Read-only source conversion. Output stays in ignored .local-data by default. */
import readExcel from "read-excel-file/node";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const cache = new Map();
function load(name) {
  const file = resolve(name);
  if (cache.has(file)) return cache.get(file);
  const source = require("node:fs").readFileSync(file, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", "module", js)(
    module.exports,
    (n) =>
      n.startsWith(".") ? load(resolve(dirname(file), n + ".ts")) : require(n),
    module,
  );
  cache.set(file, module.exports);
  return module.exports;
}
const { convertLegacy } = load("src/lib/legacy-import.ts");
const { csvSerialize } = load("src/lib/domain.ts");
const [input, sheet, target, mappingFile, outputArg] = process.argv.slice(2);
if (!input || !sheet || !target) {
  console.log(
    'Usage: node scripts/transform-workbook.mjs source.xlsx "회원명단" members reviewed-map.json [output.csv]\nNo source writes. Name-only and unclear date/payment identities become review errors.',
  );
  process.exit(1);
}
const mapping = mappingFile
  ? JSON.parse(await readFile(mappingFile, "utf8"))
  : {};
const workbook = await readExcel(input);
const source = workbook.find((s) => s.sheet === sheet);
if (!source) throw new Error("Exact sheet name not found.");
const result = convertLegacy(sheet, source.data, target, mapping);
const output = outputArg || `.local-data/${target}-converted.csv`;
await mkdir(dirname(output), { recursive: true });
const serializable = result.rows.map((r) =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [
      k,
      v && typeof v === "object" ? JSON.stringify(v) : v,
    ]),
  ),
);
await writeFile(output, csvSerialize(serializable));
await writeFile(
  output + ".issues.json",
  JSON.stringify(result.issues, null, 2),
);
console.log(
  JSON.stringify(
    {
      converted: result.rows.length,
      reviewRequired: result.issues.length,
      output,
    },
    null,
    2,
  ),
);
if (result.issues.length) {
  console.log(
    "Review issues before import; source rows were not silently corrected.",
  );
  process.exitCode = 2;
}
