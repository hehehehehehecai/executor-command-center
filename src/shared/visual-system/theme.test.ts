import { describe, expect, it } from "vitest";

import {
  parseExecutorTheme,
  type ExecutorTheme,
} from "@/shared/visual-system";

describe("主题解析的精确匹配与失败关闭", () => {
  it.each<{
    label: string;
    value: string | undefined;
    expected: ExecutorTheme;
  }>([
    { label: "缺失配置使用 deep-space", value: undefined, expected: "deep-space" },
    { label: "显式 deep-space 保持深空主题", value: "deep-space", expected: "deep-space" },
    { label: "显式 legacy 保持回退主题", value: "legacy", expected: "legacy" },
    { label: "空串回退 legacy", value: "", expected: "legacy" },
    { label: "拼写错误回退 legacy", value: "deep-spcae", expected: "legacy" },
    { label: "未知主题回退 legacy", value: "unknown-theme", expected: "legacy" },
    { label: "大写深空主题名回退 legacy", value: "DEEP-SPACE", expected: "legacy" },
    { label: "大小写变体回退 legacy", value: "Legacy", expected: "legacy" },
    { label: "不移除前导空格", value: " deep-space", expected: "legacy" },
    { label: "不移除尾随空格", value: "deep-space ", expected: "legacy" },
    { label: "带空格的 legacy 按未知值回退", value: "legacy ", expected: "legacy" },
    { label: "不移除制表符或换行", value: "\tdeep-space\n", expected: "legacy" },
  ])("$label", ({ value, expected }) => {
    expect(parseExecutorTheme(value)).toBe(expected);
  });
});
