import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLevelStates,
  computeProgress,
  projectDetailPayload,
  projectsPayload,
  validateDag,
} from "../server/learning.mjs";

function level(slug, overrides = {}) {
  return {
    slug,
    frontmatter: {
      type: "learning-level",
      project: "demo",
      title: slug,
      status: "locked",
      mastery: 0,
      verified_by: "none",
      depends_on: [],
      ...overrides,
    },
    body: "",
  };
}

test("validateDag reports unknown dependencies and cycles", () => {
  const unknown = validateDag([level("a", { depends_on: ["ghost"] })]);
  assert.match(unknown.errors[0], /ghost/);
  const cycle = validateDag([
    level("a", { depends_on: ["b"] }),
    level("b", { depends_on: ["a"] }),
  ]);
  assert.match(cycle.errors[0], /环/);
  assert.equal(validateDag([level("a"), level("b", { depends_on: ["a"] })]).errors.length, 0);
});

test("buildLevelStates unlocks levels whose dependencies are mastered", () => {
  const states = buildLevelStates([
    level("root"),
    level("mid", { depends_on: ["root"] }),
    level("leaf", { depends_on: ["mid"] }),
  ]);
  assert.equal(states.get("root").effectiveStatus, "available");
  assert.equal(states.get("mid").effectiveStatus, "locked");
  assert.equal(states.get("leaf").effectiveStatus, "locked");
  const advanced = buildLevelStates([
    level("root", { status: "mastered", mastery: 88, verified_by: "ai-verified" }),
    level("mid", { depends_on: ["root"], status: "challenged" }),
  ]);
  assert.equal(advanced.get("mid").effectiveStatus, "challenged");
});

test("computeProgress counts mastered levels", () => {
  const progress = computeProgress([
    level("a", { status: "mastered" }),
    level("b", { status: "mastered" }),
    level("c"),
    level("d"),
  ]);
  assert.deepEqual(progress, { total: 4, mastered: 2, percent: 50 });
  assert.deepEqual(computeProgress([]), { total: 0, mastered: 0, percent: 0 });
});

test("projectsPayload derives cards from vault index documents", () => {
  const index = {
    generatedAt: "2026-09-08T00:00:00.000Z",
    documents: [
      { path: "60_learning/demo/index.md", fileName: "index.md", title: "演示项目",
        frontmatter: { type: "learning-project", title: "演示项目", slug: "demo", description: "合成演示", created: "2026-09-01T00:00:00+08:00", sources: [], levels: ["a", "b"] } },
      { path: "60_learning/demo/levels/a.md", fileName: "a.md", title: "A",
        frontmatter: { type: "learning-level", project: "demo", title: "A", status: "mastered", mastery: 90, depends_on: [] } },
      { path: "60_learning/demo/levels/b.md", fileName: "b.md", title: "B",
        frontmatter: { type: "learning-level", project: "demo", title: "B", status: "locked", mastery: 0, depends_on: ["a"] } },
      { path: "wiki/concepts/other.md", fileName: "other.md", title: "别的", frontmatter: {} },
    ],
  };
  const payload = projectsPayload(index);
  assert.equal(payload.total, 1);
  assert.equal(payload.projects[0].slug, "demo");
  assert.deepEqual(payload.projects[0].progress, { total: 2, mastered: 1, percent: 50 });
});

test("projectDetailPayload assembles dag with effective status and pass score", () => {
  const project = {
    frontmatter: { type: "learning-project", title: "演示", slug: "demo", description: "", created: "2026-09-01T00:00:00+08:00", sources: [], levels: ["a", "b"] },
    body: "简介",
  };
  const detail = projectDetailPayload(project, [
    level("a", { status: "mastered", mastery: 92, verified_by: "ai-verified" }),
    level("b", { depends_on: ["a"], pass_score: 90 }),
  ], new Map([["a", 2]]));
  assert.equal(detail.levels.length, 2);
  assert.equal(detail.levels[0].effectiveStatus, "mastered");
  assert.equal(detail.levels[0].attemptCount, 2);
  assert.equal(detail.levels[1].effectiveStatus, "available");
  assert.equal(detail.levels[1].passScore, 90);
  assert.deepEqual(detail.progress, { total: 2, mastered: 1, percent: 50 });
});
