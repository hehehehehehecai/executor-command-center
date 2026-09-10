import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateAssetRecord,
  validateFileFacts,
  verifyArtAssets,
} from "./verify-art-assets.mjs";

// CASE_PLAN_BEGIN：在实现缺失时冻结；want为政策推导的字面量，非实现计算结果。
const cases = [
  {"id":"EMPTY","kind":"empty","want":[],"path":"asset-manifest.json"},
  {"id":"UNREGISTERED","kind":"unknown","file":"unexpected.bin","want":["ART_UNREGISTERED"],"path":"unexpected.bin"},
  {"id":"UNREGISTERED_NESTED","kind":"unknown","file":"nested/readme.txt","want":["ART_UNREGISTERED"],"path":"nested/readme.txt"},
  {"id":"DUPLICATE_ID","kind":"duplicate-id","want":["ART_ID_UNIQUE"],"path":"other.png"},
  {"id":"DUPLICATE_PATH","kind":"duplicate-path","want":["ART_PATH_UNIQUE"],"path":"dot.png"},
  {"id":"PATH_DRIVE","kind":"path","value":"C:/outside.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_DRIVE_RELATIVE","kind":"path","value":"C:outside.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_PARENT","kind":"path","value":"../outside.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_DOT","kind":"path","value":"./dot.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_INNER_PARENT","kind":"path","value":"nested/../dot.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_UNC","kind":"path","value":"//server/share/dot.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_BACKSLASH_UNC","kind":"path","value":"\\\\server\\share\\dot.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_URL","kind":"path","value":"https://example.invalid/dot.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_DATA_URI","kind":"path","value":"data:image/png;base64,AA==","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_BACKSLASH","kind":"path","value":"nested\\dot.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_EMPTY_SEGMENT","kind":"path","value":"nested//dot.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_POSIX_ABSOLUTE","kind":"path","value":"/outside.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_ENCODED","kind":"path","value":"%2e%2e/outside.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_DOUBLE_ENCODED","kind":"path","value":"nested/%252e%252e/outside.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_ADS","kind":"path","value":"dot.png:stream","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_TRAILING_SPACE","kind":"path","value":"dot.png ","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_RESERVED","kind":"path","value":"NUL.png","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_EMPTY","kind":"path","value":"","want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_TYPE","kind":"path","value":null,"want":["ART_PATH"],"path":"asset-manifest.json"},
  {"id":"PATH_CASE","kind":"case","want":["ART_PATH_CASE"],"path":"DOT.png"},
  {"id":"RECORD_TYPE","kind":"record-type","want":["ART_RECORD"],"path":"asset-manifest.json"},
  {"id":"ID_EMPTY","kind":"field","field":"id","value":" ","want":["ART_ID"],"path":"dot.png"},
  {"id":"PURPOSE_EMPTY","kind":"field","field":"purpose","value":"","want":["ART_PURPOSE"],"path":"dot.png"},
  {"id":"SOURCE_MISSING","kind":"field","field":"source","remove":true,"want":["ART_SOURCE"],"path":"dot.png"},
  {"id":"SOURCE_HOLDER","kind":"field","field":"source.rightsHolder","remove":true,"want":["ART_SOURCE"],"path":"dot.png"},
  {"id":"LICENSE_MISSING","kind":"field","field":"license","remove":true,"want":["ART_LICENSE"],"path":"dot.png"},
  {"id":"LICENSE_EVIDENCE","kind":"field","field":"license.evidence","value":" ","want":["ART_LICENSE"],"path":"dot.png"},
  {"id":"LICENSE_SCOPE","kind":"field","field":"license.productionScope","remove":true,"want":["ART_LICENSE"],"path":"dot.png"},
  {"id":"LICENSE_CONDITIONS","kind":"field","field":"license.conditions","value":false,"want":["ART_LICENSE"],"path":"dot.png"},
  {"id":"LICENSE_APPROVAL","kind":"field","field":"license.approvalReference","remove":true,"want":["ART_LICENSE"],"path":"dot.png"},
  {"id":"CONTENT_TRUE","kind":"field","field":"contentBearing","value":true,"want":["ART_CONTENT"],"path":"dot.png"},
  {"id":"CONTENT_STRING","kind":"field","field":"contentBearing","value":"false","want":["ART_CONTENT"],"path":"dot.png"},
  {"id":"HASH_SHAPE","kind":"field","field":"sha256","value":"bad","want":["ART_SHA256"],"path":"dot.png"},
  {"id":"DIMENSION_TYPE","kind":"field","field":"width","value":true,"want":["ART_DIMENSIONS"],"path":"dot.png"},
  {"id":"DIMENSION_ZERO","kind":"field","field":"height","value":0,"want":["ART_DIMENSIONS"],"path":"dot.png"},
  {"id":"SIZE_TYPE","kind":"field","field":"sizeBytes","value":"68","want":["ART_SIZE"],"path":"dot.png"},
  {"id":"FORMAT_EMPTY","kind":"field","field":"format","value":"","want":["ART_FORMAT"],"path":"dot.png"},
  {"id":"LOADING_EAGER","kind":"field","field":"loading","value":"eager","want":["ART_LOADING"],"path":"dot.png"},
  {"id":"FALLBACK_TYPE","kind":"field","field":"fallback","value":"none","want":["ART_FALLBACK"],"path":"dot.png"},
  {"id":"FALLBACK_REMOTE","kind":"field","field":"fallback.strategy","value":"download","want":["ART_FALLBACK"],"path":"dot.png"},
  {"id":"FALLBACK_DESCRIPTION","kind":"field","field":"fallback.description","value":"","want":["ART_FALLBACK"],"path":"dot.png"},
  {"id":"HASH_MISMATCH","kind":"field","field":"sha256","value":"0000000000000000000000000000000000000000000000000000000000000000","want":["ART_HASH_MISMATCH"],"path":"dot.png"},
  {"id":"SIZE_MISMATCH","kind":"field","field":"sizeBytes","value":1,"want":["ART_SIZE_MISMATCH"],"path":"dot.png"},
  {"id":"DIMENSION_MISMATCH","kind":"field","field":"width","value":2,"want":["ART_DIMENSION_MISMATCH"],"path":"dot.png"},
  {"id":"FORMAT_MISMATCH","kind":"field","field":"format","value":"jpeg","want":["ART_FORMAT_MISMATCH"],"path":"dot.png"},
  {"id":"EXTENSION_MISMATCH","kind":"extension","want":["ART_FORMAT_MISMATCH"],"path":"dot.jpg"},
  {"id":"UNKNOWN_FORMAT","kind":"unknown-format","want":["ART_FORMAT_UNKNOWN"],"path":"dot.png"},
  {"id":"TRUNCATED_IMAGE","kind":"truncated","want":["ART_FORMAT_UNKNOWN"],"path":"dot.png"},
  {"id":"SIZE_OVER_LIMIT","kind":"oversize","want":["ART_SIZE_LIMIT"],"path":"dot.png"},
  {"id":"SIZE_AT_LIMIT","kind":"limit-exact","want":["ART_FORMAT_UNKNOWN"],"absent":["ART_SIZE_LIMIT"],"path":"dot.png"},
  {"id":"STRUCTURE_VALID","kind":"structure-valid","want":[],"path":"dot.png"},
  {"id":"FILE_FACTS_VALID","kind":"facts-valid","want":[],"path":"dot.png"},
  {"id":"CSS_ONLY","kind":"css-only","want":["ART_CSS_ONLY","ART_FORMAT_NOT_APPROVED","ART_MANUAL_REVIEW_REQUIRED"],"path":"dot.png"},
  {"id":"TOP_KEYS","kind":"top","field":"extra","value":true,"want":["ART_TOP_LEVEL"],"path":"asset-manifest.json"},
  {"id":"SCHEMA_TYPE","kind":"top","field":"schemaVersion","value":true,"want":["ART_SCHEMA_VERSION"],"path":"asset-manifest.json"},
  {"id":"MODE_VALUE","kind":"top","field":"mode","value":"images","want":["ART_MODE"],"path":"asset-manifest.json"},
  {"id":"ASSETS_TYPE","kind":"top","field":"assets","value":{},"want":["ART_ASSETS"],"path":"asset-manifest.json"},
  {"id":"JSON_INVALID","kind":"json","value":"{broken","want":["ART_MANIFEST_JSON"],"path":"asset-manifest.json"},
  {"id":"JSON_DUPLICATE","kind":"json","value":"{\"schemaVersion\":1,\"schemaVersion\":1,\"mode\":\"css-procedural\",\"assets\":[]}","want":["ART_MANIFEST_DUPLICATE_KEY"],"path":"asset-manifest.json"},
  {"id":"JSON_NESTED_DUPLICATE","kind":"json","value":"{\"schemaVersion\":1,\"mode\":\"css-procedural\",\"assets\":[{\"source\":{\"origin\":\"one\",\"origin\":\"two\"}}]}","want":["ART_MANIFEST_DUPLICATE_KEY"],"path":"asset-manifest.json"},
  {"id":"MANIFEST_MISSING","kind":"missing-manifest","want":["ART_MANIFEST_READ"],"path":"asset-manifest.json"},
  {"id":"FILE_MISSING","kind":"missing-file","want":["ART_FILE_MISSING"],"path":"dot.png"},
  {"id":"LINK_DIRECTORY","kind":"link-directory","want":["ART_PATH_LINK"],"path":"escape"},
  {"id":"LINK_ROOT","kind":"link-root","want":["ART_PATH_LINK"],"path":"asset-manifest.json"},
  {"id":"LINK_MANIFEST","kind":"link-manifest","want":["ART_PATH_LINK"],"path":"asset-manifest.json"},
  {"id":"CLI_EMPTY","kind":"cli-empty","want":[],"path":"asset-manifest.json"},
  {"id":"CLI_UNKNOWN","kind":"cli-unknown","want":["ART_UNREGISTERED"],"path":"unexpected.bin"},
  {"id":"CLI_NO_BYPASS","kind":"cli-options","want":["ART_CLI_OPTIONS"],"path":"asset-manifest.json"}
];
// CASE_PLAN_END

