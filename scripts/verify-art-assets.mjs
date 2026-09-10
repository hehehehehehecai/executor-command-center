import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const manifestName = "asset-manifest.json";
const maximumBytes = 307200;
const defaultRoot = fileURLToPath(new URL("../public/art/executor/", import.meta.url));
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;

function canonicalRelative(value) {
  if (!nonempty(value) || /[\\%:\x00-\x1f\x7f<>"|?*]/u.test(value)) return false;
  return value.split("/").every((part) =>
    part !== "" && part !== "." && part !== ".." && part === part.trim() &&
    !part.endsWith(".") && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
  );
}

function issue(rule_id, relative, reason, pointer) {
  return { rule_id, path: canonicalRelative(relative) ? relative : manifestName, reason, ...(pointer ? { pointer } : {}) };
}

// 独立结构规则用于逐字段诊断；字段有值不代表许可或视觉内容已经人工获批。
export function validateAssetRecord(asset, index = 0) {
  const errors = [];
  const pointer = `/assets/${index}`;
  if (!isObject(asset)) return [issue("ART_RECORD", manifestName, "资产记录必须是对象", pointer)];
  const relative = canonicalRelative(asset.path) ? asset.path : manifestName;
  const add = (rule, reason, field) => errors.push(issue(rule, relative, reason, `${pointer}/${field}`));
  if (!nonempty(asset.id)) add("ART_ID", "id必须为非空字符串", "id");
  if (!canonicalRelative(asset.path) || asset.path === manifestName) add("ART_PATH", "path必须是目录内规范相对文件路径，且不能指向清单自身", "path");
  if (!nonempty(asset.purpose)) add("ART_PURPOSE", "purpose必须说明纯装饰用途，且为非空字符串", "purpose");
  if (!isObject(asset.source) || !["origin", "rightsHolder", "evidence"].every((key) => nonempty(asset.source[key]))) add("ART_SOURCE", "source必须提供非空origin、rightsHolder和evidence", "source");
  if (!isObject(asset.license) || !["evidence", "productionScope", "conditions", "approvalReference"].every((key) => nonempty(asset.license[key]))) add("ART_LICENSE", "license必须独立提供许可凭据、生产范围、条件和准入批准引用", "license");
  if (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256)) add("ART_SHA256", "sha256必须为64位小写十六进制字符串", "sha256");
  if (!positiveInteger(asset.width) || !positiveInteger(asset.height)) add("ART_DIMENSIONS", "width与height必须为正整数像素尺寸", "width");
  if (!positiveInteger(asset.sizeBytes)) add("ART_SIZE", "sizeBytes必须为正整数字节数", "sizeBytes");
  if (typeof asset.sizeBytes === "number" && asset.sizeBytes > maximumBytes) add("ART_SIZE_LIMIT", "登记大小超过300 KiB（307200字节）上限", "sizeBytes");
  if (!nonempty(asset.format)) add("ART_FORMAT", "format必须为非空字符串；当前无获准生产格式", "format");
  if (asset.loading !== "lazy") add("ART_LOADING", "装饰资源loading必须为lazy", "loading");
  if (!isObject(asset.fallback) || !["existing-css", "none"].includes(asset.fallback.strategy) || !nonempty(asset.fallback.description)) add("ART_FALLBACK", "fallback必须说明复用已批准CSS或取消装饰后的可读、可操作行为", "fallback");
  if (asset.contentBearing !== false) add("ART_CONTENT", "contentBearing必须严格为布尔false，纯装饰性仍须人工审查", "contentBearing");
  return errors;
}

// 仅识别PNG容器结构及头部尺寸；不解码渲染、不授予PNG生产许可。
function imageFacts(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) return null;
  let offset = 8;
  let dimensions = null;
  let hasData = false;
  while (offset + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    const end = offset + 12 + size;
    if (end > bytes.length) return null;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) return null;
    if (offset === 8) {
      if (type !== "IHDR" || size !== 13) return null;
      const width = bytes.readUInt32BE(offset + 8);
      const height = bytes.readUInt32BE(offset + 12);
      if (!positiveInteger(width) || !positiveInteger(height)) return null;
      dimensions = { format: "png", width, height };
    } else if (type === "IHDR") return null;
    if (type === "IDAT") hasData = true;
    if (type === "IEND") return size === 0 && hasData && end === bytes.length ? dimensions : null;
    offset = end;
  }
  return null;
}

export function validateFileFacts(asset, bytes) {
  const errors = [];
  const relative = asset?.path;
  const add = (rule, reason) => errors.push(issue(rule, relative, reason));
  if (bytes.length > maximumBytes) add("ART_SIZE_LIMIT", "实际文件超过300 KiB（307200字节）上限");
  if (asset?.sizeBytes !== bytes.length) add("ART_SIZE_MISMATCH", "sizeBytes与实际文件字节数不一致");
  if (asset?.sha256 !== createHash("sha256").update(bytes).digest("hex")) add("ART_HASH_MISMATCH", "sha256与实际文件字节不一致");
  const facts = imageFacts(bytes);
  if (!facts) add("ART_FORMAT_UNKNOWN", "文件编码未知或PNG结构不完整，不能核验尺寸及格式");
  else {
    if (asset.width !== facts.width || asset.height !== facts.height) add("ART_DIMENSION_MISMATCH", "登记像素尺寸与图像头部实际尺寸不一致");
    if (asset.format !== facts.format || path.posix.extname(relative ?? "") !== ".png") add("ART_FORMAT_MISMATCH", "format、扩展名与实际编码不一致");
  }
  return errors;
}

