import { Bot, CheckCircle2, CircleDashed, MessageCircle, Send, ShieldCheck, UserRound } from "lucide-react";

export interface DialogueEntry {
  id: string;
  role: "atlas" | "user";
  text: string;
  meta?: string;
  state?: "working" | "success" | "error";
}

interface Props {
  entries: DialogueEntry[];
  candidates?: number;
  characters?: number;
  redactions?: number;
  correction?: string;
  disabled?: boolean;
  onCorrectionChange?: (value: string) => void;
  onSendCorrection?: () => void;
}

export function AiDialogue({ entries, candidates, characters, redactions, correction, disabled, onCorrectionChange, onSendCorrection }: Props) {
  const editable = onCorrectionChange && onSendCorrection;
  return <section className="dialogue-panel" aria-label="Atlas 对话与工作记录">
    <div className="dialogue-heading"><div><span className="eyebrow">ATLAS TRACE</span><h2><MessageCircle size={17} />AI 在做什么</h2></div><span className="trace-tag">可追溯</span></div>
    <div className="dialogue-list">
      {entries.map((entry) => <article className={`dialogue-entry ${entry.role} ${entry.state ?? ""}`} key={entry.id}>
        <span className="dialogue-avatar">{entry.role === "user" ? <UserRound size={13} /> : entry.state === "working" ? <CircleDashed className="spin" size={14} /> : entry.state === "success" ? <CheckCircle2 size={14} /> : <Bot size={14} />}</span>
        <div><b>{entry.role === "user" ? "你" : "Atlas"}</b><p>{entry.text}</p>{entry.meta && <small>{entry.meta}</small>}</div>
      </article>)}
    </div>
    {candidates !== undefined && <div className="dialogue-privacy"><ShieldCheck size={15} /><span>发送的是脱敏语义摘要：{candidates} 个列表候选 · {characters?.toLocaleString()} 字符 · {redactions} 处脱敏</span></div>}
    {editable && <form className="correction-form" onSubmit={(event) => { event.preventDefault(); onSendCorrection(); }}>
      <label htmlFor="atlas-correction">继续告诉 AI 如何修改规则</label>
      <div><textarea id="atlas-correction" value={correction} maxLength={800} disabled={disabled} placeholder="例如：不要导演和主演，新增评分与评价人数" onChange={(event) => onCorrectionChange(event.target.value)} />
        <button className="primary" type="submit" disabled={disabled || !correction?.trim()}><Send size={15} />修改规则</button></div>
      <small>AI 只会重写可检查的采集规则；修改前后的字段均可在本页核对。</small>
    </form>}
  </section>;
}