const implementation = fileURLToPath(new URL("./verify-art-assets.mjs", import.meta.url));
const temporaryParent = fs.realpathSync(os.tmpdir());
const prefix = "explorer-art-task04-02-c389abd6d434d8db-";
// 纯测试的1×1 PNG字节；不读取用户图或远程资源，不代表获准格式。
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS9sAAAAASUVORK5CYII=", "base64");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const empty = () => ({ schemaVersion: 1, mode: "css-procedural", assets: [] });

function asset(bytes = png) {
  return {
    id: "test-decoration", path: "dot.png", purpose: "纯测试结构数据，不具生产许可",
    source: { origin: "测试文件内合成字节", rightsHolder: "测试作者标记", evidence: "测试来源标记" },
    license: { evidence: "测试结构占位，不是许可证", productionScope: "仅测试", conditions: "不得进入生产", approvalReference: "无生产批准，仅字段测试" },
    sha256: digest(bytes), width: 1, height: 1, sizeBytes: bytes.length,
    format: "png", loading: "lazy", fallback: { strategy: "none", description: "取消装饰仍可读可操作" }, contentBearing: false,
  };
}

function snapshot(directory) {
  const result = {};
  function visit(current) {
    for (const name of fs.readdirSync(current).sort()) {
      const full = path.join(current, name);
      const relative = path.relative(directory, full).split(path.sep).join("/");
      const info = fs.lstatSync(full);
      if (info.isSymbolicLink()) result[relative] = { link: fs.readlinkSync(full) };
      else if (info.isDirectory()) { result[relative] = { directory: true }; visit(full); }
      else result[relative] = { size: info.size, sha256: digest(fs.readFileSync(full)) };
    }
  }
  visit(directory);
  return result;
}

