import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(projectRoot, ".test-build");
await fs.mkdir(outputDir, { recursive: true });

async function compile(sourcePath, outputName, replacements = []) {
  const source = await fs.readFile(path.join(projectRoot, sourcePath), "utf8");
  let output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const [from, to] of replacements) output = output.replaceAll(from, to);
  await fs.writeFile(path.join(outputDir, outputName), output, "utf8");
}

await compile("src/dateUtils.ts", "dateUtils.mjs");
await compile("src/lifeMetrics.ts", "lifeMetrics.mjs", [["./dateUtils", "./dateUtils.mjs"]]);
await compile("src/markdown.ts", "markdown.mjs", [
  ["./dateUtils", "./dateUtils.mjs"],
  ["./lifeMetrics", "./lifeMetrics.mjs"],
]);
await compile("tests/lifeMetrics.test.ts", "lifeMetrics.test.mjs", [
  ["../src/lifeMetrics", "./lifeMetrics.mjs"],
  ["../src/markdown", "./markdown.mjs"],
]);
