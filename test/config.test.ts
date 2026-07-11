import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, loadConfig, REGION_BASE_URLS } from "../src/config.ts";

test("throws a clear error when token is missing", () => {
  assert.throws(() => loadConfig({}), (e: unknown) => {
    assert.ok(e instanceof ConfigError);
    assert.match((e as Error).message, /ZEPHYR_API_TOKEN/);
    return true;
  });
});

test("defaults to the US base URL", () => {
  const cfg = loadConfig({ ZEPHYR_API_TOKEN: "tok" });
  assert.equal(cfg.baseUrl, REGION_BASE_URLS.us);
  assert.equal(cfg.token, "tok");
});

test("resolves EU region", () => {
  const cfg = loadConfig({ ZEPHYR_API_TOKEN: "tok", ZEPHYR_REGION: "eu" });
  assert.equal(cfg.baseUrl, REGION_BASE_URLS.eu);
});

test("region is case-insensitive", () => {
  const cfg = loadConfig({ ZEPHYR_API_TOKEN: "tok", ZEPHYR_REGION: "DE" });
  assert.equal(cfg.baseUrl, REGION_BASE_URLS.de);
});

test("explicit base URL overrides region and strips trailing slash", () => {
  const cfg = loadConfig({
    ZEPHYR_API_TOKEN: "tok",
    ZEPHYR_REGION: "eu",
    ZEPHYR_BASE_URL: "https://custom.example.com/v2/",
  });
  assert.equal(cfg.baseUrl, "https://custom.example.com/v2");
});

test("rejects an unknown region", () => {
  assert.throws(
    () => loadConfig({ ZEPHYR_API_TOKEN: "tok", ZEPHYR_REGION: "mars" }),
    ConfigError,
  );
});
