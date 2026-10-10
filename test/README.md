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
| [nst/JSONTestSuite](https://github.com/nst/JSONTestSuite) | 保留 340 个原始文件，使用其中适用于字符串接口的 312 个 | 固定提交 `1ef36fa01286573e846ac449e8683f8833c5b26a`；MIT |
| [TC39 Test262 JSON.parse](https://github.com/tc39/test262/tree/main/test/built-ins/JSON/parse) | 31 个 `15.12.1.1*` 词法语法文件，加 `invalid-whitespace.js`、`text-negative-zero.js`，共 33 个原始文件 | 每个文件固定到 Git blob SHA；BSD |

上游文件原样保存在 `fixtures/`，许可文件随套组保留。两个 `manifest.json` 记录文件路径和 Git blob SHA，测试运行时核验内容，防止数据被意外修改。

### JSONTestSuite

`parse` 接收已解码的 JavaScript 字符串块，不接收字节，也不校验字符编码。JSONTestSuite 中 312 个文件适用于这一接口：95 个 `y_` 文件必须接受，176 个 `n_` 文件必须拒绝，22 个 `i_` 文件允许接受或拒绝，并报告实际选择；19 个 `test_transform` 文件以 JavaScript 的 `JSON.parse` 作为值转换参考。

另有 28 个原始字节文件不能按 UTF-8 解码，包含 12 个 `n_`、13 个 `i_` 和 3 个值转换文件。这些文件保留并核验原始摘要，但不注册为解析器测试，不计入通过、失败或跳过数量。[完整名单](jsontestsuite.test.mjs)在 `byteFixtures` 中逐项固定；不会根据测试失败或解码失败动态排除文件，也不会把坏字节替换后冒充原始文件的解析测试。

适用文件在测试中解码为字符串，保留 BOM 字符；任何意外解码错误都会导致测试失败。字符串中的孤立代理码元及相应 `\uXXXX` 转义仍在解析器测试范围内。两个上游套组共使用 345 个适用文件（312 + 33）；保留的原始文件总数为 373。

### Test262

`test262.test.mjs` 执行保留的上游测试文件，核验它们对原生 `JSON.parse` 的断言，同时收集字符串输入与接受/拒绝要求，然后对本解析器运行同样的输入。文件中的非字符串参数强制转换不属于字符串块接口，未收集为解析器用例。这里接入的是 JSON 语法子集，并非整个 ECMAScript `JSON.parse` API 测试。

两个外部套组的适用输入均分别按单个 UTF-16 码元和长度为 4096 码元的字符串块送入异步迭代器。Vue 测试直接断言高、低代理分开到达时的字符串更新。`chunks.test.mjs` 另外覆盖每个两块切分位置、不同块长、空块、Unicode 转义跨块、块内连续普通字符整段写回的 Vue 更新及错误时关闭输入源。这些分块测试根据本项目输入接口编写。成功值通过 `deepEqual` 核对，保留负零与数值溢出等 JavaScript 数值语义。