function fixture(t, id) {
  const owned = fs.mkdtempSync(path.join(temporaryParent, prefix + id + "-"));
  const root = path.join(owned, "public", "art", "executor");
  fs.mkdirSync(root, { recursive: true });
  t.after(() => {
    // 删除仅限本次mkdtemp返回的目录；先验证绝对边界，绝不跟随链接清理。
    assert.equal(path.dirname(owned), temporaryParent);
    assert.ok(path.basename(owned).startsWith(prefix + id + "-"));
    assert.equal(fs.lstatSync(owned).isSymbolicLink(), false);
    function unlinkOwnedLinks(directory) {
      for (const name of fs.readdirSync(directory)) {
        const item = path.join(directory, name);
        assert.ok(path.relative(owned, item) && !path.relative(owned, item).startsWith(".."));
        const info = fs.lstatSync(item);
        if (info.isSymbolicLink()) fs.unlinkSync(item);
        else if (info.isDirectory()) unlinkOwnedLinks(item);
      }
    }
    unlinkOwnedLinks(owned);
    fs.rmSync(owned, { recursive: true, force: false });
  });
  const put = (relative, bytes) => {
    const target = path.join(root, relative);
    assert.ok(!path.relative(root, target).startsWith(".."));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  };
  return { owned, root, put, manifest: (data) => put("asset-manifest.json", JSON.stringify(data)) };
}

