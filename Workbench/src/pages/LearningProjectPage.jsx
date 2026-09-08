import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { QuestMap } from "../components/learning/QuestMap";

const STATUS_LABEL = { locked: "未解锁", available: "可挑战", challenged: "挑战中", mastered: "已通关" };

function LevelDrawer({ projectSlug, levelSlug, aiConfigured, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [submission, setSubmission] = useState("");
  const [refsText, setRefsText] = useState("");
  const [pending, setPending] = useState(null); // { attemptId, probes }
  const [answers, setAnswers] = useState([]);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [levelResponse, attemptsResponse] = await Promise.all([
      fetch(`/api/learning/projects/${projectSlug}/levels/${levelSlug}`),
      fetch(`/api/learning/projects/${projectSlug}/levels/${levelSlug}/attempts`),
    ]);
    setDetail(await levelResponse.json());
    setAttempts((await attemptsResponse.json()).attempts ?? []);
  }, [projectSlug, levelSlug]);

  useEffect(() => { void load(); }, [load]);

  const post = async (suffix, body) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/learning/projects/${projectSlug}/levels/${levelSlug}/${suffix}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? `HTTP ${response.status}`);
      return result;
    } catch (error) {
      setMessage(error.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const result = await post("submit", {
      content_md: submission,
      vault_refs: refsText.split("\n").map((line) => line.trim()).filter(Boolean),
    });
    if (!result) return;
    if (result.needsProbe) {
      setPending(result);
      setAnswers(result.probes.map(() => ""));
    } else {
      setMessage(result.verdict === "passed" ? `通关！得分 ${result.score}` : `未达标，得分 ${result.score}。${result.feedback ?? ""}`);
      setSubmission("");
      await load();
      onChanged();
    }
  };

  const answerProbe = async () => {
    const result = await post("probe", { attempt_id: pending.attemptId, answers });
    if (!result) return;
    setPending(null);
    setMessage(result.verdict === "passed" ? `追问通过，通关！得分 ${result.score}` : `追问未通过，得分 ${result.score}。${result.feedback ?? ""}`);
    await load();
    onChanged();
  };

  const retry = async () => {
    const result = await post("retry", {});
    if (result) await load();
  };

  const selfAssess = async () => {
    const result = await post("self-assess", {});
    if (result) {
      setMessage("已标记为自评掌握（与 AI 验证通关区分显示）。");
      await load();
      onChanged();
    }
  };

  if (!detail) return null;
  const status = detail.frontmatter.status;
  return (
    <aside className="learning-drawer" role="dialog" aria-label={`关卡 ${detail.frontmatter.title}`}>
      <button type="button" className="learning-link" onClick={onClose}>关闭</button>
      <h2>{detail.frontmatter.title}</h2>
      <p>
        状态：{STATUS_LABEL[status] ?? status} · 掌握度 {detail.frontmatter.mastery} · 过关线 {detail.frontmatter.pass_score ?? 80}
        {detail.frontmatter.verified_by === "self-assessed" ? " · 自评通关" : null}
        {detail.frontmatter.verified_by === "ai-verified" ? " · AI 验证通关" : null}
      </p>
      <h3>知识点笔记</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>{detail.notes}</p>
      <h3>挑战</h3>
      <p style={{ whiteSpace: "pre-wrap" }}>{detail.challenge}</p>
      <h3>评分细则</h3>
      <ul className="learning-rubric">
        {detail.rubric.map((entry) => <li key={entry.item}>[{entry.points}分] {entry.item}</li>)}
      </ul>

      {status !== "locked" && status !== "mastered" ? (
        <>
          <h3>提交产物</h3>
          <textarea rows={8} placeholder="粘贴代码、练习结果、讲解文字（Markdown）" value={submission} onChange={(event) => setSubmission(event.target.value)} />
          <textarea rows={2} placeholder="引用 Vault 文件路径（每行一个，可选）" value={refsText} onChange={(event) => setRefsText(event.target.value)} />
          <div className="learning-toolbar">
            <button type="button" className="learning-primary" disabled={busy || !submission.trim() || !aiConfigured} onClick={submit}>
              {busy ? "AI 评审中…" : "提交验证"}
            </button>
            <button type="button" className="learning-link" disabled={busy || !aiConfigured} onClick={retry}>换一道变体题</button>
            <button type="button" className="learning-link" disabled={busy} onClick={selfAssess}>手工自评掌握</button>
          </div>
        </>
      ) : null}

      {pending ? (
        <>
          <h3>追问环节</h3>
          {pending.probes.map((probe, index) => (
            <div key={probe}>
              <p>{probe}</p>
              <textarea rows={3} value={answers[index]} onChange={(event) => setAnswers(answers.map((value, i) => i === index ? event.target.value : value))} />
            </div>
          ))}
          <button type="button" className="learning-primary" disabled={busy || answers.some((answer) => !answer.trim())} onClick={answerProbe}>
            {busy ? "判定中…" : "提交追问回答"}
          </button>
        </>
      ) : null}

      {message ? <p className="learning-notice">{message}</p> : null}

      <h3>验证历史</h3>
      {attempts.length === 0 ? <p className="learning-empty">还没有验证记录。</p> : null}
      {attempts.map((attempt) => (
        <div key={attempt.id} className="learning-attempt">
          <strong>{attempt.created}</strong> · {attempt.verdict} · {attempt.score} 分
          <pre>{attempt.body.slice(0, 600)}</pre>
        </div>
      ))}
    </aside>
  );
}

export function LearningProjectPage() {
  const { projectSlug } = useParams();
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("map");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/learning/projects/${projectSlug}`);
    if (response.ok) setDetail(await response.json());
  }, [projectSlug]);

  useEffect(() => { void load(); }, [load]);

  if (!detail) return <div className="learning-page">加载中…</div>;

  return (
    <div className="learning-page">
      <PageHeader eyebrow="LEARNING QUEST" title={detail.title} description={detail.description} />
      <div className="learning-progress" aria-label={`项目进度 ${detail.progress.percent}%`}>
        <span className="learning-progress__bar" style={{ width: `${detail.progress.percent}%` }} />
      </div>
      <p className="learning-card__meta">已通关 {detail.progress.mastered} / {detail.progress.total} · {detail.progress.percent}%</p>
      <div className="learning-tabs" role="tablist">
        <button type="button" aria-pressed={tab === "map"} onClick={() => setTab("map")}>闯关地图</button>
        <button type="button" aria-pressed={tab === "list"} onClick={() => setTab("list")}>关卡管理</button>
      </div>

      {tab === "map" ? (
        <QuestMap levels={detail.levels} onSelect={(level) => setSelected(level.slug)} />
      ) : (
        <table className="learning-table">
          <thead>
            <tr><th>关卡</th><th>状态</th><th>掌握度</th><th>前置</th><th>验证次数</th></tr>
          </thead>
          <tbody>
            {detail.levels.map((level) => (
              <tr key={level.slug} onClick={() => setSelected(level.slug)} style={{ cursor: "pointer" }}>
                <td>{level.title}</td>
                <td>{STATUS_LABEL[level.effectiveStatus]}{level.verifiedBy === "self-assessed" ? "（自评）" : ""}</td>
                <td>{level.mastery}</td>
                <td>{level.dependsOn.join(", ") || "—"}</td>
                <td>{level.attemptCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected ? (
        <LevelDrawer
          projectSlug={projectSlug}
          levelSlug={selected}
          aiConfigured={detail.aiConfigured}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}
