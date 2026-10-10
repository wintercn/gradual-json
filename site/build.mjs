import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const output = new URL("../.pages-dist/", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await rm(output, { recursive: true, force: true });
await mkdir(new URL("assets/", output), { recursive: true });
const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
await writeFile(new URL("index.html", output), html
  .replaceAll("__PACKAGE_VERSION__", pkg.version));
for (const file of ["style.css", "app.js", "scenarios.js", "object-inspector.js", "performance.js", "logo.svg", "favicon.svg"]) {
  await cp(new URL(file, import.meta.url), new URL(file, output));
}
await writeFile(new URL("performance-worker.js", output), (await readFile(new URL("./performance-worker.js", import.meta.url), "utf8"))
  .replaceAll("__PACKAGE_VERSION__", pkg.version));
for (const [name, source] of [["jsonriver", "jsonriver/dist/"], ["streamparser", "@streamparser/json/dist/mjs/"]]) {
  await cp(new URL(`../bench/node_modules/${source}`, import.meta.url), new URL(`assets/${name}/`, output), { recursive: true });
}
await cp(new URL("../bench/node_modules/jsonriver/LICENSE", import.meta.url), new URL("assets/jsonriver/LICENSE", output));
await cp(new URL("../bench/node_modules/@streamparser/json/LICENSE", import.meta.url), new URL("assets/streamparser/LICENSE", output));
await cp(new URL("../dist/parser.js", import.meta.url), new URL("assets/parser.js", output));
await cp(new URL("../node_modules/vue/dist/vue.esm-browser.prod.js", import.meta.url), new URL("assets/vue.js", output));
await cp(new URL("../node_modules/vue/LICENSE", import.meta.url), new URL("assets/vue.LICENSE", output));
await cp(new URL("../LICENSE", import.meta.url), new URL("LICENSE", output));
await writeFile(new URL(".nojekyll", output), "");
console.log("GitHub Pages site built in .pages-dist/");