function within(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}

function plainDirectories(directory) {
  const chain = [];
  for (let current = path.resolve(directory); ; current = path.dirname(current)) {
    chain.unshift(current);
    if (path.dirname(current) === current) break;
  }
  for (const current of chain) {
    const info = fs.lstatSync(current);
    if (info.isSymbolicLink()) throw new Error("ART_PATH_LINK");
    if (!info.isDirectory()) throw new Error("ART_PATH_BOUNDARY");
  }
}

// 打开前检查每级目录、链接及实际路径；打开后核对文件身份，再读取内容。
function readBounded(root, relative, limit) {
  if (!canonicalRelative(relative)) throw new Error("ART_PATH");
  const target = path.join(root, ...relative.split("/"));
  if (!within(root, target)) throw new Error("ART_PATH_BOUNDARY");
  plainDirectories(path.dirname(target));
  const before = fs.lstatSync(target);
  if (before.isSymbolicLink()) throw new Error("ART_PATH_LINK");
  if (!before.isFile()) throw new Error("ART_FILE_TYPE");
  const realRoot = fs.realpathSync(root);
  const realTarget = fs.realpathSync(target);
  if (!within(realRoot, realTarget)) throw new Error("ART_PATH_BOUNDARY");
  let fd;
  try {
    fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const opened = fs.fstatSync(fd);
    plainDirectories(path.dirname(target));
    const after = fs.lstatSync(target);
    if (after.isSymbolicLink()) throw new Error("ART_PATH_LINK");
    if (!opened.isFile() || before.dev !== opened.dev || before.ino !== opened.ino || after.dev !== opened.dev || after.ino !== opened.ino || fs.realpathSync(target) !== realTarget) throw new Error("ART_PATH_CHANGED");
    if (opened.size > limit) return { size: opened.size, bytes: null };
    const bytes = fs.readFileSync(fd);
    const final = fs.fstatSync(fd);
    if (final.size !== opened.size || final.mtimeMs !== opened.mtimeMs || bytes.length !== opened.size) throw new Error("ART_PATH_CHANGED");
    return { size: bytes.length, bytes };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function parseManifest(text) {
  const parsed = JSON.parse(text);
  // JSON.parse先验证语法，再遍历原始token发现重复键（含转义后相同的键）。
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\]:,]/g);
  let cursor = 0;
  function value() {
    if (tokens[cursor] === "{") {
      cursor++;
      const keys = new Set();
      while (tokens[cursor] !== "}") {
        const key = JSON.parse(tokens[cursor++]);
        if (keys.has(key)) throw new Error("ART_MANIFEST_DUPLICATE_KEY");
        keys.add(key); cursor++; value();
        if (tokens[cursor] !== ",") break;
        cursor++;
      }
      cursor++;
    } else if (tokens[cursor] === "[") {
      cursor++;
      while (tokens[cursor] !== "]") {
        value();
        if (tokens[cursor] !== ",") break;
        cursor++;
      }
      cursor++;
    } else cursor++;
  }
  value();
  return parsed;
}

function filesystemError(error, relative, fallback) {
  const stable = new Set(["ART_PATH", "ART_PATH_LINK", "ART_PATH_BOUNDARY", "ART_PATH_CHANGED", "ART_FILE_TYPE"]);
  const rule = stable.has(error.message) ? error.message : fallback;
  return issue(rule, relative, rule === "ART_PATH_LINK" ? "拒绝符号链接或目录联接，不读取其目标" : "文件不可安全读取或目录边界不符合合同");
}

