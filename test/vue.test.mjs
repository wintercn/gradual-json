import test from "node:test";
import assert from "node:assert/strict";
import { effect, isReactive, nextTick, reactive, stop, toRaw, watchEffect } from "vue";
import { parse } from "../src/parser.ts";

test("四种父子容器组合即时挂载，并通过读回的 Vue 代理继续填充", async () => {
  const host = reactive({});
  const runners = [];
  const objectValues = [];
  const arrayLengths = [];
  const arrayObjectValues = [];
  const nestedArrayLengths = [];
  const rootKeys = [];
  let root;
  let objectChild;
  let arrayChild;
  let arrayObject;
  let arrayArray;

  async function* source() {
    yield "{";
    root = host.root;
    assert.deepEqual(root, {});
    assert.equal(isReactive(root), true);
    assert.notEqual(root, toRaw(root));
    runners.push(effect(() => rootKeys.push(Object.keys(root))));

    for (const char of '"object":') yield char;
    yield "{";
    objectChild = root.object;
    assert.deepEqual(objectChild, {});
    assert.equal(isReactive(objectChild), true);
    assert.deepEqual(rootKeys, [[], ["object"]]);
    runners.push(effect(() => objectValues.push(objectChild.value)));
    for (const char of '"value":1') yield char;
    assert.equal(Object.hasOwn(objectChild, "value"), false);
    assert.deepEqual(objectValues, [undefined]);
    yield "}";
    assert.deepEqual(objectValues, [undefined, 1]);

    yield ",";
    for (const char of '"array":') yield char;
    yield "[";
    arrayChild = root.array;
    assert.deepEqual(arrayChild, []);
    assert.equal(isReactive(arrayChild), true);
    assert.deepEqual(rootKeys, [[], ["object"], ["object", "array"]]);
    runners.push(effect(() => arrayLengths.push(arrayChild.length)));

    yield "{";
    arrayObject = arrayChild[0];
    assert.deepEqual(arrayObject, {});
    assert.equal(isReactive(arrayObject), true);
    assert.deepEqual(arrayLengths, [0, 1]);
    runners.push(effect(() => arrayObjectValues.push(arrayObject.value)));
    for (const char of '"value":2') yield char;
    assert.equal(Object.hasOwn(arrayObject, "value"), false);
    yield "}";
    assert.deepEqual(arrayObjectValues, [undefined, 2]);

    yield ",";
    yield "[";
    arrayArray = arrayChild[1];
    assert.deepEqual(arrayArray, []);
    assert.equal(isReactive(arrayArray), true);
    assert.deepEqual(arrayLengths, [0, 1, 2]);
    runners.push(effect(() => nestedArrayLengths.push(arrayArray.length)));
    yield "3";
    assert.deepEqual(nestedArrayLengths, [0]);
    yield "]";
    assert.deepEqual(nestedArrayLengths, [0, 1]);
    yield "]";
    yield "}";
  }

  try {
    const result = await parse(source(), host);
    assert.equal(result, root);
    assert.equal(result, host.root);
    assert.equal(result.object, objectChild);
    assert.equal(result.array, arrayChild);
    assert.equal(result.array[0], arrayObject);
    assert.equal(result.array[1], arrayArray);
    assert.deepEqual(result, { object: { value: 1 }, array: [{ value: 2 }, [3]] });
  } finally {
    for (const runner of runners) stop(runner);
  }
});

test("数字、布尔和 null 完整前不写入宿主属性", async () => {
  const cases = [
    { prefix: "12.3e+2", end: " ", value: 1230 },
    { prefix: "-0", end: " ", value: -0 },
    { prefix: "tru", end: "e", value: true },
    { prefix: "fals", end: "e", value: false },
    { prefix: "nul", end: "l", value: null },
  ];

  for (const { prefix, end, value } of cases) {
    const host = reactive({ value: "previous" });
    async function* source() {
      for (const char of prefix) {
        yield char;
        assert.equal(host.value, "previous");
      }
      yield end;
      assert.equal(host.value, value);
    }
    assert.equal(await parse(source(), host, "value"), value);
  }
});

