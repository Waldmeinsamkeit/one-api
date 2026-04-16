import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildOpenApiSpec } from "../src/openapi.js";

async function run() {
  const spec = buildOpenApiSpec();
  const outDir = path.resolve(process.cwd(), "../docs/api");
  const outPath = path.join(outDir, "openapi.json");
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  // eslint-disable-next-line no-console
  console.log(`OpenAPI exported: ${outPath}`);
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
