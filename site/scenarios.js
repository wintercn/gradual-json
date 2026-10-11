import { computed, reactive, ref, shallowRef, watch } from "./assets/vue.js";
import { parse } from "./assets/parser.js";

export async function* httpChunks(response) {
  if (!response.ok || !response.body) throw new Error(document.documentElement.lang === "en" ? "Cannot read the JSON response" : "无法读取 JSON 响应");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    try { await reader.cancel(); }
    finally { reader.releaseLock(); }
  }
}

export async function* sseChunks(source) {
  const queue = [];
  let wake;
  let ended = false;
  let failure;
  const message = event => { queue.push(event.data); wake?.(); };
  const end = () => { ended = true; source.close(); wake?.(); };
  const error = () => { failure = new Error(document.documentElement.lang === "en" ? "SSE input interrupted" : "SSE 输入中断"); end(); };
  source.addEventListener("message", message);
  source.addEventListener("end", end);
  source.addEventListener("error", error);
  try {
    while (true) {
      if (failure) throw failure;
      if (queue.length) { yield queue.shift(); continue; }
      if (ended) return;
      await new Promise(resolve => { wake = resolve; });
      wake = undefined;
    }
  } finally {
    source.close();
    source.removeEventListener("message", message);
    source.removeEventListener("end", end);
    source.removeEventListener("error", error);
  }
}

export function commandProxy(commands) {
  const proxies = new WeakMap();
  function observe(target, path) {
    if (proxies.has(target)) return proxies.get(target);
    const proxy = new Proxy(target, {
      get(target, key) {
        const value = target[key];
        return value !== null && typeof value === "object"
          ? observe(value, [...path, String(key)]) : value;
      },
      set(target, key, value) {
        target[key] = value;
        commands.push({
          op: "set",
          path: [...path, String(key)],
          value: structuredClone(value),
        });
        return true;
      },
    });
    proxies.set(target, proxy);
    return proxy;
  }
  return observe({}, []);
}

