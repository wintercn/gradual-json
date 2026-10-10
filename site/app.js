import { computed, createApp, onMounted, reactive, ref, shallowRef, watch } from "./assets/vue.js";
import { parse } from "./assets/parser.js";
import scenarios from "./scenarios.js?v=2";
import ObjectInspector from "./object-inspector.js?v=1";

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
    const parts = ['{', '"title":"渐', '进式 JSON","items":[', '{"name":"第一', '项"},', '{"name":"第二项","count":2}', ']}'];
    const notes = [
      '读到 {，创建并写入空对象。',
      '字符串还没结束，title 已经写入“渐”。',
      '继续追加 title；读到 [，写入空数组。',
      '数组中已有第一个对象，name 正在增长。',
      '第一个数组项完成，等待后续输入。',
      '写入第二个对象，以及完整读出的数字 count。',
      '输入结束并校验通过，返回这个完整对象。',
    ];
    const step = ref(0);
    const constructed = shallowRef();
    const revision = ref(0);
    const complete = ref(false);
    const playing = ref(true);
    const waiting = ref(false);
    const error = ref("");
    let runId = 0;
    let release;
    let timer;

    function advance() {
      clearTimeout(timer);
      const resume = release;
      release = undefined;
      waiting.value = false;
      resume?.();
    }

    function togglePlay() {
      playing.value = !playing.value;
      clearTimeout(timer);
      if (playing.value) {
        if (complete.value) timer = setTimeout(start, 1800);
        else if (release) timer = setTimeout(advance, 1200);
      }
    }

    async function start() {
      const id = ++runId;
      advance();
      const host = {};
      step.value = 0;
      constructed.value = undefined;
      revision.value = 0;
      complete.value = false;
      error.value = "";
      async function* chunks() {
        for (let index = 0; index < parts.length; index++) {
          if (index > 0) {
            await new Promise(resolve => {
              release = resolve;
              waiting.value = true;
              if (playing.value) timer = setTimeout(advance, 1200);
            });
          }
          if (id !== runId) throw new DOMException("演示已重新开始", "AbortError");
          yield parts[index];
          // 解析器消费当前块后，读取普通宿主对象的实际内容用于展示。
          constructed.value = host.data;
          revision.value++;
          step.value = index + 1;
        }
      }
      try {
        await parse(chunks(), host, "data");
        if (id === runId) {
          complete.value = true;
          if (playing.value) timer = setTimeout(start, 1800);
        }
      } catch (cause) {
        if (id === runId) error.value = cause.message;
      }
    }

    onMounted(start);
    return { parts, notes, step, constructed, revision, complete, playing, waiting, error, advance, togglePlay, start };
  },
}).component("ObjectInspector", ObjectInspector).mount("#construction-demo");

createApp(scenarios).component("ObjectInspector", ObjectInspector).mount("#scenarios-demo");

createApp({
  setup() {
    const host = reactive({});
    const sample = ref("card");
    const chunkSize = ref(1);
    const pace = ref("normal");
    const received = ref("");
    const latestChunks = ref([]);
    const chunkCount = ref(0);
    const status = ref("idle");
    const error = ref("");
    let runId = 0;
    const samples = {
      card: '{"title":"周末书单","description":"周六读随笔，周日整理语言学习笔记。","author":{"name":"小林","role":"整理者","active":true},"items":[{"label":"语言与文字","description":"阅读第一至三章，记录词汇。","price":38.5,"tags":["语言","纸质"],"available":true},{"label":"城市散步","description":"周日下午阅读。","price":0,"tags":["随笔"],"available":false},{"label":"日常记录","description":"摘录与笔记。","price":24,"tags":["笔记"],"available":true}],"tags":["周末","阅读"],"ready":true}',
      unicode: '{"title":"Unicode \\u6e10\\u8fdb 🌱","description":"换行\\n与引号：\\"JSON\\"，完整解码后写入。","tags":["\\u4f60\\u597d","跨块转义"],"ready":true}',
      invalid: '{"title":"已写入的内容会保留","description":"末尾的多余逗号让这个输入无效。","tags":["部分结果"],"ready":true,}',
    };
    const input = computed(() => samples[sample.value]);
    const running = computed(() => status.value === "streaming");
    const progress = computed(() => Math.round(received.value.length / input.value.length * 100));
    const items = computed(() => host.data?.items ?? []);
    const total = computed(() => items.value.reduce((sum, item) => sum + (item.price ?? 0), 0));
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

    return { host, sample, chunkSize, pace, received, latestChunks, chunkCount, status, error, input, running, progress, items, total, statusLabel, start, stop };
  },
}).component("ObjectInspector", ObjectInspector).mount("#demo");

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
