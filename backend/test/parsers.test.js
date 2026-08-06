import test from "node:test";
import assert from "node:assert/strict";
import { parseBio } from "../src/parsers/bioParser.js";
import { parseFollowers, isQualified } from "../src/parsers/followerParser.js";

test("parseFollowers handles common TikTok shorthand", () => {
  assert.equal(parseFollowers("8,500 followers"), 8500);
  assert.equal(parseFollowers("8.5K"), 8500);
  assert.equal(parseFollowers("1.2M"), 1200000);
});

test("isQualified applies default min and max", () => {
  assert.equal(isQualified("1.9K"), false);
  assert.equal(isQualified("2K"), false);
  assert.equal(isQualified("2.1K"), true);
  assert.equal(isQualified("8.5K"), true);
  assert.equal(isQualified("20K"), true);
  assert.equal(isQualified("20.1K"), false);
  assert.equal(isQualified("25K"), false);
});

test("parseBio extracts lead details", () => {
  const result = parseBio("Beauty Creator\nBusiness: hello@gmail.com\nIG: @anna.ph\nManila");
  assert.equal(result.email, "hello@gmail.com");
  assert.equal(result.instagram, "anna.ph");
  assert.equal(result.location, "Manila");
  assert.deepEqual(result.category, ["Beauty", "Business"]);
});
