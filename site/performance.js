import { computed, ref, shallowRef } from "./assets/vue.js";

export default {
  setup() {
    const english = document.documentElement.lang === "en";
    const methods = [
      { id: "gradual", label: "gradual-json", className: "benchmark-gradual" },
      { id: "river", label: "jsonriver", className: "benchmark-river" },
      { id: "streamparser", label: "@streamparser/json", className: "benchmark-streamparser" },
    ];
    const cases = ref([
      { id: "records", title: english ? "2,500 nested records" : "2,500 条嵌套记录" },
      { id: "long_string", title: english ? "Long string" : "长字符串" },
      { id: "numbers", title: english ? "50,000 numbers" : "50,000 个数字" },
    ]);
    const status = ref("idle");
    const message = ref(english ? "Click Start to measure in this browser." : "点击开始，在当前浏览器中测量。");
    const results = shallowRef();
    const running = computed(() => status.value === "running");
    const measuredAt = computed(() => results.value ? new Date(results.value.measuredAt).toLocaleString(english ? "en-US" : "zh-CN", { hour12: false }) : "");
    let worker;

    function start() {
      worker?.terminate();
      results.value = undefined;
      cases.value = cases.value.map(({ id, title }) => ({ id, title }));
      status.value = "running";
      message.value = english ? "Loading benchmark libraries…" : "正在加载测试库…";
      try {
        const current = new Worker(new URL("./performance-worker.js?v=2", import.meta.url), { type: "module" });
        worker = current;
        current.onmessage = ({ data }) => {
          if (worker !== current) return;
          if (data.type === "progress") message.value = data.message;
          else if (data.type === "result") cases.value = cases.value.map(item => item.id === data.result.id ? data.result : item);
          else if (data.type === "complete") {
            results.value = data.results;
            status.value = "complete";
            message.value = english ? "Local benchmark complete" : "本机测试完成";
            current.terminate();
            worker = undefined;
          } else if (data.type === "error") {
            status.value = "error";
            message.value = (english ? "Benchmark failed: " : "测试失败：") + data.message;
            current.terminate();
            worker = undefined;
          }
        };
        current.onerror = event => {
          event.preventDefault();
          if (worker !== current) return;
          status.value = "error";
          message.value = (english ? "Benchmark failed: " : "测试失败：") + (event.message || (english ? "Could not load the benchmark script" : "测试脚本加载失败"));
          current.terminate();
          worker = undefined;
        };
        current.postMessage({ type: "start", language: english ? "en" : "zh-CN" });
      } catch (cause) {
        worker?.terminate();
        worker = undefined;
        status.value = "error";
        message.value = (english ? "Benchmark failed: " : "测试失败：") + cause.message;
      }
    }

    function stop() {
      worker?.terminate();
      worker = undefined;
      status.value = "stopped";
      message.value = english ? "Benchmark stopped" : "测试已停止";
    }

    function scale(item) {
      if (!item.medianMs) return 0;
      const maximum = Math.max(...Object.values(item.medianMs));
      const magnitude = 10 ** Math.floor(Math.log10(maximum || 0.001));
      return Math.max(1, Math.ceil(maximum / magnitude)) * magnitude;
    }

    function download() {
      const url = URL.createObjectURL(new Blob([JSON.stringify(results.value, null, 2) + "\n"], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "gradual-json-browser-benchmark.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return { methods, cases, status, message, results, running, measuredAt, start, stop, scale, download };
  },
};
