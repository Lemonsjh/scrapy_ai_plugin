import { ArrowLeft, ArrowRight, Bot, Check, ChevronRight, Crosshair, Database, LoaderCircle, Save, ScanSearch, Settings as SettingsIcon, ShieldCheck, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExtractionPlan, FieldMatch, JobRecord, RowData, SemanticPageSnapshot, SnapshotResponse } from "@atlas/shared";
import { ExtractionPlanSchema } from "@atlas/shared";
import { PlanEditor } from "./PlanEditor";
import { ResultsView } from "./ResultsView";
import { SettingsDrawer } from "./SettingsDrawer";
import { AiDialogue, type DialogueEntry } from "./AiDialogue";
import { activeTab, analyzePage, defaultSettings, getLatestJob, getRows, inspectPage, loadSettings, previewPlan, runtimeMessage, saveSettings, tabMessage, type Settings } from "./extension-api";

type Step = "intent" | "plan" | "results";

const manualPlan = (): ExtractionPlan => ({
  mode: "list", rowSelectors: ["body"],
  fields: [{ id: "field_1", name: "字段 1", selectors: ["body"], source: "text", required: false, confidence: 0, transforms: [{ type: "trim" }] }],
  pagination: { type: "none" }, filters: [],
  limits: { maxPages: 10, maxRows: 1000, maxDurationMs: 600000, delayMs: 1000 }, deduplicateBy: [],
});

function readableError(cause: unknown, fallback: string) {
  const message = cause instanceof Error ? cause.message : fallback;
  return message.length > 240 ? `${message.slice(0, 237)}…` : message;
}

