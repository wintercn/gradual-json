# 测试

使用支持原生 TypeScript 类型擦除的 Node.js；本项目当前在 Node.js 24.21.0 上验证。

```sh
npm ci
npm test
npm run typecheck
```

`npm test` 使用 Node 内置测试运行器，直接测试 `src/parser.ts`。测试数据保存在项目中，运行时无需联网。

`package.test.mjs` 另外构建 ESM 和声明文件，在临时目录打包并离线安装压缩包，验证发布文件范围、包根导入、标准 Node Readable、真实 Vue 代理以及 Bundler/NodeNext 两种模块解析方式下的调用方类型。独立 ESM 沙箱不提供 Node 专有全局，验证解析器只使用标准 JavaScript 能力；它不等同于完整浏览器版本矩阵。元信息待定时，仅临时副本使用验证包名及 `0.0.0`，不代表实际发布身份已验证。

## Vue 协同

`vue.test.mjs` 使用真实的 Vue 3.5.22，覆盖四种对象/数组父子组合的即时挂载、代理身份、深层赋值和数组追加的 `effect` 通知。字符串值从开引号时的空串开始，随普通字符和完整转义逐步写回；测试包含根字符串、对象属性、数组槽位、空串、多数组项、全部简单转义、Unicode 和高低代理，以及非法或未闭合字符串保留已写部分。对象键闭合前不产生部分属性。数字、布尔和 `null` 仍完整后才写入。另有输入结束后才完成 Promise，以及 `watchEffect` / `nextTick` 的逐步更新断言。这些是根据本项目接口编写的单元测试。

## 上游套组

| 来源 | 接入内容 | 版本与许可 |
| --- | --- | --- |
| [nst/JSONTestSuite](https://github.com/nst/JSONTestSuite) | 318 个语法文件及 22 个值转换文件，共 340 个原始文件 | 固定提交 `1ef36fa01286573e846ac449e8683f8833c5b26a`；MIT |
| [TC39 Test262 JSON.parse](https://github.com/tc39/test262/tree/main/test/built-ins/JSON/parse) | 31 个 `15.12.1.1*` 词法语法文件，加 `invalid-whitespace.js`、`text-negative-zero.js`，共 33 个原始文件 | 每个文件固定到 Git blob SHA；BSD |

上游文件原样保存在 `fixtures/`，许可文件随套组保留。两个 `manifest.json` 记录文件路径和 Git blob SHA，测试运行时核验内容，防止数据被意外修改。

### JSONTestSuite

`jsontestsuite.test.mjs` 保留上游分类：95 个 `y_` 文件必须接受，188 个 `n_` 文件必须拒绝，35 个 `i_` 文件允许接受或拒绝，并报告实际选择。22 个 `test_transform` 文件以 JavaScript 的 `JSON.parse` 作为值转换参考。

文件先按严格 UTF-8 解码，保留 BOM 字符。312 个可解码文件进入 JSON 语法与值检查。另外 28 个文件不能按 UTF-8 解码，包含 12 个 `n_`、13 个 `i_` 和 3 个值转换文件；这些文件在异步输入迭代器中解码，断言 `parse` 以 `TypeError` 拒绝，验证输入解码错误的传递。这 28 项是输入适配检查，不是 JSON 语法检查。全部原始文件均执行断言，没有跳过。

### Test262

`test262.test.mjs` 执行保留的上游测试文件，核验它们对原生 `JSON.parse` 的断言，同时收集字符串输入与接受/拒绝要求，然后对本解析器运行同样的输入。文件中的非字符串参数强制转换不属于字符串块接口，未收集为解析器用例。这里接入的是 JSON 语法子集，并非整个 ECMAScript `JSON.parse` API 测试。

两个外部套组的适用输入均分别按单个 UTF-16 码元和长度为 4096 码元的字符串块送入异步迭代器。Vue 测试直接断言高、低代理分开到达时的字符串更新。`chunks.test.mjs` 另外覆盖每个两块切分位置、不同块长、空块、Unicode 转义跨块、块内连续普通字符整段写回的 Vue 更新及错误时关闭输入源。这些分块测试根据本项目输入接口编写。成功值通过 `deepEqual` 核对，保留负零与数值溢出等 JavaScript 数值语义。
