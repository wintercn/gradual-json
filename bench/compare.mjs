import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "../src/parser.ts";
import { parse as river } from "jsonriver";
import { JSONParser } from "@streamparser/json";

const root = fileURLToPath(new URL("../", import.meta.url));
const beforeRef = "v0.1.0";
const beforeSource = execFileSync("git", ["show", `${beforeRef}:src/parser.ts`], {
  cwd: root, encoding: "utf8",
});
const temporary = await mkdtemp(join(tmpdir(), "gradual-json-bench-"));

try {
  const beforeFile = join(temporary, "before.ts");
  await writeFile(beforeFile, beforeSource);
  const { parse: before } = await import(pathToFileURL(beforeFile).href);
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const currentVersion = `v${packageJson.version}`;

  async function* chunks(input) {
    for (let i = 0; i < input.length; i += 4096) yield input.slice(i, i + 4096);
  }

  const methods = {
    [beforeRef]: (input) => before(chunks(input)),
    [currentVersion]: (input) => parse(chunks(input)),
    "jsonriver 1.1.1": async (input) => {
      let result;
      for await (const value of river(chunks(input))) result = value;
      return result;
    },
    "@streamparser/json 0.0.26 (partial)": async (input) => {
      const parser = new JSONParser({ paths: ["$"], emitPartialTokens: true, emitPartialValues: true });
      let result;
      parser.onValue = ({ value }) => { result = value; };
      for await (const chunk of chunks(input)) parser.write(chunk);
      if (!parser.isEnded) parser.end();
      return result;
    },
  };
  const inputs = {
    records: JSON.stringify(Array.from({ length: 2500 }, (_, i) => ({
      id: i, title: `item-${i}-abcdefghijk`, tags: ["a", "b", "c"],
      details: { enabled: i % 2 === 0, price: i + 0.25 }, description: "sample ".repeat(10),
    }))),
    long_string: JSON.stringify({ text: "x".repeat(262144) }),
    numbers: JSON.stringify(Array.from({ length: 50000 }, (_, i) => i / 10)),
  };
  const results = {
    measuredAt: new Date().toISOString(),
    node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model,
    versions: { gradualJsonBefore: beforeRef, gradualJson: currentVersion, jsonriver: "1.1.1", streamparser: "0.0.26" },
    parserSha256: createHash("sha256").update(await readFile(new URL("../src/parser.ts", import.meta.url))).digest("hex"),
    beforeParserSha256: createHash("sha256").update(beforeSource).digest("hex"),
    methodology: {
      chunkSize: 4096, chunkUnit: "UTF-16 code units", input: "ASCII JSON strings generated in memory",
      warmups: 3, trials: 11, order: "rotate first method each trial", statistic: "median elapsed milliseconds per complete parse",
      validation: "each method's complete output deepEqual to JSON.parse before timings",
      exclusions: ["network I/O", "UTF-8 decoding", "Vue", "intermediate update counts", "memory usage", "invalid-input validation cost"],
    },
    timings: {},
  };

  for (const [name, input] of Object.entries(inputs)) {
    const expected = JSON.parse(input);
    const entries = Object.entries(methods);
    for (const [, run] of entries) {
      assert.deepEqual(await run(input), expected);
      for (let i = 0; i < 3; i++) await run(input);
    }
    const samples = Object.fromEntries(entries.map(([key]) => [key, []]));
    for (let trial = 0; trial < 11; trial++) {
      for (let offset = 0; offset < entries.length; offset++) {
        const [key, run] = entries[(trial + offset) % entries.length];
        const start = performance.now();
        await run(input);
        samples[key].push(performance.now() - start);
      }
    }
    const medianMs = Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, [...values].sort((a, b) => a - b)[5]]));
    results.timings[name] = { codeUnits: input.length, bytes: Buffer.byteLength(input), medianMs, samples };
    console.log(name, medianMs);
  }
  await writeFile(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 2) + "\n");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
