import { setTimeout as wait } from "node:timers/promises";
import { parse } from "../src/parser.ts";

const host = {};
const fragments = [
  "{",
  '"title":"流式',
  '观察 🌊",',
  '"author":{',
  '"name":"小林","active":true},',
  '"items":[',
  "{",
  '"label":"第一',
  '项","price":12',
  ".5},",
  "{",
  '"label":"第二项","price":8,"tags":[',
  '"新到",',
  '"推荐"',
  "]},",
  '{"label":"第三项","price":0,"available":false}',
  '],"note":null',
  "}",
];

async function* characters() {
  for (const [index, fragment] of fragments.entries()) {
    for (const char of fragment.split("")) {
      await wait(10);
      yield char;
    }
    console.log(`\n片段 ${index + 1}：${JSON.stringify(fragment)}`);
    console.log("正在构造：", JSON.stringify(host.data));
    await wait(160);
  }
  console.log("\n字符来源结束，现在才进入 EOF 校验。");
}

console.log("逐字符输入；每个片段处理后，打印同一个宿主中的部分结果。");
console.log("留意空容器立即出现，title / label 随字符增长，price 完整后才写入。");
const root = await parse(characters(), host, "data");
console.log("\n解析完成：", JSON.stringify(root, null, 2));
console.log("返回的根值就是 host.data：", root === host.data);
