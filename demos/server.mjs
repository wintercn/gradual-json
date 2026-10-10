import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { setTimeout as wait } from "node:timers/promises";
import ts from "typescript";

const parserSource = await readFile(new URL("../src/parser.ts", import.meta.url), "utf8");
const parser = ts.transpileModule(parserSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const routes = new Map([
  ["/", ["text/html; charset=utf-8", await readFile(new URL("./index.html", import.meta.url))]],
  ["/app.js", ["text/javascript; charset=utf-8", await readFile(new URL("./app.js", import.meta.url))]],
  ["/style.css", ["text/css; charset=utf-8", await readFile(new URL("./style.css", import.meta.url))]],
  ["/vue.js", ["text/javascript; charset=utf-8", await readFile(new URL("../node_modules/vue/dist/vue.esm-browser.js", import.meta.url))]],
  ["/parser.js", ["text/javascript; charset=utf-8", parser]],
]);

const json = '{"title":"流式观察 🌊","author":{"name":"小林","active":true},"items":[{"label":"第一项","price":12.5},{"label":"第二项","price":8,"tags":["新到","推荐"]},{"label":"第三项","price":0,"available":false}],"note":null}';
const bytes = Buffer.from(json);
const cuts = new Set([0, bytes.length]);
for (let offset = 16; offset < bytes.length; offset += 16) cuts.add(offset);
cuts.add(bytes.indexOf(Buffer.from("流")) + 1);
cuts.add(bytes.indexOf(Buffer.from("🌊")) + 2);
const boundaries = [...cuts].sort((a, b) => a - b);

const server = createServer(async (request, response) => {
  try {
    if (request.method !== "GET") {
      response.writeHead(405, { Allow: "GET" });
      response.end("Method not allowed");
      return;
    }
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/stream") {
      const requestedDelay = Number(url.searchParams.get("delay") ?? 180);
      const delay = Number.isFinite(requestedDelay) ? Math.min(800, Math.max(30, requestedDelay)) : 180;
      let closed = false;
      response.on("close", () => { closed = true; });
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.flushHeaders();
      for (let index = 1; index < boundaries.length; index++) {
        if (closed) return;
        response.write(bytes.subarray(boundaries[index - 1], boundaries[index]));
        await wait(delay);
      }
      if (!closed) response.end();
      return;
    }
    const asset = routes.get(url.pathname);
    if (!asset) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("未找到页面");
      return;
    }
    response.writeHead(200, { "Content-Type": asset[0], "Cache-Control": "no-store" });
    response.end(asset[1]);
  } catch (error) {
    console.error(error);
    if (response.headersSent) response.destroy();
    else {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("演示服务出错");
    }
  }
});

const port = Number(process.env.PORT ?? 4173);
server.listen(port, "127.0.0.1", () => {
  console.log(`Vue 流式演示：http://127.0.0.1:${port}`);
  console.log("按 Ctrl+C 停止服务。页面与依赖均来自本地文件。");
});
