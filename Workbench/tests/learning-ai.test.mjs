import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChallengePrompt,
  buildDecomposePrompt,
  buildGradeProbePrompt,
  buildGradePrompt,
  buildVariantPrompt,
  parseAiJson,
  parseChallengeResult,
  parseDecomposeResult,
  parseGradeResult,
  parseVariantResult,
} from "../server/learning-ai.mjs";

test("buildDecomposePrompt embeds project and sources with truncation note", () => {
  const { system, user } = buildDecomposePrompt({
    title: "学习 React 状态管理",
    description: "从 useState 到 Zustand",
    sourcesText: "资料内容".repeat(100),
  });
  assert.match(system, /JSON/);
  assert.match(user, /学习 React 状态管理/);
  assert.match(user, /从 useState 到 Zustand/);
});

test("parseDecomposeResult validates dag draft shape", () => {
  const parsed = parseDecomposeResult(JSON.stringify({
    levels: [{ slug: "a", title: "关卡 A", summary: "简介", depends_on: [], rubric_hints: ["点1"] }],
  }));
  assert.equal(parsed.levels[0].slug, "a");
  assert.throws(() => parseDecomposeResult(JSON.stringify({ levels: [{ slug: "Bad!", title: "x" }] })), /slug/);
  assert.throws(() => parseDecomposeResult("not json"), /JSON/);
});

test("parseChallengeResult enforces rubric total 100 per level", () => {
  const ok = parseChallengeResult(JSON.stringify({
    challenges: [{ slug: "a", challenge_md: "做练习", rubric: [{ item: "完成", points: 100 }] }],
  }));
  assert.equal(ok.challenges[0].rubric[0].points, 100);
  assert.throws(
    () => parseChallengeResult(JSON.stringify({ challenges: [{ slug: "a", challenge_md: "x", rubric: [{ item: "y", points: 50 }] }] })),
    /100/,
  );
});

test("parseGradeResult validates score fields", () => {
  const parsed = parseGradeResult(JSON.stringify({
    scores: [{ item: "完成", earned: 40, comment: "部分" }],
    total: 40,
    feedback: "继续努力",
    needs_probe: false,
    probes: [],
  }));
  assert.equal(parsed.total, 40);
  assert.throws(() => parseGradeResult(JSON.stringify({ total: "高分" })), /total/);
});

test("parseVariantResult requires challenge_md", () => {
  assert.equal(parseVariantResult(JSON.stringify({ challenge_md: "变体题" })).challenge_md, "变体题");
  assert.throws(() => parseVariantResult(JSON.stringify({})), /challenge_md/);
});

test("parseAiJson strips code fences", () => {
  assert.deepEqual(parseAiJson("```json\n{\"a\": 1}\n```"), { a: 1 });
});

test("buildGradePrompt and probe/variant prompts carry rubric items", () => {
  const rubric = [{ item: "说明重渲染条件", points: 100 }];
  assert.match(buildGradePrompt({ levelTitle: "关卡", challenge: "挑战", rubric, submission: "作答" }).user, /说明重渲染条件/);
  assert.match(buildGradeProbePrompt({ levelTitle: "关卡", challenge: "挑战", rubric, draftScore: 75, qa: "问答", answers: ["答"] }).user, /75/);
  assert.match(buildVariantPrompt({ challenge: "原题", rubric, previousSummaries: ["旧作答"] }).user, /原题/);
  assert.match(buildChallengePrompt({ projectTitle: "项目", levels: [{ slug: "a", title: "A", summary: "s", rubric_hints: [] }] }).user, /项目/);
});
