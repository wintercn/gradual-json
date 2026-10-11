import { createApp, onMounted, ref, shallowRef, watch } from "./assets/vue.js";
import { parse } from "./assets/parser.js";
import scenarios from "./scenarios.js?v=3";
import ObjectInspector from "./object-inspector.js?v=2";
import performanceBenchmark from "./performance.js?v=2";

const english = document.documentElement.lang === "en";
const languageSwitch = document.querySelector(".language-switch");
const languageHref = languageSwitch.getAttribute("href");
languageSwitch.href = languageHref + location.hash;
window.addEventListener("hashchange", () => { languageSwitch.href = languageHref + location.hash; });

const copyInstall = document.querySelector(".copy-install");
copyInstall.addEventListener("click", async () => {
  const feedback = document.querySelector(".copy-feedback");
  try {
    await navigator.clipboard.writeText("npm install gradual-json");
    feedback.textContent = english ? "Copied" : "已复制";
  } catch {
    feedback.textContent = english ? "Select and copy the install command" : "请选择并复制安装命令";
  }
  setTimeout(() => { feedback.textContent = ""; }, 2200);
});

createApp({
  setup() {
    const parts = english ? [
      '{',
      '"title":"Progressive JSON',
      ' construction","description":"Input arrives in chunks. ',
      'Strings grow as more text arrives, ',
      'and objects appear one by one in the array.","items":[',
      '{"name":"Receive async ',
      'string chunks","count":3},',
      '{"name":"Read the object ',
      'while it is being built","count":2},',
      '{"name":"Return when the JSON ',
      'is complete","count":1}',
      ']}',
    ] : [
      '{',
      '"title":"渐进式 JSON',
      ' 对象构造","description":"输入按顺序到达，',
      '字符串持续追加，',
      '数组中的对象也逐项出现。","items":[',
      '{"name":"接收异步',
      '字符串块","count":3},',
      '{"name":"读取正在',
      '构造的对象","count":2},',
      '{"name":"等待完整 JSON',
      ' 后返回","count":1}',
      ']}',
    ];
    const step = ref(0);
    const input = ref();
    watch(step, () => {
      input.value.scrollTop = input.value.scrollHeight;
    }, { flush: "post" });
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
          if (id !== runId) throw new DOMException(english ? "Demo restarted" : "演示已重新开始", "AbortError");
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
    return { parts, step, input, constructed, revision, complete, playing, waiting, error, advance, togglePlay, start };
  },
}).component("ObjectInspector", ObjectInspector).mount("#construction-demo");

createApp(scenarios).component("ObjectInspector", ObjectInspector).mount("#scenarios-demo");
createApp(performanceBenchmark).mount("#benchmark-demo");
