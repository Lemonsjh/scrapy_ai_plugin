# Atlas AI 数据采集台

Atlas 是一个本地优先的 Chrome / Edge Manifest V3 数据采集插件。用户用自然语言描述目标数据，AI 只负责生成经过严格校验的声明式规则；页面采集、过滤、翻页、去重和导出均由确定性代码执行。

## 已实现能力

- AI 解析中文采集意图和脱敏语义 DOM
- 页面列表候选识别、字段匹配数与置信度检查
- 手动点选列表行和字段，AI 不可用时仍能工作
- 文本、HTML、链接、图片和属性采集
- 预定义清洗、数字/日期解析、过滤和去重
- 当前页、下一页及无限滚动任务
- IndexedDB 任务与结果持久化、暂停、恢复和取消
- CSV、JSON、XLSX 导出及站点模板复用
- 页面快照大小限制、敏感信息脱敏和发送前摘要
- Bearer 测试令牌、服务端限流、OpenAI Structured Outputs

## 本地启动

要求 Node.js 22+ 与 pnpm 11+。

```powershell
pnpm install
Copy-Item apps/api/.env.example apps/api/.env
```

编辑 `apps/api/.env`：

```dotenv
OPENAI_API_KEY=你的_OpenAI_API_Key
OPENAI_MODEL=gpt-5.4
BETA_ACCESS_TOKENS=自行生成的长随机测试令牌
PORT=8787
HOST=127.0.0.1
```

构建并启动代理：

```powershell
pnpm build
pnpm --filter @atlas/api start
```

打开 `chrome://extensions` 或 `edge://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，加载：

```text
apps/extension/dist
```

点击浏览器工具栏中的 Atlas 图标，打开设置后可以直接选择三种连接方式：

- `Atlas 托管代理`：填写本地代理地址和测试访问令牌；模型由侧边栏选择，但代理会按 `ALLOWED_MODELS` 允许列表校验。
- `OpenAI 直连`：填写 `https://api.openai.com/v1`、模型名称和 OpenAI API Key；可选 Responses 或 Chat Completions。
- `第三方兼容 API`：填写服务商名称、其 OpenAI-compatible API 地址、模型、协议和 API Key。兼容性取决于服务商是否支持浏览器 CORS 与对应协议。

代理模式的默认地址为 `http://localhost:8787`，访问令牌应与 `BETA_ACCESS_TOKENS` 中的一项一致。直连密钥保存在扩展的本地存储中，不会上传到 Atlas 代理；请只使用可信的 HTTPS 服务商，并可随时在设置中替换或清空密钥。

然后打开普通 HTTP/HTTPS 页面并开始采集。插件只在用户点击后向活动标签页注入采集器。

## 验证命令

```powershell
pnpm typecheck
pnpm test
pnpm build
```

AI 基准页面位于 `apps/extension/tests/fixtures`，`benchmark.json` 描述了十个固定场景及期望字段。真实模型准确率测试需要配置 API Key 后单独执行，常规单元测试不会产生模型费用。

## 隐私与安全边界

- 不读取密码框、表单值、Cookie、Local Storage 或请求头。
- 不发送完整 HTML；仅发送最多 60,000 字符的语义 DOM 样本。
- 邮箱、手机号和疑似 Token 在本地脱敏。
- 使用代理模式时，OpenAI API Key 只存在代理服务环境变量中，模型请求使用 `store: false`；直连模式由用户在插件设置中自行管理 API Key。
- 模型结果必须通过 Zod Schema；不支持 `eval`、脚本、远程代码或任意转换。
- 默认上限为 10 页、1,000 行、10 分钟，超出默认范围需要确认。

## 当前限制

MVP 不处理详情页联动、验证码、网络响应拦截、跨域 iframe、关闭的 Shadow DOM、Canvas/PDF 页面或云端同步。全页跳转翻页会按同源活动任务自动尝试恢复；目标站点主动撤销页面访问能力时需要重新启动任务。

## 工程结构

```text
apps/extension  React Side Panel、Content Script、Service Worker
apps/api        Fastify/OpenAI 代理
packages/shared Zod Schema、任务与消息类型
```
