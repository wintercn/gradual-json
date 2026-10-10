import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { parse } from '../src/parser.ts';

const base = new URL('./fixtures/JSONTestSuite/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', base), 'utf8'));

for (const { file, blob } of manifest.files) {
  test(`JSONTestSuite: ${file}`, async (t) => {
    const bytes = readFileSync(new URL(file.split('/').map(encodeURIComponent).join('/'), base));
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), blob);
    let input;
    try {
      // Keep BOM characters. Invalid UTF-8 cannot be represented by this parser's character input.
      input = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch (error) {
      assert.ok(error instanceof TypeError);
      t.skip('Invalid UTF-8 byte input; this parser accepts characters, not bytes');
      return;
    }
    const name = basename(file);
    const optional = file.startsWith('test_parsing/') && name.startsWith('i_');
    let rejects = file.startsWith('test_parsing/') && name.startsWith('n_');
    let expected;
    if (file.startsWith('test_transform/')) {
      try { expected = JSON.parse(input); }
      catch (error) { assert.ok(error instanceof SyntaxError); rejects = true; }
    } else {
      assert.ok(/^[yni]_/.test(name), 'Unknown upstream expectation');
      if (name.startsWith('y_')) expected = JSON.parse(input);
    }

    for (const blockSize of [1, 4096]) {
      await t.test(`chunks-${blockSize}`, async (t) => {
        async function* chunks() {
          for (let i = 0; i < input.length; i += blockSize) yield input.slice(i, i + blockSize);
        }
        if (optional) {
          let value;
          try { value = await parse(chunks()); }
          catch (error) {
            assert.ok(error instanceof SyntaxError);
            t.diagnostic('Upstream implementation-defined input: rejected');
            return;
          }
          assert.notEqual(value, undefined);
          t.diagnostic('Upstream implementation-defined input: accepted');
        } else if (rejects) {
          await assert.rejects(() => parse(chunks()), SyntaxError);
        } else {
          assert.deepEqual(await parse(chunks()), expected);
        }
      });
    }
  });
}