export default {
  setup() {
    const english = document.documentElement.lang === "en";
    const scenario = ref("vue");
    const host = shallowRef({});
    const constructed = shallowRef();
    const revision = ref(0);
    const received = ref("");
    const wire = ref([]);
    const commands = ref([]);
    const status = ref("idle");
    const error = ref("");
    let runId = 0;
    const parts = english
      ? ['{', '"title":"Progressive', ' JSON café","items":[', '{"name":"First ', 'item"},', '{"name":"Second item"}', '],"ready":true}']
      : ['{', '"title":"渐', '进式 JSON","items":[', '{"name":"第一', '项"},', '{"name":"第二项"}', '],"ready":true}'];
    const examples = [
      {
        id: "vue", label: "Vue", title: english ? "Update the page as the object grows" : "对象写入，页面随之更新",
        description: english ? "Pass a reactive object to the parser. The template reads that same object as strings grow and array items appear." : "把 reactive 对象传入解析器。模板读取同一个对象，字符串逐步显示，数组项逐步加入。",
        flow: english ? ["String chunks", "parse", "reactive object", "Vue template"] : ["字符串块", "parse", "reactive 对象", "Vue 模板"],
        note: english ? "A local async generator supplies chunks to the parser, which writes into a deeply reactive Vue object." : "本地异步生成器逐块输入，实际写入 Vue 深层响应式对象。",
        code: 'import { reactive } from "vue";\nimport { parse } from "gradual-json";\n\nconst host = reactive({});\nawait parse(chunks(), host, "data");',
        template: '<h3>{{ host.data?.title }}</h3>\n<ul>\n  <li v-for="(item, i) in host.data?.items" :key="i">\n    {{ item.name }}\n  </li>\n</ul>',
      },
      {
        id: "http", label: "HTTP", title: english ? "Build the object while the response arrives" : "响应还在传输，对象开始构造",
        description: english ? "Read the fetch response body, decode bytes with TextDecoderStream, and pass string chunks to parse. A UTF-8 character can span byte chunks." : "读取 fetch 的响应体，用 TextDecoderStream 解码字节，再把字符串块交给 parse。中文的 UTF-8 字节可以跨块到达。",
        flow: english ? ["response.body", "UTF-8 decoding", "parse", "host.data"] : ["response.body", "UTF-8 解码", "parse", "host.data"],
        note: english ? "The demo simulates a delayed response body in the browser and splits a UTF-8 character across chunks. It runs the actual decoder and parser." : "演示在浏览器内模拟延时响应体，刻意拆开中文的 UTF-8 字节；实际调用解码器和解析器。",
        code: 'import { parse } from "gradual-json";\n\nconst response = await fetch("/data.json");\nconst host = {};\nawait parse(httpChunks(response), host, "data");',
        adapter: httpChunks.toString(),
      },
      {
        id: "sse", label: "SSE", title: english ? "Feed JSON fragments from successive messages" : "把消息中的 JSON 片段接成输入流",
        description: english ? "EventSource handles the SSE protocol. The application passes JSON text fragments from each message.data to parse in order." : "EventSource 处理 SSE 协议，应用把每条 message.data 中的 JSON 文本片段按顺序送入 parse。",
        flow: ["EventSource", "message.data", "parse", "host.data"],
        note: english ? "The demo simulates message and end events. Each message carries a fragment of one JSON document; an end event signals the end of input." : "演示模拟 message 和 end 事件。此例约定每条 message 携带同一份 JSON 的一个片段，服务端用 end 事件结束输入。",
        code: 'import { parse } from "gradual-json";\n\nconst source = new EventSource("/events");\nconst host = {};\nawait parse(sseChunks(source), host, "data");',
        adapter: sseChunks.toString(),
      },
      {
        id: "proxy", label: english ? "Proxy → commands" : "Proxy → 命令", title: english ? "Record nested assignments as commands" : "把深层赋值记录为命令序列",
        description: english ? "Use Proxy.set to record paths and values, and Proxy.get to return proxies for nested objects. Record object creation, string updates, and array writes as commands." : "用 Proxy 的 set 记录路径和值，get 返回子对象的代理。对象创建、字符串追加和数组写入都能转成命令。",
        flow: english ? ["String chunks", "parse", "Proxy.set", "Commands"] : ["字符串块", "parse", "Proxy.set", "命令序列"],
        note: english ? "The application's Proxy generates the commands. Each command captures the value at the time of the write and can be replayed in order on another object." : "命令由应用层 Proxy 生成。每条命令保存写入当时的值，可按顺序重放到另一个对象。",
        code: 'import { parse } from "gradual-json";\n\nconst commands = [];\nconst host = commandProxy(commands);\nawait parse(chunks(), host, "data");\n\n// { op: "set", path: ["data", "title"], value: ' + (english ? '"Progressive"' : '"渐"') + ' }',
        adapter: commandProxy.toString(),
      },
    ];
    const current = computed(() => examples.find(item => item.id === scenario.value));
    const running = computed(() => status.value === "streaming");
    const statusLabel = computed(() => (english
      ? { idle: "Click Run example", streaming: "Receiving input · updating the object", stopped: "Stopped · partial result retained", complete: "Input ended · complete result returned", error: "Input failed" }
      : { idle: "点击运行此例", streaming: "正在输入 · 逐步写入", stopped: "已停止 · 保留部分结果", complete: "输入结束 · 完整返回", error: "输入失败" })[status.value]);

    function stop() {
      runId++;
      status.value = "stopped";
    }

    watch(scenario, () => {
      runId++;
      host.value = {};
      constructed.value = undefined;
      revision.value = 0;
      received.value = "";
      wire.value = [];
      commands.value = [];
      error.value = "";
      status.value = "idle";
    });

    function navigate(event, id) {
      const index = examples.findIndex(item => item.id === id);
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % examples.length;
      else if (event.key === "ArrowLeft") next = (index + examples.length - 1) % examples.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = examples.length - 1;
      else return;
      event.preventDefault();
      scenario.value = examples[next].id;
      document.getElementById("scenario-tab-" + scenario.value).focus();
    }

    async function start() {
      const id = ++runId;
      const mode = scenario.value;
      commands.value = [];
      const target = mode === "vue" ? reactive({}) : mode === "proxy" ? commandProxy(commands.value) : {};
      host.value = target;
      constructed.value = undefined;
      revision.value = 0;
      received.value = "";
      wire.value = [];
      error.value = "";
      status.value = "streaming";

      async function pause() {
        await new Promise(resolve => setTimeout(resolve, 450));
        if (id !== runId) throw new DOMException(english ? "Input stopped" : "输入已停止", "AbortError");
      }

      async function* localChunks() {
        for (const part of parts) { await pause(); yield part; }
      }

      let source;
      if (mode === "http") {
        const bytes = new TextEncoder().encode(parts.join(""));
        // 两份示例都在多字节 UTF-8 字符内部切块。
        const sizes = english ? [11, 1, 5, 14, 7, 10, 8] : [11, 1, 5, 9, 7, 10, 8];
        let offset = 0;
        let index = 0;
        let canceled = false;
        const body = new ReadableStream({
          async pull(controller) {
            await pause();
            if (canceled) return;
            if (offset === bytes.length) { controller.close(); return; }
            const chunk = bytes.slice(offset, offset + sizes[index++ % sizes.length]);
            offset += chunk.length;
            wire.value.push(Array.from(chunk, byte => byte.toString(16).padStart(2, "0")).join(" "));
            controller.enqueue(chunk);
          },
          cancel() { canceled = true; },
        });
        source = httpChunks(new Response(body));
      } else if (mode === "sse") {
        const events = new EventTarget();
        let closed = false;
        events.close = () => { closed = true; };
        source = sseChunks(events);
        (async () => {
          try {
            for (const part of parts) {
              await pause();
              if (closed) return;
              wire.value.push("data: " + part + "\n\n");
              events.dispatchEvent(new MessageEvent("message", { data: part }));
            }
            wire.value.push("event: end\ndata: \n\n");
            events.dispatchEvent(new Event("end"));
          } catch {
            if (!closed) events.dispatchEvent(new Event("error"));
          }
        })();
      } else {
        source = localChunks();
      }

      async function* chunks() {
        for await (const chunk of source) {
          if (id !== runId) throw new DOMException(english ? "Input stopped" : "输入已停止", "AbortError");
          received.value += chunk;
          yield chunk;
          if (id === runId) {
            constructed.value = target.data;
            revision.value++;
          }
        }
      }
      try {
        await parse(chunks(), target, "data");
        if (id === runId) status.value = "complete";
      } catch (cause) {
        if (id !== runId) return;
        status.value = "error";
        error.value = cause.message;
      }
    }

    return { scenario, examples, current, host, constructed, revision, received, wire, commands, status, statusLabel, running, error, start, stop, navigate };
  },
};
