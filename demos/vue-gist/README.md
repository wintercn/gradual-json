# Vue 流式 JSON 示例

`index.html` 是完整可运行示例，包含 Vue 模板、样式、模拟异步输入、解析、停止与重播。未收到的字段留空；界面直接读取 `reactive` 宿主，未在解析完成后再复制结果。

## 运行

下载 `index.html`，在所在目录运行：

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

打开 <http://127.0.0.1:8080/>，点击“开始接收”。默认逐字符输入；可以选择 8 / 24 字符块、不同速度、Unicode 转义和非法 JSON。

页面从 jsDelivr 加载固定版本的 Vue 3.5.22 和 gradual-json 0.1.1，需要联网，无需安装依赖或构建。项目中的 Vue 代码也可以使用 npm 导入：

```js
import { computed, reactive } from "vue";
import { parse } from "gradual-json";
```

## 观察

- 标题、描述和作者名称从空字符串开始逐步增长。
- `author` 和数组项读到 `{` 时创建，后续字段直接写入 Vue 深层代理。
- 数组项先出现，名称和说明继续增长；标签也随输入逐步出现。
- 价格完整读出后写入，`computed` 自动更新已读金额。第二项价格 `0` 和 `available: false` 均正常显示。
- 停止后保留已收到的部分；重新演示会清空旧结果。
- Unicode 转义可能跨输入块；解析器完整解码后才追加对应字符。
- 非法 JSON 在结尾报错，此前已写入的内容保留。部分结果不代表 JSON 已通过完整校验。

完整示例的 `chunks()` 是本地异步生成器，用于让分块到达过程可见。用于真实响应时，可将输入来源替换成解码后的异步字符串块，保持 `parse(chunks, host, "data")` 这一步。

## Vue、HTTP、SSE 与 Proxy 接入

`scenarios.html` 是另外一个完整可运行页面。在同一目录运行上述静态服务，打开 <http://127.0.0.1:8080/scenarios.html>，切换四个场景并点击“运行此例”。接入代码、适配代码、模板、样式和演示逻辑都在这个文件中。

HTTP 演示在浏览器内模拟延时 `Response`，使用真实 `ReadableStream` 和 `TextDecoderStream`，并将中文的 UTF-8 字节拆开。真实接入把响应替换成 `fetch` 的返回值即可。SSE 演示模拟 `message` 与 `end` 事件；这个例子约定每个 `message.data` 是同一份 JSON 的文本片段，服务端用自定义 `end` 事件结束输入。真实接入将事件源替换成 `EventSource`。

Proxy 示例通过 `get` 代理深层对象、`set` 记录命令，保存每次写入当时的路径和值。命令按顺序赋值，可重放出相同对象；命令由应用生成。

项目：<https://github.com/wintercn/gradual-json> · 首页：<https://wintercn.github.io/gradual-json/> · MIT