test("根字符串从空串开始逐字符写入，并触发 Vue effect", async () => {
  const host = reactive({ data: "previous" });
  const changes = [];
  const runner = effect(() => changes.push(host.data));

  async function* source() {
    yield '"';
    assert.equal(host.data, "");
    yield "中";
    assert.equal(host.data, "中");
    yield "\ud83d";
    assert.equal(host.data, "中\ud83d");
    yield "\ude00";
    assert.equal(host.data, "中😀");
    assert.deepEqual(changes, ["previous", "", "中", "中\ud83d", "中😀"]);
    yield '"';
    assert.deepEqual(changes, ["previous", "", "中", "中\ud83d", "中😀"]);
  }

  try {
    assert.equal(await parse(source(), host, "data"), "中😀");
  } finally {
    stop(runner);
  }
});

test("对象键完整后才确定属性名，字符串属性从开引号开始逐步响应", async () => {
  const host = reactive({});
  const changes = [];
  let runner;

  async function* source() {
    yield "{";
    runner = effect(() => changes.push(host.root.name));
    yield '"';
    for (const char of "na\\u006de") {
      yield char;
      assert.deepEqual(Object.keys(host.root), []);
      assert.deepEqual(changes, [undefined]);
    }
    yield '"';
    assert.deepEqual(Object.keys(host.root), []);
    yield ":";
    assert.deepEqual(Object.keys(host.root), []);
    yield '"';
    assert.deepEqual(host.root, { name: "" });
    yield "阿";
    assert.equal(host.root.name, "阿");
    yield "\ud83d";
    assert.equal(host.root.name, "阿\ud83d");
    yield "\ude00";
    assert.equal(host.root.name, "阿😀");
    yield '"';
    assert.deepEqual(changes, [undefined, "", "阿", "阿\ud83d", "阿😀"]);
    yield "}";
  }

  try {
    assert.deepEqual(await parse(source(), host), { name: "阿😀" });
  } finally {
    if (runner) stop(runner);
  }
});

test("数组字符串只创建一次槽位，空串与后续数组项持续触发 effect", async () => {
  const host = reactive({});
  const changes = [];
  const expected = [];
  let runner;

  async function* source() {
    yield "[";
    runner = effect(() => changes.push([...host.root]));
    for (const [index, value] of ["甲", "", "😀乙"].entries()) {
      if (index > 0) yield ",";
      yield '"';
      expected.push("");
      assert.deepEqual(host.root, expected);
      for (const char of value.split("")) {
        yield char;
        expected[index] += char;
        assert.deepEqual(host.root, expected);
        assert.deepEqual(changes.at(-1), expected);
      }
      const count = changes.length;
      yield '"';
      assert.deepEqual(host.root, expected);
      assert.equal(host.root.length, index + 1);
      assert.equal(changes.length, count);
    }
    yield "]";
  }

  try {
    const root = await parse(source(), host);
    assert.equal(root, host.root);
    assert.deepEqual(root, ["甲", "", "😀乙"]);
    assert.equal(changes.length, 8);
  } finally {
    if (runner) stop(runner);
  }
});

test("根值和空名称属性的空字符串均保留为空串", async () => {
  for (const [json, expected] of [['""', ""], ['{"":""}', { "": "" }]]) {
    const host = reactive({});
    async function* source() {
      for (const char of json.split("")) yield char;
    }
    assert.deepEqual(await parse(source(), host, ""), expected);
    assert.deepEqual(host[""], expected);
  }
});

test("全部简单转义仅在完整解码后更新字符串并通知 effect", async () => {
  const host = reactive({});
  const changes = [];
  const runner = effect(() => changes.push(host.root));
  const escapes = [['"', '"'], ["\\", "\\"], ["/", "/"], ["b", "\b"], ["f", "\f"], ["n", "\n"], ["r", "\r"], ["t", "\t"]];
  let expected = "";

  async function* source() {
    yield '"';
    assert.equal(host.root, "");
    for (const [input, decoded] of escapes) {
      const count = changes.length;
      yield "\\";
      assert.equal(host.root, expected);
      assert.equal(changes.length, count);
      yield input;
      expected += decoded;
      assert.equal(host.root, expected);
      assert.equal(changes.length, count + 1);
    }
    yield '"';
    assert.equal(changes.length, 10);
  }

  try {
    assert.equal(await parse(source(), host), expected);
  } finally {
    stop(runner);
  }
});

