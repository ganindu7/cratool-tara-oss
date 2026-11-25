import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { canonicalJson, fingerprint, sha256 } from "../src/index.ts";

test("sha256 gives the values of the standard's test vectors", () => {
  assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(
    sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  );
});

test("sha256 agrees with the platform's own for long and non-ASCII texts", () => {
  for (const text of [
    "x".repeat(55),
    "x".repeat(56),
    "x".repeat(64),
    "x".repeat(1000),
    "Größe 5 µm, 10 € – naïve ✓",
    "a\nb\tc",
  ]) {
    assert.equal(sha256(text), createHash("sha256").update(text, "utf8").digest("hex"), `length ${text.length}`);
  }
});

test("the fingerprint of a value does not depend on the order of its keys", () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: null, c: "x" }] }), '{"a":[2,{"c":"x","d":null}],"b":1}');
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
  assert.notEqual(fingerprint({ a: 1, b: 2 }), fingerprint({ a: 1, b: 3 }));
});
