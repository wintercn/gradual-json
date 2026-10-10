import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { parse } from '../src/parser.ts';

const base = new URL('./fixtures/test262/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', base), 'utf8'));

for (const { file, blob } of manifest.files) {
  test(`Test262: ${file}`, async (t) => {
    const source = readFileSync(new URL(file, base));
    assert.equal(createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex'), blob);
    const cases = [];
    let expectsRejection = false;
    const context = vm.createContext({
      SyntaxError,
      JSON: {
        parse(input) {
          // Capture the upstream string inputs; ECMAScript argument coercion is outside this API.
          if (typeof input === 'string') cases.push({ input, accepts: !expectsRejection });
          return JSON.parse(input);
        },
      },
      assert: {
        sameValue(actual, expected, message) { assert.strictEqual(actual, expected, message); },
        throws(expected, callback, message) {
          expectsRejection = true;
          try { assert.throws(callback, expected, message); }
          finally { expectsRejection = false; }
        },
      },
    });
    vm.runInContext(source.toString('utf8'), context, { filename: file, timeout: 1000 });
    assert.ok(cases.length > 0, 'Upstream file must contain a JSON string input');

    for (const [index, { input, accepts }] of cases.entries()) {
      for (const blockSize of [1, 4096]) {
        await t.test(`${index + 1}: ${accepts ? 'accept' : 'reject'} / chunks-${blockSize}`, async () => {
          async function* chunks() {
            for (let i = 0; i < input.length; i += blockSize) yield input.slice(i, i + blockSize);
          }
          if (accepts) assert.deepEqual(await parse(chunks()), JSON.parse(input));
          else await assert.rejects(() => parse(chunks()), SyntaxError);
        });
      }
    }
  });
}