for (const item of cases) {
  test(`${item.id}: ${item.want.join(",") || "合同符合"}`, (t) => {
    const f = fixture(t, item.id);
    let record = asset();
    let manifest = empty();
    let root = f.root;
    let standalone = null;
    let bytes = png;
    let cli = false;
    const cliArgs = [];
    const opens = [];
    if (["path", "field", "case", "extension", "unknown-format", "truncated", "oversize", "css-only", "duplicate-id", "duplicate-path", "missing-file", "link-directory"].includes(item.kind)) {
      manifest.assets = [record];
      f.put("dot.png", bytes);
    }
    if (item.kind === "unknown" || item.kind === "cli-unknown") f.put(item.file ?? "unexpected.bin", "独立未登记反例");
    if (item.kind === "path") record.path = item.value;
    if (item.kind === "case") record.path = "DOT.png";
    if (item.kind === "field") {
      const keys = item.field.split(".");
      const owner = keys.length === 1 ? record : record[keys[0]];
      if (item.remove) delete owner[keys.at(-1)];
      else owner[keys.at(-1)] = item.value;
    }
    if (item.kind === "record-type") manifest.assets = [null];
    if (item.kind === "duplicate-id") { manifest.assets.push({ ...asset(), path: "other.png" }); f.put("other.png", png); }
    if (item.kind === "duplicate-path") manifest.assets.push({ ...asset(), id: "other-id" });
    if (item.kind === "extension") { fs.unlinkSync(path.join(f.root, "dot.png")); record.path = "dot.jpg"; f.put("dot.jpg", bytes); }
    if (item.kind === "unknown-format") bytes = Buffer.from("仅测试的非图像字节");
    if (item.kind === "truncated") bytes = png.subarray(0, 20);
    if (item.kind === "oversize") bytes = Buffer.alloc(307201);
    if (["unknown-format", "truncated", "oversize"].includes(item.kind)) {
      record.sha256 = digest(bytes); record.sizeBytes = bytes.length; f.put("dot.png", bytes);
    }
    if (item.kind === "missing-file") fs.unlinkSync(path.join(f.root, "dot.png"));
    if (item.kind === "top") manifest[item.field] = item.value;
    if (item.kind === "structure-valid") standalone = () => validateAssetRecord(asset(), 0);
    if (item.kind === "facts-valid") standalone = () => validateFileFacts(asset(), png);
    if (item.kind === "limit-exact") {
      bytes = Buffer.alloc(307200); record = asset(bytes);
      standalone = () => validateFileFacts(record, bytes);
    }
    f.manifest(manifest);
    if (item.kind === "json") f.put("asset-manifest.json", item.value);
    if (item.kind === "missing-manifest") fs.unlinkSync(path.join(f.root, "asset-manifest.json"));
    if (item.kind.startsWith("link-")) {
      const outside = path.join(f.owned, "outside");
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, "secret.png"), "OUTSIDE_CONTENT_MUST_NOT_BE_READ");
      if (item.kind === "link-directory") {
        record.path = "escape/secret.png"; f.manifest(manifest);
        fs.symlinkSync(outside, path.join(root, "escape"), "junction");
      } else if (item.kind === "link-root") {
        root = path.join(f.owned, "root-link"); fs.symlinkSync(f.root, root, "junction");
      } else {
        fs.unlinkSync(path.join(root, "asset-manifest.json"));
        fs.symlinkSync(outside, path.join(root, "asset-manifest.json"), "junction");
      }
    }
    if (item.kind.startsWith("cli-")) {
      cli = true;
      fs.mkdirSync(path.join(f.owned, "scripts"));
      fs.copyFileSync(implementation, path.join(f.owned, "scripts", "verify-art-assets.mjs"));
      if (item.kind === "cli-options") cliArgs.push("--allow-png");
    }
    const before = snapshot(f.owned);
    let result;
    let exitCode;
    if (cli) {
      const proc = spawnSync(process.execPath, [path.join(f.owned, "scripts", "verify-art-assets.mjs"), ...cliArgs], { cwd: f.owned, encoding: "utf8" });
      assert.equal(proc.error, undefined);
      assert.equal(proc.stderr, "");
      result = JSON.parse(proc.stdout);
      exitCode = proc.status;
      assert.equal(exitCode, item.want.length ? 1 : 0);
    } else {
      const originalOpen = fs.openSync;
      // 透传真实文件打开，只记录读取对象；用来抓住“先读越界文件再报错”的缺陷。
      const spy = t.mock.method(fs, "openSync", (filename, ...args) => {
        const full = path.resolve(filename);
        const relative = path.relative(f.root, full);
        opens.push(relative.split(path.sep).join("/"));
        assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "校验器不应打开资产根目录以外文件");
        return originalOpen(filename, ...args);
      });
      try {
        const errors = standalone ? standalone() : null;
        result = standalone ? { ok: errors.length === 0, errors } : verifyArtAssets(root);
      } finally { spy.mock.restore(); }
    }
    assert.equal(result.ok, result.errors.length === 0);
    for (const expected of item.want) {
      const expectedPath = expected === "ART_CSS_ONLY" ? "asset-manifest.json" : item.path;
      assert.ok(result.errors.some((e) => e.rule_id === expected && e.path === expectedPath), JSON.stringify({ case_id: item.id, expected, expectedPath, actual: result.errors }));
    }
    if (!item.want.length) assert.deepEqual(result.errors, []);
    for (const forbidden of item.absent ?? []) assert.ok(!result.errors.some((e) => e.rule_id === forbidden));
    for (const error of result.errors) {
      assert.match(error.rule_id, /^ART_[A-Z_0-9]+$/);
      assert.equal(typeof error.reason, "string"); assert.ok(error.reason.length > 0);
      assert.ok(!path.isAbsolute(error.path) && !error.path.includes("\\") && !error.path.split("/").includes(".."));
    }
    // 此断言在校验器的catch边界之外，确保被捕获的越界打开尝试也会使测试失败。
    assert.ok(opens.every((opened) => opened && !opened.startsWith("..") && !path.isAbsolute(opened)));
    if (item.kind === "path" || item.kind === "case") assert.deepEqual(opens, ["asset-manifest.json"]);
    if (item.kind === "link-root" || item.kind === "link-manifest") assert.deepEqual(opens, []);
    if (item.kind === "link-directory") assert.ok(!opens.some((p) => p.includes("escape")));
    assert.ok(!JSON.stringify(result).includes("OUTSIDE_CONTENT_MUST_NOT_BE_READ"));
    assert.deepEqual(snapshot(f.owned), before, "校验器不得改变fixture的文件内容、目录或链接");
    t.diagnostic(JSON.stringify({ case_id: item.id, expected_rule_ids: item.want, expected_path: item.path, actual_errors: result.errors, cli_exit_code: exitCode ?? null, opened_relative_paths: opens, readonly_snapshot_equal: true, fixture_kind: item.kind, fixture_directory: f.owned }));
  });
}