export function verifyArtAssets(assetRoot = defaultRoot) {
  const root = path.resolve(assetRoot);
  const errors = [];
  const finish = (count = 0) => ({ ok: errors.length === 0, mode: "css-procedural", asset_count: count, errors, manual_review: "字段和文件事实检查不替代来源、生产许可或纯装饰性的人工批准；当前没有获准生产图像格式。" });
  try { plainDirectories(root); }
  catch (error) { errors.push(filesystemError(error, manifestName, "ART_ROOT")); return finish(); }
  let manifest;
  try {
    const { bytes } = readBounded(root, manifestName, Infinity);
    manifest = parseManifest(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error.message === "ART_MANIFEST_DUPLICATE_KEY") errors.push(issue(error.message, manifestName, "JSON包含重复字段，禁止覆盖前值"));
    else if (error instanceof SyntaxError || error instanceof TypeError) errors.push(issue("ART_MANIFEST_JSON", manifestName, "清单必须是有效UTF-8 JSON"));
    else errors.push(filesystemError(error, manifestName, "ART_MANIFEST_READ"));
  }
  if (manifest !== undefined) {
    if (!isObject(manifest) || Object.keys(manifest).length !== 3 || !["schemaVersion", "mode", "assets"].every((key) => Object.hasOwn(manifest, key))) errors.push(issue("ART_TOP_LEVEL", manifestName, "顶层必须且仅包含schemaVersion、mode和assets三个字段"));
    if (manifest?.schemaVersion !== 1) errors.push(issue("ART_SCHEMA_VERSION", manifestName, "schemaVersion必须严格为整数1"));
    if (manifest?.mode !== "css-procedural") errors.push(issue("ART_MODE", manifestName, "当前mode必须为css-procedural"));
    if (!Array.isArray(manifest?.assets)) errors.push(issue("ART_ASSETS", manifestName, "assets必须是数组"));
  }
  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  if (assets.length) errors.push(issue("ART_CSS_ONLY", manifestName, "首发仅CSS程序化装饰，assets必须为空"));
  const ids = new Set();
  const paths = new Set();
  for (const [index, asset] of assets.entries()) {
    errors.push(...validateAssetRecord(asset, index));
    if (!isObject(asset)) continue;
    if (nonempty(asset.id)) {
      if (ids.has(asset.id)) errors.push(issue("ART_ID_UNIQUE", asset.path, "id重复", `/assets/${index}/id`));
      ids.add(asset.id);
    }
    if (canonicalRelative(asset.path) && asset.path !== manifestName) {
      if (paths.has(asset.path)) errors.push(issue("ART_PATH_UNIQUE", asset.path, "path重复", `/assets/${index}/path`));
      paths.add(asset.path);
    }
    // 不提供格式允许集合参数、环境变量或CLI豁免；结构fixture也无法进入生产。
    errors.push(issue("ART_FORMAT_NOT_APPROVED", asset.path, "当前生产格式允许集合为空，须重新批准", `/assets/${index}/format`));
    errors.push(issue("ART_MANUAL_REVIEW_REQUIRED", asset.path, "来源、生产许可和纯装饰性须人工独立核验；元数据存在不构成批准", `/assets/${index}`));
  }
  const files = new Map();
  function scan(directory) {
    plainDirectories(directory);
    if (!within(fs.realpathSync(root), fs.realpathSync(directory))) throw new Error("ART_PATH_BOUNDARY");
    for (const name of fs.readdirSync(directory).sort()) {
      const full = path.join(directory, name);
      const relative = path.relative(root, full).split(path.sep).join("/");
      if (!canonicalRelative(relative)) { errors.push(issue("ART_PATH", manifestName, "资产树存在非规范文件路径")); continue; }
      const info = fs.lstatSync(full);
      if (info.isSymbolicLink()) { errors.push(issue("ART_PATH_LINK", relative, "资产树禁止符号链接或目录联接，不跟随读取")); continue; }
      if (info.isDirectory()) { scan(full); continue; }
      if (!info.isFile()) { errors.push(issue("ART_FILE_TYPE", relative, "资产树只接受普通文件")); continue; }
      if (relative === manifestName) continue;
      files.set(relative, full);
      if (!paths.has(relative)) errors.push(issue("ART_UNREGISTERED", relative, "清单元数据以外的任何未登记文件默认拒绝"));
    }
  }
  try { scan(root); }
  catch (error) { errors.push(filesystemError(error, manifestName, "ART_DIRECTORY_READ")); }
  for (const asset of assets) {
    if (!isObject(asset) || !canonicalRelative(asset.path) || asset.path === manifestName) continue;
    if (!files.has(asset.path)) {
      const wrongCase = [...files.keys()].some((entry) => entry.toLowerCase() === asset.path.toLowerCase());
      errors.push(issue(wrongCase ? "ART_PATH_CASE" : "ART_FILE_MISSING", asset.path, wrongCase ? "path大小写必须与实际文件精确一致" : "登记文件缺失或被安全边界拒绝"));
      continue;
    }
    try {
      const content = readBounded(root, asset.path, maximumBytes);
      if (!content.bytes) {
        errors.push(issue("ART_SIZE_LIMIT", asset.path, "实际文件超过307200字节，拒绝读取超限内容"));
        if (asset.sizeBytes !== content.size) errors.push(issue("ART_SIZE_MISMATCH", asset.path, "sizeBytes与实际文件字节数不一致"));
      } else errors.push(...validateFileFacts(asset, content.bytes));
    } catch (error) { errors.push(filesystemError(error, asset.path, "ART_FILE_READ")); }
  }
  return finish(assets.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  try {
    result = process.argv.length > 2
      ? { ok: false, errors: [issue("ART_CLI_OPTIONS", manifestName, "本命令不接受参数或放宽准入选项")] }
      : verifyArtAssets();
  } catch {
    result = { ok: false, errors: [issue("ART_IO", manifestName, "校验未完成；请检查本地资产目录状态")] };
  }
  process.stdout.write(JSON.stringify(result) + "\n");
  process.exitCode = result.ok ? 0 : 1;
}
