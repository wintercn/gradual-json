import { computed, createApp, reactive, ref } from "/vue.js";
import { parse } from "/parser.js";

createApp({
  setup() {
    const host = reactive({});
    const mode = ref("local");
    const speed = ref("normal");
    const received = ref("");
    const running = ref(false);
    const completed = ref(false);
    const status = ref("准备开始");
    const receivedCount = computed(() => received.value.length);
    const constructed = computed(() => JSON.stringify(host.data, null, 2));
    const items = computed(() => host.data?.items ?? []);
    const noteReady = computed(() => host.data !== undefined && Object.hasOwn(host.data, "note"));
    let runId = 0;
    let controller;

    const fragments = [
      "{", '"title":"流式', '观察 🌊",', '"author":{',
      '"name":"小林","active":true},', '"items":[', "{",
      '"label":"第一', '项","price":12', ".5},", "{",
      '"label":"第二项","price":8,"tags":[', '"新到",', '"推荐"', "]},",
      '{"label":"第三项","price":0,"available":false}', '],"note":null', "}",
    ];

    async function* localCharacters(signal, id, pace) {
      const charDelay = { slow: 85, normal: 28, fast: 4 }[pace];
      const fragmentDelay = { slow: 420, normal: 180, fast: 30 }[pace];
      for (const fragment of fragments) {
        for (const char of fragment.split("")) {
          await new Promise(resolve => setTimeout(resolve, charDelay));
          if (signal.aborted || id !== runId) throw new DOMException("流已停止", "AbortError");
          received.value += char;
          yield char;
        }
        await new Promise(resolve => setTimeout(resolve, fragmentDelay));
      }
      if (signal.aborted || id !== runId) throw new DOMException("流已停止", "AbortError");
    }

    async function* httpChunks(signal, id, pace) {
      const delay = { slow: 550, normal: 180, fast: 40 }[pace];
      const response = await fetch(`/stream?delay=${delay}`, { signal });
      if (!response.ok || !response.body) throw new Error("无法读取 HTTP 字符流");
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (signal.aborted || id !== runId) throw new DOMException("流已停止", "AbortError");
          if (done) return;
          received.value += value;
          yield value;
        }
      } finally {
        try { await reader.cancel(); } catch { /* 请求中止时，读取端可能已关闭。 */ }
        reader.releaseLock();
      }
    }

    function stop() {
      runId++;
      controller?.abort();
      controller = undefined;
      running.value = false;
      completed.value = false;
      status.value = "已停止，保留已构造的部分";
    }

    async function start() {
      const id = ++runId;
      const currentController = new AbortController();
      controller = currentController;
      delete host.data;
      received.value = "";
      completed.value = false;
      running.value = true;
      status.value = mode.value === "http" ? "正在接收 HTTP 分块响应" : "正在接收本地字符流";
      try {
        const chunks = mode.value === "http"
          ? httpChunks(currentController.signal, id, speed.value)
          : localCharacters(currentController.signal, id, speed.value);
        await parse(chunks, host, "data");
        if (id !== runId || currentController.signal.aborted) return;
        completed.value = true;
        running.value = false;
        controller = undefined;
        status.value = "解析完成（输入已结束）";
      } catch (error) {
        if (id !== runId) return;
        running.value = false;
        completed.value = false;
        controller = undefined;
        status.value = error.name === "AbortError" ? "已停止，保留已构造的部分" : `解析失败：${error.message}`;
      }
    }

    return { host, mode, speed, received, receivedCount, constructed, items, noteReady, running, completed, status, start, stop };
  },
}).mount("#app");
