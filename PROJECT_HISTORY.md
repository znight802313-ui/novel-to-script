# NovelToScript AI Studio - 项目迭代记录

> 本文档记录项目开发过程中的关键交互和迭代历史，方便后续开发时快速了解项目背景。

---

## 项目概述

**项目名称**: NovelToScript AI Studio (剧本创作智能体)
**技术栈**: React + TypeScript + Vite + Tailwind CSS
**核心功能**: 长篇小说影视化改编引擎，从解构蓝图到剧本生成的一站式 AI 赋能平台

### 主要模块

1. **FileUpload** - 首页文件上传，支持三种模式入口
2. **BlueprintEditor** - Step 1: 故事蓝图解构（成长线、冲突线、关系线、暗线）
3. **OutlineBuilder** - Step 2: 分集大纲重构
4. **ScriptGenerator** - Step 3: 剧本生成工作台
5. **ScriptAuditor** - Step 4: AI 主编审稿台

### 核心服务

- **geminiService.ts** - AI API 调用封装，支持多模型切换
- **apiClient.ts** - 统一 API 客户端
- **fileParser.ts** - 文件解析工具
- **docxGenerator.ts** - DOCX 导出功能

---

## 版本迭代记录

### v1.0.0 (2026-02-06) - 初始版本

**功能完成**:
- 小说全流程改编：故事蓝图解构 → 人物小传提取 → 分集大纲生成 → 剧本创作
- 大纲直出剧本：支持文件上传或手动输入集纲，可增删集数、设置生成字数
- AI 剧本生成：支持多模型切换，自动分析大纲提取人物/世界观/钩子
- AI 主编审稿：7维度深度审核（逻辑/节奏/人设/改编/情绪/画面/情节）
- 剧本精修工坊：AI 对话式修改、版本历史管理、差异对比
- 剧本对比评分：多版本剧本横向对比，AI 评选最优方案

**当日迭代内容**:

1. **剧本生成到审稿的流程打通**
   - 问题：剧本生成完成后无法直接进入审稿界面，两个环节是解耦的
   - 解决：
     - 在 `ScriptGenerator` 添加 `onGoToAudit` 回调
     - 在侧边栏添加"进入审稿"按钮（当有已完成剧本时显示）
     - 在 `App.tsx` 添加 `goToAudit()` 函数处理状态切换
     - 优化上下文传递：收集已使用的原文内容、大纲信息

2. **默认模型更换**
   - 需求：将默认模型更换为 Gemini 3 Pro
   - 实现：调整 `AVAILABLE_MODELS` 数组顺序，将 `[次]gemini-3-pro-preview-thinking` 移到首位
   - 注意：不是新增模型，而是使用已有的模型 ID

3. **单集精修与全本通审数据同步**
   - 问题：在"单集精修"模式修改的剧本，切换到"全本通审"后不同步
   - 解决方案：
     - 创建统一的 `episodeScripts` 状态存储每集剧本
     - 实现 `updateScript()` 函数统一处理两种模式的更新
     - 全本模式修改时，尝试按集数标记分割并分配到各集
     - 单集模式修改时，直接更新对应集的数据
     - 审稿报告、聊天历史、版本历史保持分模式独立缓存

4. **首页版本记录**
   - 在 `FileUpload` 组件添加版本历史展示
   - 可折叠的版本记录面板，显示各版本更新内容

5. **大纲直出剧本功能增强**
   - 支持手动输入集纲（不上传文件也能进入）
   - 支持增删集数（侧边栏添加/删除按钮）
   - 支持设置每集目标字数（200-5000字可调）
   - Episode 类型新增 `targetWordCount` 字段
   - 生成剧本时会根据目标字数调整 prompt

---

## 关键代码位置

### 状态管理

- **ProjectState** 定义: [types.ts:246-261](types.ts#L246-L261)
- **AppStep 枚举**: [types.ts:263-269](types.ts#L263-L269)
- **Episode 类型**: [types.ts:215-244](types.ts#L215-L244)

### 审稿系统

- **AuditReport 类型**: [types.ts:56-63](types.ts#L56-L63)
- **AuditAnnotation 类型**: [types.ts:42-54](types.ts#L42-L54)
- **深度审稿 Prompt**: [geminiService.ts:1420-1552](services/geminiService.ts#L1420-L1552)

### 模型配置

- **AVAILABLE_MODELS**: [geminiService.ts:6-13](services/geminiService.ts#L6-L13)
- 当前默认模型: `[次]gemini-3-pro-preview-thinking`

### 剧本同步逻辑

- **episodeScripts 状态**: [ScriptAuditor.tsx:28-35](components/ScriptAuditor.tsx#L28-L35)
- **updateScript 函数**: [ScriptAuditor.tsx:55-96](components/ScriptAuditor.tsx#L55-L96)

---

## 开发注意事项

1. **模型 ID 格式**
   - 带 `[次]` 前缀的是按次计费模型
   - 不带前缀的是 MixAI 模型
   - 修改默认模型时调整数组顺序，不要新增

2. **审稿评分标准**
   - 节奏压缩是短剧改编的核心维度
   - 评分标准极度严格，大多数剧本应在 50-70 分区间
   - 节奏拖沓是致命伤，会直接限制总分上限

3. **状态同步**
   - 剧本数据在单集/全本模式间共享
   - 审稿报告、聊天历史、版本历史分模式独立
   - 切换模式时会自动保存和恢复对应缓存

4. **文件解析**
   - 支持 .txt 和 .docx 格式
   - 章节识别基于正则匹配（第X章）
   - 集数识别基于正则匹配（第X集）

---

## 待优化项

- [ ] 审稿结果导出功能
- [ ] 多人协作支持
- [ ] 剧本模板库
- [ ] 历史项目管理

---

*最后更新: 2026-02-06*
