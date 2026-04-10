# 剧本创作智能体

一个面向网文改编短剧场景的 AI 创作工作台，覆盖从原文导入、IP 价值评估、故事蓝图拆解、分集大纲生成，到单集剧本创作、全本审稿和批量优化的完整链路。

## 项目定位

这个项目不是通用聊天应用，而是一个专门服务于小说改编短剧生产流程的前端工具。它主要解决三类工作：

- 把小说原文拆解成可执行的故事蓝图和人物时间轴
- 把长篇内容压缩成适合短剧节奏的分集大纲和单集剧本
- 对生成后的剧本做审稿、对比、批量修订和版本管理

## 核心流程

项目当前的主流程如下：

1. 上传小说、集纲或剧本文件
2. 进行 IP 价值分析，评估短剧改编潜力
3. 生成故事蓝图，提取主线、暗线、人物阶段信息
4. 生成分集大纲，控制章节覆盖与总集数节奏
5. 生成单集剧本，支持第一人称解说和第三人称演绎
6. 进入审稿工坊，做全本审稿、单集审稿、剧本对比和批量优化

同时也支持三种快捷入口：

- 纯大纲模式：直接导入集纲进入剧本创作
- 纯审稿模式：直接导入剧本进入审稿中心
- 手动输入集纲：跳过前置拆解，直接进入创作工坊

## 技术栈

- Vite 6
- React 19
- TypeScript
- `mammoth`：解析 `.docx`
- `docx` + `file-saver`：导出文档
- `diff`：版本差异对比

## 目录结构

```text
.
├── App.tsx                     # 全局流程编排与状态恢复
├── components/
│   ├── FileUpload.tsx          # 项目入口与多模式导入
│   ├── IpAnalyzer.tsx          # IP 价值分析
│   ├── BlueprintEditor.tsx     # 故事蓝图与人物分析
│   ├── OutlineBuilder.tsx      # 分集大纲生成
│   ├── ScriptGenerator.tsx     # 单集剧本创作与修订
│   └── ScriptAuditor.tsx       # 审稿、对比、批量优化
├── services/
│   ├── apiClient.ts            # 统一模型路由与 API 调用
│   ├── aiTaskRunner.ts         # AI 任务重试、日志、进度
│   └── gemini/                 # 各阶段 Prompt 与结果解析
├── utils/
│   ├── fileParser.ts           # 小说/大纲/剧本解析
│   ├── projectPersistence.ts   # IndexedDB 持久化
│   └── docxGenerator.ts        # 导出能力
└── types.ts                    # 核心领域模型
```

## 开发环境

### 要求

- Node.js 18 及以上

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

默认开发地址：

- `http://localhost:3000`

### 生产构建

```bash
npm run build
```

### 本地预览构建产物

```bash
npm run preview
```

## 环境变量

在项目根目录创建 `.env.local`。

### 基础能力

```bash
VITE_API_KEY=your_default_api_key
```

用于默认 OpenAI 兼容接口调用。未显式指定供应商密钥时，项目会优先使用这个 Key。

### 可选供应商密钥

```bash
VITE_MIXAI_KEY_CLAUDE_SONNET_46=your_mixai_sonnet_key
VITE_MIXAI_KEY_CLAUDE_SONNET_45=your_mixai_sonnet45_key
VITE_MIXAI_KEY_CLAUDE_OPUS_45=your_mixai_opus_key
VITE_AIXJ_KEY=your_aixj_key
VITE_RSX_KEY=your_rsx_key
```

这些变量用于不同模型供应商的自动路由。

## 模型与供应商路由

项目通过 `services/apiClient.ts` 统一管理模型配置和请求分发。

- 默认分析模型：`claude-sonnet-4-6`
- 默认剧本生成模型：`[次]gemini-3-pro-preview-thinking`
- 默认审稿模型：`claude-opus-4-6-a`
- 默认兜底模型：`[次]gemini-3-pro-preview-thinking`

当前代码已支持按模型 ID 自动分流到不同供应商，例如：

- novai.su
- MixAI
- AIXJ
- RSX

## 主要能力

### 1. 文件导入与解析

- 支持 `.txt`、`.docx`
- 自动识别小说章节
- 自动解析分集大纲
- 自动按“第 X 集 / 第 X 场 / Episode X”等格式拆分剧本

### 2. IP 价值分析

- 8 维度评分
- 改编策略建议
- 短剧适配度评估
- 推荐 AI 短剧呈现类型
- 推荐叙事角度

### 3. 故事蓝图拆解

- 成长线
- 对抗线
- 羁绊线
- 暗线/宿命线
- 主线剧情阶段与大事件
- 人物时间轴状态机

### 4. 分集大纲生成

- 自动按章节范围切集
- 控制集数预算
- 匹配暗线铺设与回收节点
- 为每集预填人物状态和对应原文

### 5. 剧本创作工坊

- 第一人称解说
- 第三人称演绎
- AI 解析集纲补全创作参数
- AI 对话式修订
- 版本历史管理
- 文本差异对比

### 6. 审稿中心

- 全本深度审稿
- 单集审稿
- 增量审稿与分批审稿
- 多版本剧本对比
- 批量修复与优化

## 状态持久化

项目会把工作状态保存到 IndexedDB，支持恢复大体量小说、分析结果和中间草稿。保存时会自动移除运行期字段，恢复时再补回运行态。

## 构建与部署说明

- Vite `base` 当前配置为 `/novel-to-script/`
- `npm run deploy` 会先构建，再通过 `gh-pages` 发布 `dist`

如果部署目标不是 GitHub Pages，或路径不是 `/novel-to-script/`，需要同步调整 `vite.config.ts` 中的 `base` 配置。

## 当前仓库说明

仓库内还有若干历史文档和测试文件，例如：

- `PROJECT_HISTORY.md`
- `MODEL_TEST_REPORT.md`
- `OPUS_AND_BATCH_AUDIT.md`
- `test-models.js`

这些文件主要用于记录阶段性实验、修复说明和模型测试，不是运行项目的必要入口。

## 建议的后续维护

- 保持 `README.md` 与真实流程一致，避免再次退化成模板说明
- 新增模型或供应商时，同步更新环境变量说明
- 新增主流程步骤时，同步更新“核心流程”和“目录结构”章节