test("Unicode 四位完整后写入，高低代理分别可见并可组成补充平面字符", async () => {
  const host = reactive({});
  const changes = [];
  const runner = effect(() => changes.push(host.root));
  let expected = "x";

  async function* source() {
    yield '"';
    yield "x";
    for (const [digits, decoded] of [["0041", "A"], ["D83D", "\ud83d"], ["DE0A", "\ude0a"]]) {
      const count = changes.length;
      for (const char of "\\u" + digits.slice(0, 3)) {
        yield char;
        assert.equal(host.root, expected);
        assert.equal(changes.length, count);
      }
      yield digits[3];
      expected += decoded;
      assert.equal(host.root, expected);
      assert.equal(changes.length, count + 1);
    }
    yield '"';
  }

  try {
    assert.equal(await parse(source(), host), "xA😊");
    assert.deepEqual(changes, [undefined, "", "x", "xA", "xA\ud83d", "xA😊"]);
  } finally {
    stop(runner);
  }

  for (const [json, expectedValue] of [['"\\uD800"', "\ud800"], ['"\\uDC00"', "\udc00"]]) {
    async function* source() { for (const char of json.split("")) yield char; }
    assert.equal(await parse(source()), expectedValue);
  }
});

test("非法或未闭合字符串 reject 并保留已写部分，未完整对象键不产生属性", async () => {
  const cases = [
    { json: '"abc', expected: "abc" },
    { json: '"abc\\', expected: "abc" },
    { json: '"abc\\u12', expected: "abc" },
    { json: '"abc\\u0041', expected: "abcA" },
    { json: '"abc\\"', expected: 'abc"' },
    { json: '"abc\\x', expected: "abc" },
    { json: '"abc\\u12G', expected: "abc" },
    { json: '"abc\n', expected: "abc" },
    { json: '{"text":"中\\u12', expected: { text: "中" } },
    { json: '["","中\\x', expected: ["", "中"] },
    { json: '{"partial', expected: {} },
    { json: '{"pa\\x', expected: {} },
  ];

  for (const { json, expected } of cases) {
    const host = reactive({});
    const changes = [];
    const runner = effect(() => changes.push(JSON.stringify(host.root)));
    let closed = false;
    async function* source() {
      try { for (const char of json.split("")) yield char; }
      finally { closed = true; }
    }
    try {
      await assert.rejects(parse(source(), host), error => {
        assert(error instanceof SyntaxError);
        assert.equal(Object.hasOwn(error, "position"), false);
        assert.doesNotMatch(error.message, /offset/);
        return true;
      });
      assert.deepEqual(host.root, expected);
      assert.equal(changes.at(-1), JSON.stringify(expected));
      assert.equal(closed, true);
    } finally {
      stop(runner);
    }
  }
});

test("根容器已经闭合时，Promise 仍等待异步输入的 EOF", async () => {
  const host = reactive({});
  let signalWaiting;
  let finishSource;
  const waiting = new Promise(resolve => { signalWaiting = resolve; });
  const finish = new Promise(resolve => { finishSource = resolve; });
  let resolved = false;

  async function* source() {
    yield "{";
    yield "}";
    signalWaiting();
    await finish;
  }

  const parsing = parse(source(), host);
  const completion = parsing.then(value => { resolved = true; return value; });
  try {
    await waiting;
    assert.deepEqual(host.root, {});
    assert.equal(isReactive(host.root), true);
    assert.equal(resolved, false);
    const root = host.root;
    finishSource();
    assert.equal(await completion, root);
    assert.equal(resolved, true);
  } finally {
    finishSource();
    await completion;
  }
});

test("watchEffect 和 nextTick 可观察字符流的逐步更新", async () => {
  const host = reactive({});
  const snapshots = [];
  const stopWatching = watchEffect(() => snapshots.push(JSON.stringify(host.root)));

  async function* source() {
    yield "{";
    await nextTick();
    assert.deepEqual(snapshots, [undefined, "{}"]);

    for (const char of '"items":') yield char;
    yield "[";
    await nextTick();
    assert.deepEqual(snapshots, [undefined, "{}", '{"items":[]}']);

    yield "1";
    await nextTick();
    assert.equal(snapshots.length, 3);
    yield ",";
    await nextTick();
    assert.equal(snapshots.at(-1), '{"items":[1]}');

    for (const char of "true") yield char;
    await nextTick();
    assert.equal(snapshots.at(-1), '{"items":[1,true]}');
    assert.equal(snapshots.length, 5);
    yield "]";
    yield "}";
  }

  try {
    const result = await parse(source(), host);
    await nextTick();
    assert.equal(result, host.root);
    assert.deepEqual(result, { items: [1, true] });
    assert.equal(snapshots.length, 5);
  } finally {
    stopWatching();
  }
});
