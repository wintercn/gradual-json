# gradual-json

从异步字符串块构造 JSON 值，支持将结果逐步写入已有对象或响应式代理。运行时零依赖，提供 ESM JavaScript 和 TypeScript 声明。

项目仓库：[wintercn/gradual-json](https://github.com/wintercn/gradual-json)。采用 [MIT 许可证](LICENSE)。

## 安装与基本用法

```sh
npm install gradual-json
```

```ts
import { parse } from "gradual-json";

async function* chunks() {
  yield '{"title":"流式';
  yield ' JSON","count":12';
  yield '}';
}

const result = await parse(chunks());
// { title: "流式 JSON", count: 12 }
```

来源每次产出一个字符串块，可以产出空块、单字符块或长块。块边界可以位于字符串、转义、数字和 UTF-16 代理对内部。解析器按索引逐个读取 UTF-16 单元，保留跨块的语法状态。

输入先由调用方解码为字符串。`Buffer` 和 `Uint8Array` 需要经 Node 字符串解码器或 `TextDecoderStream` 解码，保留跨块的 UTF-8 字节。

## API

```ts
type Character = string;
type ChunkSource = AsyncIterable<string>;
type JsonValue = string | number | boolean | null | JsonValue[] | {
  [key: string]: JsonValue;
};

function parse(
  chunks: ChunkSource,
  host?: object,
  property?: string,
): Promise<JsonValue>;
```

包根入口导出 `parse` 及 `Character`、`ChunkSource`、`JsonValue` 类型。`Character` 表示状态函数消费的一个 UTF-16 单元；调用方通常使用 `ChunkSource`。

`chunks` 必须产出字符串。`host` 是普通对象或其代理，所选属性必须可写，默认是一个新对象。`property` 是宿主上接收根值的属性名，默认 `"root"`，空字符串也是有效属性名。宿主不是待追加元素的数组。

来源结束后，解析器校验 EOF；只有完整的单个 JSON 值才会成功返回。根对象或数组返回的是宿主中正在构造的引用；根字符串、数字、布尔值和 null 返回对应的值。输入即使已经闭合，Promise 也会继续等待来源结束，以检查尾部内容。

## 逐步构造

```ts
import { parse, type JsonValue } from "gradual-json";

interface Host {
  data?: JsonValue;
  loading: boolean;
}

const host: Host = { loading: true };
const parsing = parse(chunks(), host, "data");
// 来源推进时，host.data 持续被填充。
const result = await parsing;
host.loading = false;
console.log(result === host.data); // true
```

| 输入阶段 | 写入行为 |
| --- | --- |
| 读到 `{` 或 `[` | 立即创建并挂载空容器，然后读回宿主中的容器引用入栈 |
| 字符串值的开引号 | 写入空字符串 |
| 字符串值的普通字符 | 每个 UTF-16 单元追加后写回 |
| 简单转义或 `\uXXXX` | 完整解码后写回，不暴露转义的中间拼写 |
| 对象键 | 完整读出后才确定属性名 |
| 数字 | 遇到合法分隔符或 EOF 后转换为 number 并写入 |
| true、false、null | 拼写完整后写入 |

同一个输入块内部同步处理，逐单元赋值；调用方的异步观察器和界面调度器可能合并同一块中的更新。

## Node Readable

```ts
import { createReadStream } from "node:fs";
import { parse } from "gradual-json";

const stream = createReadStream("data.json", { encoding: "utf8" });
const result = await parse(stream);
```

Node 的解码器保留跨块的 UTF-8 字节。设置编码后的 Readable 可以直接作为字符串块来源。

## HTTP 响应

```ts
import { parse } from "gradual-json";

const response = await fetch("/data.json");
if (!response.ok || !response.body) throw new Error("无法读取 JSON 响应");

const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
async function* chunks() {
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

const result = await parse(chunks());
```

## Vue

```ts
import { reactive, watchEffect } from "vue";
import { parse } from "gradual-json";

interface Data {
  title: string;
  count: number;
}

const host = reactive<{ data?: Data }>({});
const stopWatching = watchEffect(() => console.log(host.data?.title));

try {
  await parse(chunks(), host, "data");
} finally {
  stopWatching();
}
```

解析器先向父容器赋值，再读回已赋值的子容器入栈，因此继续修改的是 Vue 返回的深层代理。Vue 是应用自行使用的依赖，解析器不依赖 Vue。

Vue 宿主按预期的数据结构声明类型。当前验证环境中，将递归的 `JsonValue` 直接用作深层 `reactive` 属性类型并读取它，会触发 TypeScript 的类型展开深度限制。

自定义 Proxy 也可以在 `set` 中观察写入；`get` 读回子容器时需要返回其代理，才能持续观察深层修改。

## 错误与语义边界

非法 JSON、未完成的输入或一个根值后的额外内容会使 Promise 以 `SyntaxError` 拒绝。错误不包含偏移、行或列。来源抛出的异常直接传播。解析出错时会关闭正在迭代的来源；此前写入宿主的部分结果会保留。

如需取消解析，由调用方取消来源，例如中止 fetch 请求，或在自定义异步生成器中抛出取消异常。解析器等待来源的下一项时，取消也需要由来源响应。

每次调用消费一个 JSON 文档。完整结果保留在内存中；当前 API 不提供路径过滤或多文档序列处理。

数字使用 JavaScript `Number` 语义，包含负零、精度舍入和数值溢出；不提供大整数转换。重复键采用后续值。所有属性通过直接赋值写入，因此 `__proto__` 遵循 JavaScript 赋值语义，其结果与 `JSON.parse` 的自身属性构造不完全等价。

## 开发与验证

当前本地验证环境为 Node.js 24.21.0、TypeScript 5.4.5、Vue 3.5.22。构建产物目标为 ES2022，使用 ESM 和标准异步迭代器。本版验证了 Node.js 24 及本地浏览器演示；尚未验证其他 Node.js 和浏览器版本。开发测试直接执行 TS 源码，需要支持原生类型擦除的 Node。

```sh
npm ci
npm run typecheck
npm run build
npm test
npm run test:package
npm pack --dry-run
```

`npm test` 包含上游语法测试、分块边界、Vue 协同和安装包验证。`test:package` 单独运行打包、离线安装、包根导入、消费者类型检查、Vue 和标准 JavaScript 环境的 ESM 验证。安装验证使用实际包名和版本，在独立临时项目中安装生成的压缩包。

源码目录中，测试数据的来源及保留的许可证见 [测试说明](test/README.md)，三个流式演示见 [演示说明](demos/README.md)。冻结的 [早期设计文档](docs/STATE_MACHINE_DESIGN.md) 记录历史方案；现行公开接口以本 README 和生成的类型声明为准。

发布文件限定为 `dist/`、README、版本记录和 LICENSE。GitHub Actions 在推送及拉取请求中检查类型、上游测试、Vue 协同和安装包。
