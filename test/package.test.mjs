import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("发布包离线安装后支持根导入、调用方类型、Vue 和标准环境 ESM", async (t) => {
  const project = fileURLToPath(new URL("../", import.meta.url));
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, "Use npm test or npm run test:package to run the package check");
  const temporary = await mkdtemp(join(tmpdir(), "json-package-"));
  const env = {
    ...process.env,
    npm_config_cache: join(temporary, "npm-cache"),
    npm_config_update_notifier: "false",
  };
  try {
    execFileSync(process.execPath, [npmCli, "run", "build"], {
      cwd: project, env, encoding: "utf8", stdio: "pipe",
    });
    const staging = join(temporary, "package");
    const consumer = join(temporary, "consumer");
    await mkdir(staging);
    await mkdir(consumer);
    for (const file of ["dist", "src", "test", "demos", "docs", ".github", ".gitignore", "AGENTS.md", "README.md", "CHANGELOG.md", "LICENSE"]) {
      const source = join(project, file);
      try { await access(source); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      await cp(source, join(staging, file), { recursive: true });
    }
    // A reference-directory marker verifies that it cannot enter the package.
    await mkdir(join(staging, "sources"));
    await writeFile(join(staging, "sources", "not-for-publication.txt"), "reference marker");
    const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
    if (!manifest.name || !manifest.version) {
      t.diagnostic("发布身份尚未完整确定；仅在临时副本补齐缺失的包名或版本，不验证最终发布身份。");
      manifest.name ||= "json-stream-parser-local-check";
      manifest.version ||= "0.0.0";
    }
    await writeFile(join(staging, "package.json"), JSON.stringify(manifest, null, 2));
    const [packed] = JSON.parse(execFileSync(process.execPath, [npmCli, "pack", "--json", "--ignore-scripts"], {
      cwd: staging, env, encoding: "utf8", stdio: "pipe",
    }));
    const expectedFiles = ["CHANGELOG.md", "README.md", "dist/parser.d.ts", "dist/parser.js", "package.json"];
    if (packed.files.some(file => file.path === "LICENSE")) expectedFiles.push("LICENSE");
    assert.deepEqual(packed.files.map(file => file.path).sort(), expectedFiles.sort());
    await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
    execFileSync(process.execPath, [npmCli, "install", join(staging, packed.filename), "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--omit=dev"], {
      cwd: consumer, env, encoding: "utf8", stdio: "pipe",
    });
    const installedManifest = JSON.parse(await readFile(join(consumer, "node_modules", ...manifest.name.split("/"), "package.json"), "utf8"));
    assert.equal(Object.keys(installedManifest.dependencies ?? {}).length, 0);

    const vueUrl = pathToFileURL(join(project, "node_modules/vue/index.mjs")).href;
    await writeFile(join(consumer, "runtime.mjs"), `
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { parse } from ${JSON.stringify(manifest.name)};
import { reactive, effect, isReactive, stop } from ${JSON.stringify(vueUrl)};
const host = reactive({ data: undefined });
const changes = [];
const runner = effect(() => {
  const value = host.data?.child?.text;
  if (typeof value === "string") changes.push(value);
});
async function* chunks() {
  yield '{"child":{"text":"a';
  assert.equal(isReactive(host.data.child), true);
  assert.equal(host.data.child.text, "a");
  yield 'b","number":12';
  assert.equal(Object.hasOwn(host.data.child, "number"), false);
  yield 'e2}}';
}
try {
  const result = await parse(chunks(), host, "data");
  assert.equal(result, host.data);
  assert.deepEqual(result, { child: { text: "ab", number: 1200 } });
  assert.deepEqual(changes, ["", "a", "ab"]);
} finally { stop(runner); }
const bytes = Buffer.from('{"text":"中🌊"}');
const stream = Readable.from([bytes.subarray(0, 10), bytes.subarray(10, 13), bytes.subarray(13)]);
stream.setEncoding("utf8");
assert.deepEqual(await parse(stream), { text: "中🌊" });
async function* invalid() { yield "[1,]"; }
await assert.rejects(parse(invalid()), SyntaxError);
`);
    execFileSync(process.execPath, ["runtime.mjs"], { cwd: consumer, env, encoding: "utf8", stdio: "pipe" });

    await symlink(join(project, "node_modules/vue"), join(consumer, "node_modules/vue"), "dir");
    await writeFile(join(consumer, "types.ts"), `
import { parse, type Character, type ChunkSource, type JsonValue } from ${JSON.stringify(manifest.name)};
import { reactive, watchEffect } from "vue";
async function* input() { yield '{"title":"hello"}'; }
const source: ChunkSource = input();
const character: Character = "a";
const parsed: Promise<JsonValue> = parse(source);
interface Data { title: string }
interface Host { data?: Data; loading: boolean }
const host: Host = { loading: true };
parse(input(), host, "data");
parse(input(), { data: undefined }, "data");
parse(input(), new Proxy(host, {}), "data");
const reactiveHost = reactive<{ data?: Data }>({});
const stopWatching = watchEffect(() => reactiveHost.data?.title);
parse(input(), reactiveHost, "data");
parse(input(), reactive({ data: undefined }), "data");
stopWatching();
void character;
void parsed;
// @ts-expect-error Input blocks must be strings.
parse((async function* () { yield new Uint8Array(); })());
// @ts-expect-error Host must be an object.
parse(input(), 1);
// @ts-expect-error Property name must be a string.
parse(input(), {}, 1);
`);
    const tsc = join(project, "node_modules/typescript/lib/tsc.js");
    for (const resolution of ["Bundler", "NodeNext"]) {
      execFileSync(process.execPath, [tsc, "--noEmit", "--strict", "--noUncheckedIndexedAccess", "--exactOptionalPropertyTypes", "--target", "ES2022", "--module", resolution === "NodeNext" ? "NodeNext" : "ES2022", "--moduleResolution", resolution, "--lib", "ES2022,DOM", "types.ts"], {
        cwd: consumer, env, encoding: "utf8", stdio: "pipe",
      });
    }

    await writeFile(join(consumer, "standard-environment.mjs"), `
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createContext, SourceTextModule } from "node:vm";
const moduleUrl = import.meta.resolve(${JSON.stringify(manifest.name)});
const module = new SourceTextModule(await readFile(new URL(moduleUrl), "utf8"), { context: createContext({}) });
await module.link(() => { throw new Error("Unexpected runtime dependency"); });
await module.evaluate();
async function* chunks() { yield '{"text":"中'; yield '🌊","items":[1,true,null]}'; }
const host = {};
const result = await module.namespace.parse(chunks(), host, "data");
assert.equal(result, host.data);
assert.equal(JSON.stringify(result), '{"text":"中🌊","items":[1,true,null]}');
`);
    execFileSync(process.execPath, ["--experimental-vm-modules", "standard-environment.mjs"], {
      cwd: consumer, env, encoding: "utf8", stdio: "pipe",
    });
    t.diagnostic(`离线安装 ${manifest.name}@${manifest.version}；${packed.files.length} 个发布文件，压缩后 ${packed.size} 字节。`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
