import test from "node:test";
import assert from "node:assert/strict";
import { effect, isReactive, reactive, stop } from "vue";
import { parse } from "../src/parser.ts";

test("完整 JSON 在每个两块切分位置、不同块长及空块下产生相同结果", async () => {
  const inputs = [
    '{"name":"A中🌊\\n\\u4e2d","items":[{},[],true,false,null,-0,12.34e-5],"tail":""}',
    '{"中文🌊\\n\\u0041":"第一段\\\"第二段","":"尾部"}',
    '"中🌊\\uD800\\uDC00"',
    "-0",
    "12.34e-5",
    "true",
    "false",
    "null",
  ];
  for (const input of inputs) {
    const expected = JSON.parse(input);
    for (let split = 0; split <= input.length; split++) {
      async function* chunks() {
        yield "";
        yield input.slice(0, split);
        yield "";
        yield input.slice(split);
        yield "";
      }
      assert.deepEqual(await parse(chunks()), expected, `split ${split} in ${input}`);
    }
    for (const blockSize of [1, 2, 3, 7, 64]) {
      async function* chunks() {
        for (let i = 0; i < input.length; i += blockSize) yield input.slice(i, i + blockSize);
      }
      assert.deepEqual(await parse(chunks()), expected, `block size ${blockSize} in ${input}`);
    }
  }
});

test("字符串块内连续普通字符整段更新 Vue 代理，Unicode 转义和数字可以跨块", async () => {
  const host = reactive({});
  const changes = [];
  const runner = effect(() => {
    const value = host.root?.nested?.text;
    if (typeof value === "string") changes.push(value);
  });
  let root;
  let nested;
  async function* chunks() {
    yield '{"nested":{"text":"中😀';
    root = host.root;
    nested = root.nested;
    assert.equal(isReactive(root), true);
    assert.equal(isReactive(nested), true);
    assert.deepEqual(changes, ["", "中😀"]);
    yield "\\u0";
    assert.equal(nested.text, "中😀");
    yield '041","number":12.3e';
    assert.equal(nested.text, "中😀A");
    assert.equal(Object.hasOwn(nested, "number"), false);
    yield "+2}}";
    assert.equal(nested.number, 1230);
  }
  try {
    const result = await parse(chunks(), host);
    assert.equal(result, root);
    assert.equal(result.nested, nested);
    assert.deepEqual(result, { nested: { text: "中😀A", number: 1230 } });
    assert.deepEqual(changes, ["", "中😀", "中😀A"]);
  } finally {
    stop(runner);
  }
});

test("同一块内的根字符串和数组字符串按普通内容及完整转义逐段写回", async () => {
  const body = '中文😀\\n后半\\"结束\\u0041尾段';
  const value = '中文😀\n后半"结束A尾段';
  for (const array of [false, true]) {
    const host = reactive({});
    const changes = [];
    const runner = effect(() => {
      const text = array ? host.root?.[0] : host.root;
      if (typeof text === "string") changes.push(text);
    });
    async function* chunks() {
      yield array ? '["' + body + '","另一个"]' : '"' + body + '"';
    }
    try {
      assert.deepEqual(await parse(chunks(), host), array ? [value, "另一个"] : value);
      assert.deepEqual(changes, [
        "", "中文😀", "中文😀\n", "中文😀\n后半", '中文😀\n后半"',
        '中文😀\n后半"结束', '中文😀\n后半"结束A', value,
      ]);
    } finally {
      stop(runner);
    }
  }
});

test("整段匹配不会跨过键或值中的控制字符，错误后保留合法前缀", async () => {
  for (let code = 0; code < 0x20; code++) {
    const control = String.fromCharCode(code);
    for (const [input, expected] of [
      ['"中文' + control + '不应写入"', "中文"],
      ['{"中文' + control + '不应写入":1}', {}],
    ]) {
      const host = {};
      let resumed = false;
      async function* chunks() {
        yield input;
        resumed = true;
      }
      await assert.rejects(parse(chunks(), host), SyntaxError);
      assert.deepEqual(host.root, expected);
      assert.equal(resumed, false);
    }
  }
});

test("块内及跨块的错误立即拒绝并关闭输入源，未完成的块流在 EOF 拒绝", async () => {
  const cases = [
    ["", ""],
    ['{"text":"x\\u', "12"],
    ["[12", "e+"],
    ["{}unexpected"],
    ["{}", "x"],
    ['{"a":', "01}"],
    ["[1", ",]"],
    ['{"a":1,', "}"],
  ];
  for (const blocks of cases) {
    let closed = false;
    async function* chunks() {
      try { for (const block of blocks) yield block; }
      finally { closed = true; }
    }
    await assert.rejects(parse(chunks()), SyntaxError);
    assert.equal(closed, true);
  }
  let resumed = false;
  let closed = false;
  async function* chunks() {
    try {
      yield "{}unexpected";
      resumed = true;
      yield "{}";
    } finally { closed = true; }
  }
  await assert.rejects(parse(chunks()), SyntaxError);
  assert.equal(resumed, false);
  assert.equal(closed, true);
});
