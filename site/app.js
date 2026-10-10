import { computed, createApp, reactive, ref, watch } from "./assets/vue.js";
import { parse } from "./assets/parser.js";

const copyInstall = document.querySelector(".copy-install");
copyInstall.addEventListener("click", async () => {
  const feedback = document.querySelector(".copy-feedback");
  try {
    await navigator.clipboard.writeText("npm install gradual-json");
    feedback.textContent = "已复制";
  } catch {
    feedback.textContent = "请选择并复制安装命令";
  }
  setTimeout(() => { feedback.textContent = ""; }, 2200);
});

createApp({
  setup() {
    const host = reactive({});
    const sample = ref("card");
    const chunkSize = ref(8);
    const pace = ref("normal");
    const received = ref("");
    const latestChunks = ref([]);
    const chunkCount = ref(0);
    const status = ref("idle");
    const error = ref("");
    let runId = 0;
    const samples = {
      card: '{"title":"流式解析示例","description":"字符串值随输入逐步写入宿主对象。","tags":["异步字符串块","Vue 响应式","部分结果"],"ready":true}',
      unicode: '{"title":"Unicode \\u6e10\\u8fdb 🌱","description":"换行\\n与引号：\\"JSON\\"，完整解码后写入。","tags":["\\u4f60\\u597d","跨块转义"],"ready":true}',
      invalid: '{"title":"已写入的内容会保留","description":"末尾的多余逗号让这个输入无效。","tags":["部分结果"],"ready":true,}',
    };
    const input = computed(() => samples[sample.value]);
    const running = computed(() => status.value === "streaming");
    const progress = computed(() => Math.round(received.value.length / input.value.length * 100));
    const constructed = computed(() => JSON.stringify(host.data, null, 2));
    const statusLabel = computed(() => ({ idle: "准备接收 · 点击开始运行", streaming: "正在接收 · 结果逐步构造", complete: "解析完成 · EOF 校验通过", stopped: "已停止 · 保留部分结果", error: "解析失败 · 无效 JSON" })[status.value]);

    watch(sample, () => {
      runId++;
      delete host.data;
      received.value = "";
      latestChunks.value = [];
      chunkCount.value = 0;
      error.value = "";
      status.value = "idle";
    });

    function stop() {
      runId++;
      status.value = "stopped";
    }

    async function start() {
      const id = ++runId;
      const text = input.value;
      const size = chunkSize.value;
      const delay = { slow: 90, normal: 45, fast: 8 }[pace.value] * Math.min(size, 8);
      delete host.data;
      received.value = "";
      latestChunks.value = [];
      chunkCount.value = 0;
      error.value = "";
      status.value = "streaming";
      async function* chunks() {
        for (let index = 0; index < text.length; index += size) {
          await new Promise(resolve => setTimeout(resolve, delay));
          if (id !== runId) throw new DOMException("输入已停止", "AbortError");
          const chunk = text.slice(index, index + size);
          received.value += chunk;
          chunkCount.value++;
          latestChunks.value = [...latestChunks.value.slice(-5), { id: chunkCount.value, text: chunk }];
          yield chunk;
        }
        if (id !== runId) throw new DOMException("输入已停止", "AbortError");
      }
      try {
        await parse(chunks(), host, "data");
        if (id === runId) status.value = "complete";
      } catch (cause) {
        if (id !== runId) return;
        status.value = "error";
        error.value = cause.message;
      }
    }

    return { host, sample, chunkSize, pace, received, latestChunks, chunkCount, status, error, input, running, progress, constructed, statusLabel, start, stop };
  },
}).mount("#demo");

createApp({
  setup() {
    const tab = ref("basic");
    const copied = ref(false);
    const copyMessage = ref("");
    let feedbackId = 0;
    const examples = [
      { id: "basic", label: "基础", note: "输入结束并校验通过后返回完整结果。", code: 'import { parse } from "gradual-json";\n\nasync function* chunks() {\n  yield \'{"title":"渐进\';\n  yield \'式 JSON"}\';\n}\n\nconst result = await parse(chunks());\n// { title: "渐进式 JSON" }' },
      { id: "vue", label: "Vue", note: "host.data 的写入由 Vue 响应式系统观察。", code: 'import { reactive } from "vue";\nimport { parse } from "gradual-json";\n\ninterface Data { title: string }\nconst host = reactive<{ data?: Data }>({});\n\n// chunks() 是上一个示例的异步生成器\nconst pending = parse(chunks(), host, "data");\n// host.data 随输入逐步更新\nconst result = await pending;\n// result === host.data' },
      { id: "node", label: "Node.js", note: "设定 utf8 编码的 Node Readable 可直接传入。", code: 'import { createReadStream } from "node:fs";\nimport { parse } from "gradual-json";\n\nconst stream = createReadStream("data.json", {\n  encoding: "utf8",\n});\n\nconst result = await parse(stream);\n// 输入结束并校验完整后，返回根值' },
    ];
    const currentExample = computed(() => examples.find(item => item.id === tab.value));
    async function copy() {
      const id = ++feedbackId;
      try {
        await navigator.clipboard.writeText(currentExample.value.code);
        copied.value = true;
        copyMessage.value = "示例代码已复制";
      } catch {
        copyMessage.value = "复制失败，请选择代码手动复制";
      }
      setTimeout(() => { if (id === feedbackId) { copied.value = false; copyMessage.value = ""; } }, 2200);
    }
    function navigateTabs(event, current) {
      const index = examples.findIndex(item => item.id === current);
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % examples.length;
      else if (event.key === "ArrowLeft") next = (index + examples.length - 1) % examples.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = examples.length - 1;
      else return;
      event.preventDefault();
      tab.value = examples[next].id;
      document.getElementById("tab-" + tab.value).focus();
    }
    return { tab, copied, copyMessage, examples, currentExample, copy, navigateTabs };
  },
}).mount("#examples");