export default function App() {
  const [step, setStep] = useState<Step>("intent");
  const [intent, setIntent] = useState("");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedTemplate, setSavedTemplate] = useState<{ plan: ExtractionPlan; intent: string } | null>(null);
  const [inspection, setInspection] = useState<SnapshotResponse | null>(null);
  const [plan, setPlan] = useState<ExtractionPlan | null>(null);
  const [matches, setMatches] = useState<FieldMatch[]>([]);
  const [previewRows, setPreviewRows] = useState<RowData[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [job, setJob] = useState<JobRecord | null>(null);
  const [rows, setRows] = useState<RowData[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const [dialogue, setDialogue] = useState<DialogueEntry[]>([{
    id: "welcome", role: "atlas", text: "我会先在本地识别重复列表并清洗页面摘要，再生成可以逐项核对的采集规则。",
    meta: "不会读取密码、表单输入、Cookie 或本地存储。",
  }]);

  const addDialogue = (entry: Omit<DialogueEntry, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDialogue((items) => [...items, { ...entry, id }].slice(-8));
    return id;
  };
  const updateDialogue = (id: string, patch: Partial<DialogueEntry>) => setDialogue((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));

  useEffect(() => {
    void loadSettings().then(setSettings);
    void Promise.all([activeTab(), chrome.storage.local.get("templates")]).then(([tab, stored]) => {
      const template = (stored.templates as Record<string, { plan: ExtractionPlan; intent: string }> | undefined)?.[new URL(tab.url).origin];
      if (template) setSavedTemplate(template);
    }).catch(() => undefined);
    void getLatestJob().then((latest) => {
      if (latest && ["running", "paused"].includes(latest.status)) { setJob(latest); setPlan(latest.plan); setStep("results"); }
    }).catch(() => undefined);
  }, []);

  const refreshJob = useCallback(async () => {
    if (!job) return;
    const latest = await runtimeMessage<JobRecord>({ type: "GET_JOB", jobId: job.id });
    if (latest) {
      setJob(latest);
      setRows(await getRows(latest.id));
    }
  }, [job?.id]);

  useEffect(() => {
    if (step !== "results" || !job) return;
    void refreshJob();
    const timer = window.setInterval(() => void refreshJob(), 800);
    return () => window.clearInterval(timer);
  }, [step, job?.id, refreshJob]);

  useEffect(() => {
    const listener = (message: { type?: string; fieldId?: string; selectors?: string[] }) => {
      if (message.type !== "PICKER_RESULT" || !plan || !message.fieldId || !message.selectors) return;
      const updated = message.fieldId === "__row__"
        ? { ...plan, rowSelectors: message.selectors }
        : { ...plan, fields: plan.fields.map((field) => field.id === message.fieldId ? { ...field, selectors: message.selectors!, confidence: 1 } : field) };
      setPlan(updated);
      void updatePreview(updated);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [plan]);

  const updatePreview = async (nextPlan: ExtractionPlan) => {
    try {
      const result = await previewPlan(nextPlan);
      setMatches(result.matches); setPreviewRows(result.rows);
    } catch (cause) { setError(readableError(cause, "预览失败")); }
  };

  const inspect = async () => {
    setBusy("正在本地整理页面…"); setError(null);
    addDialogue({ role: "user", text: intent.trim() });
    const traceId = addDialogue({ role: "atlas", state: "working", text: "正在本地检查页面结构，寻找重复的列表行与可用字段。" });
    try {
      const result = await inspectPage(); setInspection(result);
      updateDialogue(traceId, { state: "success", text: "本地页面检查完成，已生成可发送的脱敏摘要。", meta: `${result.summary.candidates} 个候选列表 · ${result.summary.characters.toLocaleString()} 字符 · ${result.summary.redactions} 处脱敏` });
    } catch (cause) {
      const message = readableError(cause, "页面检查失败");
      setError(message); updateDialogue(traceId, { state: "error", text: "页面检查未完成。", meta: message });
    }
    finally { setBusy(null); }
  };

  const parseWithAi = async () => {
    if (!inspection) return inspect();
    setBusy("AI 正在建立字段地图…"); setError(null);
    const traceId = addDialogue({ role: "atlas", state: "working", text: "正在根据你的需求分析脱敏摘要，并生成声明式采集规则。", meta: `${settings.providerName} · ${settings.model}` });
    try {
      const tab = await activeTab();
      const result = await analyzePage({
        intent, page: { url: tab.url, title: tab.title ?? "", language: navigator.language }, snapshot: inspection.snapshot,
      }, settings);
      setPlan(result.plan); setWarnings(result.warnings); await updatePreview(result.plan); setStep("plan");
      updateDialogue(traceId, { state: "success", text: "规则已生成，并已在当前页面做了字段匹配预览。", meta: `${result.plan.fields.length} 个字段 · ${result.plan.rowSelectors.length} 个列表候选` });
    } catch (cause) {
      const message = readableError(cause, "AI 解析失败");
      setError(message); updateDialogue(traceId, { state: "error", text: "AI 未能生成可用规则。", meta: message });
    }
    finally { setBusy(null); }
  };

  const reviseWithAi = async () => {
    if (!inspection || !plan || !correction.trim()) return;
    const request = correction.trim();
    setBusy("AI 正在修改规则…"); setError(null); setCorrection("");
    addDialogue({ role: "user", text: request });
    const traceId = addDialogue({ role: "atlas", state: "working", text: "正在以当前规则为基础处理你的修改要求。" });
    try {
      const tab = await activeTab();
      const result = await analyzePage({
        intent, page: { url: tab.url, title: tab.title ?? "", language: navigator.language }, snapshot: inspection.snapshot,
        previousPlan: plan, correction: request,
      }, settings);
      setPlan(result.plan); setWarnings(result.warnings); await updatePreview(result.plan);
      updateDialogue(traceId, { state: "success", text: "规则已根据你的要求更新，并重新完成字段预览。", meta: `${result.plan.fields.length} 个字段等待你确认` });
    } catch (cause) {
      const message = readableError(cause, "AI 修改失败");
      setError(message); setCorrection(request); updateDialogue(traceId, { state: "error", text: "这次修改没有完成，原规则保持不变。", meta: message });
    } finally { setBusy(null); }
  };

  const createManual = async () => {
    const next = manualPlan(); setPlan(next); setWarnings(["手动模式：请先点选列表行，再逐个点选字段。"]); setStep("plan"); await updatePreview(next);
  };

  const startJob = async () => {
    if (!plan) return;
    const parsed = ExtractionPlanSchema.safeParse(plan);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "规则无效");
    if (matches.some((match) => match.count === 0)) return setError("存在没有匹配结果的字段，请重新点选或删除");
    if ((plan.limits.maxPages > 10 || plan.limits.maxRows > 1000) && !confirm("当前范围超过默认安全限制，确认继续吗？")) return;
    setBusy("正在启动任务…"); setError(null);
    try {
      const tab = await activeTab();
      const created = await runtimeMessage<JobRecord>({ type: "START_JOB", plan: parsed.data, url: tab.url });
      setJob(created); setRows([]); setStep("results");
    } catch (cause) { setError(readableError(cause, "任务启动失败")); }
    finally { setBusy(null); }
  };

  const saveTemplate = async () => {
    if (!plan) return;
    const tab = await activeTab();
    const origin = new URL(tab.url).origin;
    const stored = await chrome.storage.local.get("templates");
    const templates = { ...(stored.templates ?? {}), [origin]: { plan, intent, updatedAt: Date.now() } };
    await chrome.storage.local.set({ templates });
    setWarnings((items) => [...items.filter((item) => !item.startsWith("已保存")), `已保存 ${origin} 的采集模板。`]);
  };

  const invalidCount = useMemo(() => matches.filter((match) => match.count === 0).length, [matches]);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark"><span>A</span></div><div className="brand"><b>ATLAS</b><small>AI DATA WORKBENCH</small></div>
      <div className="step-track"><span className={step === "intent" ? "active" : "done"}>01</span><i /><span className={step === "plan" ? "active" : step === "results" ? "done" : ""}>02</span><i /><span className={step === "results" ? "active" : ""}>03</span></div>
      <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="设置"><SettingsIcon size={18} /></button>
    </header>

    <main>
      {step === "intent" && <>
        <section className="intro"><span className="eyebrow">INTENT CONSOLE · 01</span><h1>说出你要的<br/><em>数据形状。</em></h1><p>Atlas 会在本地压缩页面结构，再让 AI 生成可检查、可修正的采集规则。</p></section>
        <section className="intent-card">
          <div className="card-label"><Bot size={15} /><span>采集需求</span><small>{intent.length}/2000</small></div>
          <textarea value={intent} maxLength={2000} placeholder="例如：采集电影名、评分、评价人数和链接，最多 3 页" onChange={(event) => setIntent(event.target.value)} />
          <div className="intent-actions"><button className="text-button" onClick={createManual}><Crosshair size={15} />手动创建</button>
            <button className="primary" disabled={!!busy || intent.trim().length < 3} onClick={inspection ? parseWithAi : inspect}>
              {busy ? <LoaderCircle className="spin" size={17} /> : inspection ? <Sparkles size={17} /> : <ScanSearch size={17} />}
              {busy ?? (inspection ? "AI 解析" : "检查页面")}<ArrowRight size={16} />
            </button></div>
        </section>
        {inspection && <section className="snapshot-card">
          <div className="snapshot-icon"><ShieldCheck size={20} /></div><div><b>发送前摘要</b><p>{inspection.summary.candidates} 个候选列表 · {inspection.summary.characters.toLocaleString()} 字符 · {inspection.summary.redactions} 处脱敏</p></div>
          <span className="safe-tag">LOCAL CLEAN</span>
        </section>}
        <AiDialogue entries={dialogue} candidates={inspection?.summary.candidates} characters={inspection?.summary.characters} redactions={inspection?.summary.redactions} />
        {savedTemplate && <button className="template-callout" onClick={async () => {
          setIntent(savedTemplate.intent); setPlan(savedTemplate.plan); await updatePreview(savedTemplate.plan); setStep("plan");
        }}><span><b>发现当前站点模板</b><small>{savedTemplate.plan.fields.length} 个字段 · 一键复用</small></span><ChevronRight size={18} /></button>}
        <div className="feature-strip"><span><Database size={15} />数据留在本机</span><span><Check size={15} />规则执行可追溯</span></div>
      </>}

      {step === "plan" && plan && <>
        <div className="page-heading"><button className="icon-button" onClick={() => setStep("intent")}><ArrowLeft size={18} /></button><div><span className="eyebrow">RULE REVIEW · 02</span><h1>确认采集规则</h1></div><button className="outline small" onClick={saveTemplate}><Save size={14} />模板</button></div>
        {warnings.map((warning, index) => <div className="warning-banner" key={index}>{warning}</div>)}
        <AiDialogue entries={dialogue} candidates={inspection?.summary.candidates} characters={inspection?.summary.characters} redactions={inspection?.summary.redactions}
          correction={correction} disabled={!!busy || !inspection} onCorrectionChange={setCorrection} onSendCorrection={reviseWithAi} />
        <PlanEditor plan={plan} matches={matches} onChange={(next) => { setPlan(next); void updatePreview(next); }}
          onPick={(fieldId) => void tabMessage({ type: "START_PICKER", fieldId })}
          onHighlight={(fieldId) => void tabMessage({ type: "HIGHLIGHT_FIELD", plan, fieldId })} />
        <section className="preview-strip"><span className="eyebrow">PREVIEW</span><b>{previewRows.length}</b><span>行样本</span><i />
          <b className={invalidCount ? "bad-text" : "good-text"}>{invalidCount}</b><span>异常字段</span></section>
        <button className="primary wide sticky-action" disabled={invalidCount > 0 || !!busy} onClick={startJob}>确认并开始采集<ChevronRight size={17} /></button>
      </>}

      {step === "results" && job && <>
        <div className="page-heading"><button className="icon-button" onClick={() => setStep("plan")}><ArrowLeft size={18} /></button><div><span className="eyebrow">COLLECTION · 03</span><h1>任务数据流</h1></div></div>
        <ResultsView job={job} rows={rows} onControl={(action) => void runtimeMessage({ type: action === "pause" ? "PAUSE_JOB" : action === "resume" ? "RESUME_JOB" : "CANCEL_JOB", jobId: job.id }).then(refreshJob)}
          onExport={(format) => void runtimeMessage({ type: "EXPORT_ROWS", jobId: job.id, format })} />
      </>}
      {error && <div className="toast-error" onClick={() => setError(null)}>{error}<span>×</span></div>}
    </main>
    <SettingsDrawer open={settingsOpen} settings={settings} onClose={() => setSettingsOpen(false)} onSave={async (next) => { await saveSettings(next); setSettings(next); }}
      onDiagnostics={() => void runtimeMessage({ type: "GET_DIAGNOSTICS" }).then((diagnostics) => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(diagnostics, null, 2)], { type: "application/json" }));
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = `atlas-diagnostics-${Date.now()}.json`; anchor.click(); URL.revokeObjectURL(url);
      })} />
  </div>;
}
