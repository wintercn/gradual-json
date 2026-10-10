import { Readable } from "node:stream";
import { setTimeout as wait } from "node:timers/promises";
import { parse } from "../src/parser.ts";

const host = {};
const chinese = Buffer.from("流");
const emoji = Buffer.from("🌊");
const buffers = [
  Buffer.from('{"title":"'),
  chinese.subarray(0, 1),
  chinese.subarray(1),
  Buffer.from("式观察 "),
  emoji.subarray(0, 2),
  emoji.subarray(2),
  Buffer.from('","author":{'),
  Buffer.from('"name":"小'),
  Buffer.from('林","active":true},"items":['),
  Buffer.from('{"label":"第一项","price":12'),
  Buffer.from(".5},"),
  Buffer.from('{"label":"第二项","price":8,"tags":['),
  Buffer.from('"新到","推荐"]},'),
  Buffer.from('{"label":"第三项","price":0,"available":false}],"note":null}'),
];

async function* byteChunks() {
  for (const [index, buffer] of buffers.entries()) {
    await wait(200);
    console.log(`\n发送 Buffer ${index + 1}：${buffer.length} 字节`);
    if (buffer.length <= 3) console.log("字节：", buffer.toString("hex"));
    yield buffer;
  }
}

const readable = Readable.from(byteChunks(), { objectMode: false });
readable.setEncoding("utf8");

async function* decodedChunks() {
  let index = 0;
  for await (const chunk of readable) {
    yield chunk;
    console.log(`解码块 ${++index}：${JSON.stringify(chunk)}`);
    console.log("正在构造：", JSON.stringify(host.data));
  }
}

console.log("真实 Node Readable：Buffer → setEncoding('utf8') → 字符串块 → parse。");
console.log("“流”的 3 个字节拆为 1 + 2，“🌊”的 4 个字节拆为 2 + 2。");
console.log("解码器保留跨块的 UTF-8 字节；字符串块直接送入解析器。");
console.log("字符串随已解码字符增长，数字、布尔和 null 完整后才写入。");
const root = await parse(decodedChunks(), host, "data");
console.log("\n解析完成：", JSON.stringify(root, null, 2));
console.log("返回的根值就是 host.data：", root === host.data);
