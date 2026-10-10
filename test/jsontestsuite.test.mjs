import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { parse } from '../src/parser.ts';

const base = new URL('./fixtures/JSONTestSuite/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', base), 'utf8'));

// These raw byte fixtures exercise encoding behavior outside the string-input API.
const byteFixtures = new Set([
  'test_parsing/i_string_UTF-16LE_with_BOM.json',
  'test_parsing/i_string_UTF-8_invalid_sequence.json',
  'test_parsing/i_string_UTF8_surrogate_U+D800.json',
  'test_parsing/i_string_invalid_utf-8.json',
  'test_parsing/i_string_iso_latin_1.json',
  'test_parsing/i_string_lone_utf8_continuation_byte.json',
  'test_parsing/i_string_not_in_unicode_range.json',
  'test_parsing/i_string_overlong_sequence_2_bytes.json',
  'test_parsing/i_string_overlong_sequence_6_bytes.json',
  'test_parsing/i_string_overlong_sequence_6_bytes_null.json',
  'test_parsing/i_string_truncated-utf-8.json',
  'test_parsing/i_string_utf16BE_no_BOM.json',
  'test_parsing/i_string_utf16LE_no_BOM.json',
  'test_parsing/n_array_a_invalid_utf8.json',
  'test_parsing/n_array_invalid_utf8.json',
  'test_parsing/n_number_invalid-utf-8-in-bigger-int.json',
  'test_parsing/n_number_invalid-utf-8-in-exponent.json',
  'test_parsing/n_number_invalid-utf-8-in-int.json',
  'test_parsing/n_number_real_with_invalid_utf8_after_e.json',
  'test_parsing/n_object_lone_continuation_byte_in_key_and_trailing_comma.json',
  'test_parsing/n_string_invalid-utf-8-in-escape.json',
  'test_parsing/n_string_invalid_utf8_after_escape.json',
  'test_parsing/n_structure_incomplete_UTF8_BOM.json',
  'test_parsing/n_structure_lone-invalid-utf-8.json',
  'test_parsing/n_structure_single_eacute.json',
  'test_transform/string_1_invalid_codepoint.json',
  'test_transform/string_2_invalid_codepoints.json',
  'test_transform/string_3_invalid_codepoints.json',
]);

for (const { file, blob } of manifest.files) {
  const bytes = readFileSync(new URL(file.split('/').map(encodeURIComponent).join('/'), base));
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), blob, file);
  if (byteFixtures.has(file)) continue;

  test(`JSONTestSuite: ${file}`, async (t) => {
    // Preserve BOM characters; an unexpected decoding error fails this test.
    const input = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
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
