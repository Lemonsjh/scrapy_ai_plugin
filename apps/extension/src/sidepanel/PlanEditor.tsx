import { Crosshair, Eye, FileText, Link2, Plus, Trash2 } from "lucide-react";
import type { ExtractionPlan, FieldMatch, FieldRule } from "@atlas/shared";

interface Props {
  plan: ExtractionPlan;
  matches: FieldMatch[];
  onChange: (plan: ExtractionPlan) => void;
  onPick: (fieldId: string) => void;
  onHighlight: (fieldId: string) => void;
}

const sources: { value: FieldRule["source"]; label: string }[] = [
  { value: "text", label: "文本" }, { value: "href", label: "链接" },
  { value: "src", label: "图片" }, { value: "attribute", label: "属性" }, { value: "html", label: "HTML" },
];

export function PlanEditor({ plan, matches, onChange, onPick, onHighlight }: Props) {
  const updateField = (id: string, patch: Partial<FieldRule>) => onChange({
    ...plan, fields: plan.fields.map((field) => field.id === id ? { ...field, ...patch } : field),
  });
  const removeField = (id: string) => onChange({ ...plan, fields: plan.fields.filter((field) => field.id !== id) });
  const addField = () => {
    const id = `field_${Date.now().toString(36)}`;
    onChange({ ...plan, fields: [...plan.fields, {
      id, name: "新字段", selectors: ["*"], source: "text", required: false, confidence: 0, transforms: [{ type: "trim" }],
    }] });
  };
  const linkFields = plan.fields.filter((field) => field.source === "href");
  const enableDetails = () => {
    const link = linkFields[0];
    if (!link) return;
    onChange({ ...plan, detail: {
      linkFieldId: link.id, maxItems: Math.min(plan.limits.maxRows, 100), delayMs: 400,
      fields: [{ id: "detail_content", name: "正文", selectors: ["article", ".article", "main", "[role='main']", ".article-content", ".content"], source: "text", required: false, confidence: 0.5, transforms: [{ type: "trim" }] }],
    } });
  };
  const updateDetail = (patch: Partial<NonNullable<ExtractionPlan["detail"]>>) => plan.detail && onChange({ ...plan, detail: { ...plan.detail, ...patch } });
  const updateDetailField = (id: string, patch: Partial<FieldRule>) => plan.detail && updateDetail({ fields: plan.detail.fields.map((field) => field.id === id ? { ...field, ...patch } : field) });
  const addDetailField = () => plan.detail && updateDetail({ fields: [...plan.detail.fields, {
    id: `detail_${Date.now().toString(36)}`, name: "详情字段", selectors: ["article"], source: "text", required: false, confidence: 0.5, transforms: [{ type: "trim" }],
  }] });
  return <>
    <section className="row-selector-card">
      <div><span className="eyebrow">ROW ROOT</span><b>列表行容器</b><code>{plan.rowSelectors[0]}</code></div>
      <button className="outline small" onClick={() => onPick("__row__")}><Crosshair size={14} />重新点选</button>
    </section>
    <div className="section-heading"><div><span className="eyebrow">FIELD MAP</span><h2>字段映射</h2></div><button className="icon-button dark" onClick={addField}><Plus size={18} /></button></div>
    <div className="field-stack">
      {plan.fields.map((field, index) => {
        const count = matches.find((match) => match.fieldId === field.id)?.count ?? 0;
        const tone = count === 0 ? "danger" : field.confidence < 0.8 ? "warning" : "good";
        return <article className={`field-card ${tone}`} key={field.id}>
          <div className="field-index">{String(index + 1).padStart(2, "0")}</div>
          <div className="field-main">
            <div className="field-topline">
              <input className="field-name" value={field.name} onChange={(event) => updateField(field.id, { name: event.target.value })} />
              <span className={`match-pill ${tone}`}>{count} 匹配</span>
            </div>
            <div className="field-config">
              <select value={field.source} onChange={(event) => updateField(field.id, { source: event.target.value as FieldRule["source"] })}>
                {sources.map((source) => <option value={source.value} key={source.value}>{source.label}</option>)}
              </select>
              <code title={field.selectors.join("\n")}>{field.selectors[0]}</code>
            </div>
            <div className="confidence"><span style={{ width: `${field.confidence * 100}%` }} /><small>AI {Math.round(field.confidence * 100)}%</small></div>
          </div>
          <div className="field-actions">
            <button title="在页面中查看" onClick={() => onHighlight(field.id)}><Eye size={15} /></button>
            <button title="重新点选" onClick={() => onPick(field.id)}><Crosshair size={15} /></button>
            <button title="删除字段" onClick={() => removeField(field.id)}><Trash2 size={15} /></button>
          </div>
        </article>;
      })}
    </div>
    <section className="detail-card">
      <div className="section-heading compact"><div><span className="eyebrow">DETAIL FOLLOW-UP</span><h2><FileText size={16} />文章详情页</h2></div>
        {plan.detail ? <button className="outline small" onClick={() => onChange({ ...plan, detail: undefined })}>关闭</button>
          : <button className="outline small" disabled={!linkFields.length} onClick={enableDetails}><Link2 size={14} />采集正文</button>}</div>
      {!plan.detail && <p>{linkFields.length ? "启用后，Atlas 会在同一站点逐篇读取文章详情并合并正文。默认最多 100 篇。" : "先将一个列表字段的来源改为“链接”，才能定位文章详情页。"}</p>}
      {plan.detail && <>
        <div className="detail-controls"><label>详情链接<select value={plan.detail.linkFieldId} onChange={(event) => updateDetail({ linkFieldId: event.target.value })}>
          {linkFields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
          <label>最多文章<input type="number" min="1" max="1000" value={plan.detail.maxItems} onChange={(event) => updateDetail({ maxItems: Number(event.target.value) })} /></label></div>
        <div className="detail-field-stack">{plan.detail.fields.map((field) => <div className="detail-field" key={field.id}>
          <input value={field.name} aria-label="详情字段名称" onChange={(event) => updateDetailField(field.id, { name: event.target.value })} />
          <select value={field.source} aria-label="详情字段来源" onChange={(event) => updateDetailField(field.id, { source: event.target.value as FieldRule["source"] })}>
            {sources.filter((source) => source.value !== "attribute").map((source) => <option value={source.value} key={source.value}>{source.label}</option>)}</select>
          <input value={field.selectors[0]} aria-label="详情字段选择器" onChange={(event) => updateDetailField(field.id, { selectors: [event.target.value] })} />
          <button title="删除详情字段" onClick={() => updateDetail({ fields: plan.detail!.fields.filter((item) => item.id !== field.id) })}><Trash2 size={14} /></button>
        </div>)}</div>
        <button className="text-button detail-add" onClick={addDetailField}><Plus size={14} />添加详情字段</button>
        <small>仅请求同域文章链接；详情页脚本渲染或字段缺失时，该字段会保留为空。</small>
      </>}
    </section>
    <section className="execution-card">
      <div className="section-heading compact"><div><span className="eyebrow">GUARDRAILS</span><h2>执行边界</h2></div><span className="filter-count">{plan.filters.length} 条过滤</span></div>
      <div className="limit-grid">
        <label>最大页数<input type="number" min="1" max="100" value={plan.limits.maxPages}
          onChange={(event) => onChange({ ...plan, limits: { ...plan.limits, maxPages: Number(event.target.value) } })} /></label>
        <label>最大行数<input type="number" min="1" max="100000" value={plan.limits.maxRows}
          onChange={(event) => onChange({ ...plan, limits: { ...plan.limits, maxRows: Number(event.target.value) } })} /></label>
        <label>翻页间隔(ms)<input type="number" min="0" max="60000" step="100" value={plan.limits.delayMs}
          onChange={(event) => onChange({ ...plan, limits: { ...plan.limits, delayMs: Number(event.target.value) } })} /></label>
        <label>翻页方式<select value={plan.pagination.type} onChange={(event) => {
          const type = event.target.value;
          onChange({ ...plan, pagination: type === "none" ? { type: "none" } : type === "infinite_scroll"
            ? { type: "infinite_scroll", idleMs: 1500, maxNoChangeRounds: 3 }
            : { type: "next_button", selectors: ["a[rel='next']", ".next"] } });
        }}><option value="none">仅当前页</option><option value="next_button">下一页按钮</option><option value="infinite_scroll">无限滚动</option></select></label>
      </div>
      {plan.filters.map((filter, index) => <div className="filter-rule" key={`${filter.fieldId}-${index}`}>
        <span>{plan.fields.find((field) => field.id === filter.fieldId)?.name ?? filter.fieldId}</span>
        <code>{filter.operator}</code><b>{String(filter.value)}</b>
      </div>)}
    </section>
  </>;
}
