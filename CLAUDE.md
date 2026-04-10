# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器 (http://localhost:3000)
npm run build        # 生产构建
npm run preview      # 预览生产构建
npm run deploy       # 构建并部署到 GitHub Pages (base path: /novel-to-script/)
```

API keys are configured in `.env.local` via environment variables — never hardcode them.

## Architecture Overview

**noveltoscript-ai-studio** is a Vite + React 19 application that converts novels into video scripts through a 4-step pipeline.

### Step Flow (AppStep enum)

```
UPLOAD → BLUEPRINT → OUTLINE → SCRIPT → AUDIT
```

- **Upload**: Novel file ingestion (.docx, .doc, .txt via mammoth/docx)
- **Blueprint**: AI deconstructs story into a `StoryBlueprint` with 5 narrative arcs (growth, conflict, relationship, mystery, main plot) and character analysis
- **Outline**: AI generates `Episode` outlines planning how story content maps to individual episodes
- **Script**: AI converts episodes into formatted scripts using either first-person narration (口播解说) or third-person dramatic (第三人称演绎) mode
- **Audit**: Standalone deep-dive reviewing script quality across 7 dimensions with annotation and batch-fix capabilities

### Core Patterns

**AI Task Runner** (`services/aiTaskRunner.ts`): `runAiTask<T>` wraps AI calls with retry logic, abort signal support, progress callbacks, and fallback task execution.

**State Persistence**: Project state is persisted to IndexedDB via `utils/idb.ts`. The `utils/projectPersistence.ts` module handles sanitize/hydrate cycles (removing runtime-only fields like `isAnalyzing` before save, restoring them on load) with snapshot deduplication.

**API Client** (`services/apiClient.ts`): Single `callUniversalAPI` function routes to different providers based on model ID prefix:
- `[次]*` → novai.su (Gemini models)
- `claude-*` → MixAI.cc
- `gpt-5.4` → AIXJ
- Others → user-configured baseUrl

Includes exponential backoff retry with model-specific delays, timeout control, and comprehensive error classification.

**JSON Resilience** (`services/utils/jsonUtils.ts`): 5-tier fallback chain — direct parse → clean → repair → deep repair → quote fix → aggressive bracket balancing. For critical parse failures (Architecture/Outline/Character), falls back to Gemini-powered formatting via `formatJsonWithGemini`.

**Context Window Management**: Each model has a `MODEL_CONTEXT_LIMITS` entry. `getPromptMaxChars(modelId)` returns the safe prompt size (limit minus ~20K chars for system prompt and output). Services truncate `novelText` dynamically to fit.

### Multi-Provider Model Configuration

| Model ID | Provider | Context Limit |
|---|---|---|
| `claude-opus-4-6-a` | MixAI | 400K chars |
| `claude-sonnet-4-6` | MixAI | 300K chars |
| `[次]gemini-3.1-pro-preview*` | novai.su | 800K chars |
| `[次]gemini-3-pro-preview*` | novai.su | 500K chars |
| `[次]gemini-3-flash-preview` | novai.su | 500K chars |
| `gpt-5.4` | AIXJ | 150K chars |

API keys per model are read from `import.meta.env` variables (e.g., `VITE_MIXAI_KEY_CLAUDE_SONNET_46`).

### Bundle Strategy

Vite build uses manual chunk splitting in `vite.config.ts` to reduce initial load: `react-vendor`, `icon-vendor` (lucide-react), `export-vendor` (docx/file-saver), `parser-vendor` (mammoth), `diff-vendor`, plus a default `vendor` chunk.

### Key Type Definitions (`types.ts`)

- `ScriptNarrativeType`: `'first-person' | 'third-person'` — controls which system prompt template is used
- `CharacterStage`: Timeline node mapping character arc phases to chapter ranges (used in character analysis)
- `StoryBlueprint`: Contains all 5 arcs plus character map
- `AuditReport`: Total score + per-dimension scores + `annotations[]` with issue/suggestion/canBatchFix
