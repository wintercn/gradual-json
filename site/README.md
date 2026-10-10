# GitHub Pages 首页

页面源文件在本目录，部署到 https://wintercn.github.io/gradual-json/ 。

```sh
npm ci
npm ci --prefix bench
npm run site:build
python3 -m http.server 4174 --bind 127.0.0.1 --directory .pages-dist
```

打开 http://127.0.0.1:4174/ 查看本机预览。

`site:build` 构建项目解析器，并将静态页面、解析器产物、Vue 和 `bench` 中两款竞品的浏览器 ESM 版本复制到 `.pages-dist/`，保留各自许可。全部模块从本站加载，不依赖外部 CDN。生成目录不会提交到 Git，也不会加入 npm 发布文件。

首屏展示核心能力：渐进式构造 JSON 对象。异步生成器分十二块输入，实际调用项目的 `parse` 写入普通宿主对象，展示空对象创建、字符串追加、数组创建及数组项写入。展示内容在每块被消费后从同一个对象读取，支持默认循环播放、暂停、逐块查看与重播。输入与对象区域固定高度，在内部滚动。

页面内容依次为构造过程、场景适配、测试与性能、完整 Vue 示例、使用方式与项目信息。

性能图由访问者点击“开始本机测试”后实际生成，不包含预置耗时。`performance.js` 管理图表、停止、重测与原始数据下载；`performance-worker.js` 在独立浏览器 Worker 中运行当前解析器、jsonriver 1.1.1 和启用 partial 选项的 @streamparser/json 0.0.26。三组 ASCII 输入与 Node 基准一致，每块 4096 个 UTF-16 码元。各库先校验完整结果、预热 3 次，再轮换顺序测量 11 次取中位数。每组图表从零起算，按当前测量动态设置独立刻度。库加载、数据生成、结果校验与页面更新不计入解析耗时。下载文件包含浏览器信息、版本、测量时间和全部原始样本；测量结果不会上传。

第二部分展示 Vue、HTTP、SSE 和 Proxy 转命令四个例子，提供接入代码、适配代码与可运行效果。HTTP 演示使用浏览器内构造的延时 `Response`，保留真实 `ReadableStream` → `TextDecoderStream` → `parse` 链路，并刻意拆开中文的 UTF-8 字节。SSE 演示模拟 `message` 和 `end` 事件，约定 `message.data` 是同一份 JSON 的文本片段，`end` 表示来源结束；真实接入使用 `EventSource`。它们均明确标注为模拟输入。

Proxy 示例在应用层通过 `get` 代理子容器、`set` 记录路径和值。每条命令保留写入当时的值，避免空容器命令随后续修改变化；命令可以按顺序重放。相关页面代码集中在 `scenarios.js`，没有修改解析器接口。

Vue 演示用本地异步生成器模拟输入块到达，实际调用项目的 `parse`，将根值写入 Vue 深层响应式宿主。支持字符或块输入、不同速度、跨块转义、错误输入、停止与重播。演示不模拟网络性能，也不提供服务端 HTTP 流。

首页并排展示核心脚本、Vue 模板与运行效果。书单示例包含嵌套作者、数组项、逐步增长的名称和说明，以及按已读价格自动更新的 `computed` 合计。未收到的字段保持空白，输入 JSON 与对象结构可以展开查看。

[完整可运行示例与运行说明](https://gist.github.com/wintercn/b4c381987f7d70d849a62d471486935f) 已发布到 Gist，本地副本在 `demos/vue-gist/`。独立示例使用固定版本的 CDN 模块；首页仍从本站加载解析器和 Vue。

`.github/workflows/pages.yml` 在 `main` 上相关文件变更时重新构建并部署，也可以手动运行。所有本地资源使用相对路径，支持 GitHub Pages 项目子路径。
