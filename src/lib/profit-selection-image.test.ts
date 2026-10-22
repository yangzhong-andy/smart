import assert from "node:assert/strict";
import test from "node:test";
import { parseSelectionImage } from "./profit-selection-image";

test("accepts a small PNG image with matching binary signature", () => {
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const result = parseSelectionImage(`data:image/png;base64,${bytes.toString("base64")}`);
  assert.equal(result.mimeType, "image/png");
  assert.deepEqual(result.data, bytes);
});

test("rejects unsupported, mismatched and oversized image data", () => {
  assert.throws(() => parseSelectionImage("data:image/svg+xml;base64,PHN2Zz4="), /仅支持/);
  assert.throws(() => parseSelectionImage("data:image/png;base64,SGVsbG8="), /不匹配/);
  assert.throws(() => parseSelectionImage(`data:image/png;base64,${Buffer.alloc(300 * 1024 + 1).toString("base64")}`), /不得超过/);
});
