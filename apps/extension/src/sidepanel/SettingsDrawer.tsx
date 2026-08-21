import { CheckCircle2, Download, Eye, EyeOff, KeyRound, PlugZap, Save, ServerCog, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { providerPresets, testAiConnection, type ProviderKind, type Settings } from "./extension-api";

interface Props {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onSave: (settings: Settings) => Promise<void>;
  onDiagnostics: () => void;
}

const providerOptions: { value: ProviderKind; label: string }[] = [
  { value: "atlas", label: "Atlas 托管代理" }, { value: "openai", label: "OpenAI 直连" }, { value: "compatible", label: "第三方兼容 API" },
];

export function SettingsDrawer({ open, settings, onClose, onSave, onDiagnostics }: Props) {
  const [draft, setDraft] = useState(settings);
  const [revealed, setRevealed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => setDraft(settings), [settings, open]);
  if (!open) return null;
  const direct = draft.connectionMode === "direct";
  const setProvider = (kind: ProviderKind) => {
    const preset = providerPresets[kind];
    setDraft({ ...draft, providerKind: kind, connectionMode: kind === "atlas" ? "proxy" : "direct", ...preset });
    setNotice(null);
  };
  const verify = async () => {
    setTesting(true); setNotice(null);
    try { await testAiConnection(draft); setNotice("连接正常，已获得服务响应。"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "连接测试失败"); }
    finally { setTesting(false); }
  };
  return <div className="drawer-backdrop" onMouseDown={onClose}>
    <aside className="drawer connection-drawer" onMouseDown={(event) => event.stopPropagation()}>
      <div className="drawer-title"><div><span className="eyebrow">MODEL CONTROL ROOM</span><h2>模型连接</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button></div>
      <div className="connection-rail"><span className={!direct ? "selected" : ""}><ServerCog size={14} />代理</span><i /><span className={direct ? "selected" : ""}><PlugZap size={14} />直连</span></div>
      <label className="field-label">模型服务商
        <select value={draft.providerKind} onChange={(event) => setProvider(event.target.value as ProviderKind)}>
          {providerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {draft.providerKind === "compatible" && <label className="field-label">服务商名称
        <input value={draft.providerName} onChange={(event) => setDraft({ ...draft, providerName: event.target.value })} placeholder="例如：企业模型网关" />
      </label>}
      <label className="field-label">模型 API 地址
        <input value={draft.apiBase} onChange={(event) => setDraft({ ...draft, apiBase: event.target.value })} placeholder={direct ? "https://api.example.com/v1" : "http://localhost:8787"} />
      </label>
      <div className="connection-grid">
        <label className="field-label">模型名称<input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} placeholder="gpt-5.4" /></label>
        <label className="field-label">API 协议<select value={draft.apiProtocol} onChange={(event) => setDraft({ ...draft, apiProtocol: event.target.value as Settings["apiProtocol"] })} disabled={!direct}>
          <option value="responses">Responses</option><option value="chat_completions">Chat Completions</option>
        </select></label>
      </div>
      <label className="field-label">推理强度
        <select value={draft.reasoningEffort} onChange={(event) => setDraft({ ...draft, reasoningEffort: event.target.value as Settings["reasoningEffort"] })}>
          <option value="none">关闭</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="xhigh">最高</option>
        </select>
      </label>
      <label className="field-label">{direct ? "模型 API Key" : "代理访问令牌"}
        <div className="input-with-icon"><input type={revealed ? "text" : "password"} value={direct ? draft.apiKey : draft.accessToken}
          onChange={(event) => setDraft(direct ? { ...draft, apiKey: event.target.value } : { ...draft, accessToken: event.target.value })} placeholder={direct ? "仅存于本机扩展设置" : "由代理服务签发"} />
          <button onClick={() => setRevealed(!revealed)} aria-label="显示密钥">{revealed ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
      </label>
      <label className="switch-row"><span><b>启用 AI 页面解析</b><small>关闭后页面内容不会发送到模型服务</small></span><input type="checkbox" checked={draft.aiEnabled} onChange={(event) => setDraft({ ...draft, aiEnabled: event.target.checked })} /></label>
      <div className={`connection-notice ${notice?.includes("正常") ? "success" : ""}`}>{notice?.includes("正常") ? <CheckCircle2 size={15} /> : <ShieldAlert size={15} />}<span>{notice ?? (direct ? "直连密钥会保存在扩展本地存储中；请只连接可信的 HTTPS 模型服务。" : "代理模式不会把模型 API Key 放入浏览器。")}</span></div>
      <div className="drawer-actions"><button className="outline" disabled={testing} onClick={verify}><KeyRound size={15} />{testing ? "测试中…" : "测试连接"}</button><button className="primary" onClick={async () => { await onSave(draft); onClose(); }}><Save size={16} />保存</button></div>
      <button className="diagnostic-link" onClick={onDiagnostics}><Download size={14} />导出本地诊断日志</button>
    </aside>
  </div>;
}
