import { assertSlug } from "./learning.mjs";

const SOURCE_CHAR_LIMIT = 8000;

export function parseAiJson(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    throw new TypeError(`AI 输出不是合法 JSON: ${error.message}`);
  }
}

function requireArray(value, field) {
  if (!Array.isArray(value)) throw new TypeError(`AI 输出缺少数组字段: ${field}`);
  return value;
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`AI 输出缺少字符串字段: ${field}`);
  return value;
}

export function parseDecomposeResult(text) {
  const output = parseAiJson(text);
  const levels = requireArray(output.levels, "levels").map((entry) => ({
    slug: assertSlug(entry.slug ?? "", "levels[].slug"),
    title: requireString(entry.title, "levels[].title"),
    summary: String(entry.summary ?? ""),
    depends_on: requireArray(entry.depends_on ?? [], "levels[].depends_on").map(String),
    rubric_hints: requireArray(entry.rubric_hints ?? [], "levels[].rubric_hints").map(String),
  }));
  return { levels };
}

export function parseChallengeResult(text) {
  const output = parseAiJson(text);
  const challenges = requireArray(output.challenges, "challenges").map((entry) => {
    const rubric = requireArray(entry.rubric, "challenges[].rubric").map((item) => ({
      item: requireString(item.item, "rubric.item"),
      points: Number(item.points),
    }));
    const total = rubric.reduce((sum, item) => sum + item.points, 0);
    if (total !== 100) throw new TypeError(`关卡 ${entry.slug} 的 rubric 总分为 ${total}，必须为 100`);
    return { slug: assertSlug(entry.slug ?? "", "challenges[].slug"), challenge_md: requireString(entry.challenge_md, "challenges[].challenge_md"), rubric };
  });
  return { challenges };
}

export function parseGradeResult(text) {
  const output = parseAiJson(text);
  if (!Number.isFinite(Number(output.total))) throw new TypeError("AI 输出缺少数值字段: total");
  return {
    scores: requireArray(output.scores ?? [], "scores").map((entry) => ({
      item: String(entry.item ?? ""),
      earned: Number(entry.earned) || 0,
      comment: String(entry.comment ?? ""),
    })),
    total: Number(output.total),
    feedback: String(output.feedback ?? ""),
    needs_probe: output.needs_probe === true,
    probes: requireArray(output.probes ?? [], "probes").map(String).slice(0, 2),
  };
}

export function parseProbeGradeResult(text) {
  const output = parseAiJson(text);
  if (!Number.isFinite(Number(output.total))) throw new TypeError("AI 输出缺少数值字段: total");
  return { total: Number(output.total), feedback: String(output.feedback ?? ""), passed: output.passed === true };
}

export function parseVariantResult(text) {
  const output = parseAiJson(text);
  return { challenge_md: requireString(output.challenge_md, "challenge_md") };
}

const SYSTEM_JSON = "你是学习闯关模块的助教引擎。你只输出 JSON，不输出任何解释性文字、 Markdown 代码围栏以外的内容也必须是合法 JSON。";

export function buildDecomposePrompt({ title, description, sourcesText }) {
  return {
    system: SYSTEM_JSON,
    user: [
      `把学习项目「${title}」拆解为知识点关卡依赖图。`,
      description ? `项目描述：${description}` : "",
      "要求：5-12 个关卡；每关一个可实践验证的知识点；用 depends_on 表达前置依赖（必须是本次输出中靠前的 slug）；slug 用小写字母数字连字符。",
      "输出 JSON：{\"levels\":[{\"slug\",\"title\",\"summary\",\"depends_on\":[],\"rubric_hints\":[\"考点\"]}]}",
      sourcesText ? `\n挂接资料（截断于 ${SOURCE_CHAR_LIMIT} 字）：\n${sourcesText.slice(0, SOURCE_CHAR_LIMIT)}` : "",
    ].filter(Boolean).join("\n"),
  };
}

export function buildChallengePrompt({ projectTitle, levels }) {
  return {
    system: SYSTEM_JSON,
    user: [
      `为学习项目「${projectTitle}」的每个关卡设计实践挑战和评分细则。`,
      "要求：挑战必须是可产出物的实践任务（写代码/做练习/写讲解），不是背诵题；每关 rubric 3-5 条，总分必须恰好 100；关卡之间难度递进、情境不重复。",
      `关卡清单：${JSON.stringify(levels.map((entry) => ({ slug: entry.slug, title: entry.title, summary: entry.summary, rubric_hints: entry.rubric_hints })))}`,
      "输出 JSON：{\"challenges\":[{\"slug\",\"challenge_md\",\"rubric\":[{\"item\",\"points\"}]}]}",
    ].join("\n"),
  };
}

export function buildGradePrompt({ levelTitle, challenge, rubric, submission }) {
  return {
    system: SYSTEM_JSON,
    user: [
      `你是严格的评审。关卡「${levelTitle}」的挑战：\n${challenge}`,
      `评分细则：${JSON.stringify(rubric)}`,
      `学习者的提交产物：\n${submission}`,
      "逐条按 rubric 打分（ earned 不超过该条 points ），给出总分与针对性反馈。",
      "如果产物有搬运/拼凑痕迹，或分数不足以明确判定理解程度，设 needs_probe 为 true 并给出 1-2 个追问问题（考察理解深度而非记忆）。",
      "输出 JSON：{\"scores\":[{\"item\",\"earned\",\"comment\"}],\"total\":0,\"feedback\":\"\",\"needs_probe\":false,\"probes\":[]}",
    ].join("\n"),
  };
}

export function buildGradeProbePrompt({ levelTitle, challenge, rubric, draftScore, qa, answers }) {
  return {
    system: SYSTEM_JSON,
    user: [
      `关卡「${levelTitle}」的挑战：\n${challenge}`,
      `评分细则：${JSON.stringify(rubric)}`,
      `此前评审草稿分：${draftScore}。原始评审记录：\n${qa}`,
      `学习者对追问的回答：${JSON.stringify(answers)}`,
      "综合产物与追问回答给出最终判定：passed 表示确认理解达标；total 为最终总分（0-100）。",
      "输出 JSON：{\"total\":0,\"feedback\":\"\",\"passed\":false}",
    ].join("\n"),
  };
}

export function buildVariantPrompt({ challenge, rubric, previousSummaries }) {
  return {
    system: SYSTEM_JSON,
    user: [
      `原挑战：\n${challenge}`,
      `评分细则（必须不变，仍按同一 rubric 评分）：${JSON.stringify(rubric)}`,
      `学习者最近的提交摘要（避免与这些答案撞车）：\n${previousSummaries.join("\n---\n") || "（无）"}`,
      "生成同一考点、同一 rubric、不同情境的变体挑战，防止靠背答案过关。",
      "输出 JSON：{\"challenge_md\":\"\"}",
    ].join("\n"),
  };
}
