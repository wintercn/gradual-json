# gradual-json 版本记录

## 0.1.0 — 2026-10-10

- 从异步字符串块解析一个完整 JSON 值，输入结束并通过 EOF 校验后返回根值。
- 对象和数组在起始符号到达时挂载，字符串值逐步写回，数字、布尔值及 null 完整后写入。
- 支持可选宿主对象和属性名，通过读回已赋值的子容器继续构造，兼容 Vue 深层代理。
- 支持普通 interface 宿主、可选属性和预先初始化为 undefined 的属性。
- 提供 ESM JavaScript、TypeScript 类型声明、Node 和浏览器使用示例。
- 接入 JSONTestSuite、Test262 语法测试，验证分块边界与 Vue 协同。

