import { parse } from "./assets/parser.js";
import { parse as river } from "./assets/jsonriver/index.js";
import { JSONParser } from "./assets/streamparser/index.js";

async function* chunks(input) {
  for (let i = 0; i < input.length; i += 4096) yield input.slice(i, i + 4096);
}

const methods = [
  ["gradual", input => parse(chunks(input))],
  ["river", async input => {
    let result;
    for await (const value of river(chunks(input))) result = value;
    return result;
  }],
  ["streamparser", async input => {
    const parser = new JSONParser({ paths: ["$"], emitPartialTokens: true, emitPartialValues: true });
    let result;
    parser.onValue = ({ value }) => { result = value; };
    for await (const chunk of chunks(input)) parser.write(chunk);
    if (!parser.isEnded) parser.end();
    return result;
  }],
];

self.onmessage = async ({ data }) => {
  if (data.type !== "start") return;
  try {
    const inputs = [
      ["records", "2,500 条嵌套记录", JSON.stringify(Array.from({ length: 2500 }, (_, i) => ({
        id: i, title: `item-${i}-abcdefghijk`, tags: ["a", "b", "c"],
        details: { enabled: i % 2 === 0, price: i + 0.25 }, description: "sample ".repeat(10),
      })))],
      ["long_string", "长字符串", JSON.stringify({ text: "x".repeat(262144) })],
      ["numbers", "50,000 个数字", JSON.stringify(Array.from({ length: 50000 }, (_, i) => i / 10))],
    ];
    const results = {
      measuredAt: new Date().toISOString(),
      environment: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency },
      versions: { gradual: "__PACKAGE_VERSION__", river: "1.1.1", streamparser: "0.0.26" },
      methodology: {
        execution: "browser module worker", chunkSize: 4096, chunkUnit: "UTF-16 code units",
        input: "ASCII JSON strings generated in memory", warmups: 3, trials: 11,
        order: "rotate first method each trial", statistic: "median elapsed milliseconds per complete parse",
        validation: "each method's complete output serialized equal to JSON.parse before timings",
        exclusions: ["module loading", "input generation", "network I/O", "input decoding", "Vue updates", "memory usage"],
      },
      timings: [],
    };
    for (const [id, title, input] of inputs) {
      self.postMessage({ type: "progress", message: `${title} · 校验结果与预热` });
      const expected = JSON.stringify(JSON.parse(input));
      for (const [key, run] of methods) {
        if (JSON.stringify(await run(input)) !== expected) throw new Error(`${title}：${key} 的解析结果不一致`);
        for (let i = 0; i < 3; i++) await run(input);
      }
      const samples = Object.fromEntries(methods.map(([key]) => [key, []]));
      for (let trial = 0; trial < 11; trial++) {
        for (let offset = 0; offset < methods.length; offset++) {
          const [key, run] = methods[(trial + offset) % methods.length];
          const start = performance.now();
          await run(input);
          samples[key].push(performance.now() - start);
        }
        self.postMessage({ type: "progress", message: `${title} · 第 ${trial + 1} / 11 轮` });
      }
      const medianMs = Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, [...values].sort((a, b) => a - b)[5]]));
      const result = { id, title, codeUnits: input.length, bytes: input.length, medianMs, samples };
      results.timings.push(result);
      self.postMessage({ type: "result", result });
    }
    self.postMessage({ type: "complete", results });
  } catch (cause) {
    self.postMessage({ type: "error", message: cause.message });
  } finally {
    self.close();
  }
};
