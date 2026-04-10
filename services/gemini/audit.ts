import { AuditAnnotation, AuditItem, AuditReport, AuditScore, ChatMessage, ComparisonReport, ScriptGenerationConfig } from '../../types';
import { callUniversalAPI, getAPIConfig } from '../apiClient';
import { calculateTimeout, parseFixOptionsResult, safeJsonParse, safeJsonParseAsync } from './resultParser';
import { getBatchOptimizationInstruction } from './promptFactory';

export const auditScript = async (
  apiKey: string,
  currentScript: string,
  config: ScriptGenerationConfig,
  modelId: string = '[次]gemini-3-flash-preview',
  baseUrl?: string
): Promise<AuditItem[]> => {
  const apiConfig = getAPIConfig(apiKey, baseUrl, modelId);

  const optimizedNovelContent = config.novelContent.substring(0, 5000);

  let continuityContext = "";
  if (config.episodeId > 1 && config.previousScriptContext) {
      continuityContext = `4. **上一集结尾**（用于检查衔接）：\n${config.previousScriptContext.slice(-800)}\n`;
  }
  
  let characterContext = "";
  if (config.characterList && config.characterList.length > 0) {
      characterContext = config.characterList.map(c => `- ${c.name}：${c.desc}`).join("\n");
  } else if (config.characters) {
      characterContext = config.characters;
  }

  const prompt = `
你现在是短剧制作公司的【金牌主编】。请对以下【刚生成的剧本】进行严格的质量审核。

**审核核心原则**：
1. **剧情主线优先**：所有修改建议必须严格服务于【剧情大纲】的主线剧情。**严禁**为了追求所谓的“爽感”或“冲突”而偏离原大纲设定的剧情走向。
2. **连贯性检查**：如果是第2集及以后，必须检查与上一集的剧情和情绪衔接是否自然。
3. **原著还原度**：参考小说原文和世界观设定，确保人物不OOC（角色性格崩坏），核心设定不丢失。

**审核依据**：
1. **剧情大纲**（必须严格遵守）：${config.outlineContent}
2. **世界观/背景**：${config.worldSetting || "无"}
3. **小说原文参考**：${optimizedNovelContent}
${continuityContext}
5. **人物设定**：\n${characterContext || "无"}

**审核维度**（请毒舌一点，不要客气，直接指出问题）：
1. **主线偏移 (Plot Deviation)**：剧本是否偏离了大纲的核心剧情？是否加了多余的戏份？
2. **剧情衔接 (Continuity)**：(仅针对第2集+) 开场是否能接得住上一集的情绪？转场是否生硬？
3. **节奏 (Pacing)**：开篇前3秒是否够炸？结尾是否有钩子？中间是否拖沓？
4. **冲突 (Conflict)**：矛盾是否够尖锐？
5. **人设 (Character)**：人物行为是否符合提供的【人物设定】？是否OOC？
6. **视觉 (Visuals)**：是否缺乏画面感？
7. **台词 (Dialogue)**：**是否单句过长（短剧忌讳长篇大论）？** 是否太书面化？

**输出要求**：
请找出 3-6 个最关键、最需要修改的具体问题。
每个问题必须包含：
- **category**: 问题类别 (主线/衔接/节奏/冲突/人设/视觉/台词)
- **severity**: 严重程度 (high/medium/low)
- **issue**: 简短的问题描述 (例如：开场太平淡，缺乏视觉冲击)
- **targetQuote**: 剧本中具体存在问题的这一段原文 (用于定位)
- **suggestion**: 给编剧助理的具体修改指令 (Instruction)，要求必须是可以直接执行的动作 (例如："删除前三句闲聊，直接从巴掌声开始写起，增加XXX的心理描写")。

【待审核剧本】：
${currentScript}

请输出 JSON 数组格式：
[
  {
    "category": "问题类别",
    "severity": "high/medium/low",
    "issue": "问题描述",
    "targetQuote": "剧本中具体存在问题的原文",
    "suggestion": "具体修改指令"
  }
]
`;

  try {
    // 根据剧本长度和模型类型动态调整超时时间
    const scriptLength = currentScript.length;
    let timeoutDuration = calculateTimeout(scriptLength, modelId);

    if (scriptLength > 150000) {
      // 超超长剧本（>15万字）
      timeoutDuration = modelId.includes('claude') ? 1200000 : 900000; // Claude: 20分钟, 其他: 15分钟
    } else if (scriptLength > 100000) {
      // 超长剧本（10-15万字）
      timeoutDuration = modelId.includes('claude') ? 900000 : 720000; // Claude: 15分钟, 其他: 12分钟
    } else if (scriptLength > 50000) {
      // 长剧本（5-10万字）
      timeoutDuration = modelId.includes('claude') ? 600000 : 480000; // Claude: 10分钟, 其他: 8分钟
    } else {
      // 普通剧本（<5万字）
      timeoutDuration = modelId.includes('claude') ? 300000 : 180000; // Claude: 5分钟, 其他: 3分钟
    }

    const response = await callUniversalAPI(apiConfig, modelId, [{ role: 'user', content: prompt }], {
        temperature: 0.5,
        responseFormat: { type: 'json_object' },
        timeout: timeoutDuration
    });

    let items = safeJsonParse(response.text, "AuditScript");

    // Handle if response is wrapped in an object
    if (items && !Array.isArray(items) && items.items) {
      items = items.items;
    }
    if (!Array.isArray(items)) {
      items = [];
    }

    return items.map((item: any, index: number) => ({
      ...item,
      id: Date.now().toString() + index,
      status: 'pending'
    }));

  } catch (error) {
    console.error("Audit Script Error:", error);
    return [];
  }
};

// --- NEW DEEP AUDIT FUNCTIONS ---

export const performDeepAudit = async (
    apiKey: string,
    script: string,
    novelContext: string,
    outlineContext: string,
    baseUrl?: string,
    modelId: string = '[次]gemini-3-pro-preview-thinking'
): Promise<AuditReport> => {
    const config = getAPIConfig(apiKey, baseUrl, modelId);

    console.log(`[Deep Audit] 开始审稿 - 模型: ${modelId}, 剧本长度: ${script.length}字`);
    console.log(`[Deep Audit] 小说上下文长度: ${novelContext.length}字, 大纲上下文长度: ${outlineContext.length}字`);

    // 计算总输入长度
    const totalInputLength = script.length + novelContext.length + outlineContext.length;
    console.log(`[Deep Audit] 总输入长度: ${totalInputLength}字`);

    // 根据模型能力决定是否需要压缩
    const isOpus = modelId.includes('opus');
    const isClaudeFamily = modelId.includes('claude');

    let compressedNovelContext = novelContext;
    let compressedOutlineContext = outlineContext;

    // 只有非 Opus 模型才需要压缩
    if (!isOpus) {
        const MAX_NOVEL_CONTEXT = 5000;
        const MAX_OUTLINE_CONTEXT = 3000;

        if (novelContext.length > MAX_NOVEL_CONTEXT) {
            console.log(`[Deep Audit] ⚠️ 小说上下文过长 (${novelContext.length}字)，当前模型不支持超长上下文`);
            console.log(`[Deep Audit] 建议：切换到 Claude Opus 4.6 (MixAI) ⭐ 模型以获得完整评估`);
            console.log(`[Deep Audit] 当前将压缩到 ${MAX_NOVEL_CONTEXT} 字（仅供参考，可能影响评估准确性）`);

            const halfSize = Math.floor(MAX_NOVEL_CONTEXT / 2);
            compressedNovelContext =
                novelContext.substring(0, halfSize) +
                "\n\n...(中间部分已省略，建议使用 Claude Opus 模型查看完整评估)...\n\n" +
                novelContext.substring(novelContext.length - halfSize);
        }

        if (outlineContext.length > MAX_OUTLINE_CONTEXT) {
            console.log(`[Deep Audit] 大纲上下文过长 (${outlineContext.length}字)，压缩到 ${MAX_OUTLINE_CONTEXT} 字`);
            compressedOutlineContext = outlineContext.substring(0, MAX_OUTLINE_CONTEXT) + "\n\n...(后续内容已省略)...";
        }
    } else {
        console.log(`[Deep Audit] ✅ 使用 Claude Opus 模型，支持超长上下文，无需压缩`);
    }

    const prompt = `
# Role
你是一名**资深短剧改编顾问**，专注于**小说IP改编短剧**赛道。
请对以下【剧本正文】进行深度体检，核心任务是评估**小说到短剧的改编质量**，包括剧情压缩、节奏把控、情绪放大等改编技巧。

# Priority Rules (改编评估优先)
1. **改编视角优先**：始终以"小说原文"为参照基准，评估剧本的改编取舍是否合理。
2. **短剧特性优先**：短剧需要快节奏、强情绪、高密度，评估时需考虑短剧的特殊要求。
3. **宏观优先 (Macro First)**：优先指出**剧情压缩**、**情节取舍**、**节奏把控**的大问题，忽略台词语病等琐碎问题。

# Inputs
1. 【分集大纲 (Blueprint/Outline)】：
${compressedOutlineContext}

2. 【小说原文 (Novel Reference) - 改编参照基准】：
${compressedNovelContext}

3. 【待审核剧本 (Target)】：
${script}

# Audit Dimension Checklist
请从以下 7 个核心维度进行审查。**重要原则：改编不是照搬原著，合理的改动应该加分而非扣分。**

**评估核心原则：**
- **剧本自洽优先**：逻辑在剧本内部能自圆其说即可，不必与原著完全一致
- **正向改动加分**：如果改编比原著更精彩、更适合短剧，应该给高分
- **服务剧情优先**：人设改动只要能推动剧情、不违和，就是合理的

**⚠️ 短剧改编的核心要求：节奏压缩**
短剧的本质是"快节奏、高密度、强情绪"。小说改编短剧必须大幅压缩节奏：
- **合格的压缩**：5000字小说 → 1集短剧（约800字剧本）
- **优秀的压缩**：在压缩的同时保留甚至放大情绪爆点
- **失败的改编**：节奏和小说类似甚至更慢，这是致命伤！

1. **逻辑闭环 (Logic)** - 评估剧本内部逻辑，而非与原著对比：
   - 剧本内部的行为动机是否合理？因果链是否自洽？
   - 即使与原著不同，只要剧本内逻辑能自圆其说，就应给高分
   - 只有剧本内部出现逻辑漏洞、前后矛盾时才扣分

2. **情节推动 (Plot Efficiency)**:
   - 每场戏是否有效推动剧情？信息密度是否足够？
   - 关键转折点是否清晰有力？是否存在水时长？
   - 原创情节如果能增强戏剧张力，应该加分
   - **严重扣分项**：大段心理描写、冗长对话、无效场景

3. **钩子与节奏 (Hooks & Pacing)** - ⚠️ 这是短剧改编的核心维度：
   - 开场前3秒是否抓人？结尾是否有悬念？
   - **节奏压缩是否到位？** 这是最重要的评判标准！
   - **致命问题（直接扣30分以上）**：
     * 节奏和小说原文类似或更慢
     * 大段照搬小说对话，没有精简
     * 铺垫过长，迟迟不进入冲突
     * 一集内容可以压缩到半集
   - **优秀表现（可加分）**：
     * 原著3章内容精炼成1集，且保留核心冲突
     * 删除冗余铺垫，直接进入高潮
     * 用视觉动作替代大段心理描写

4. **人设一致性 (Character Consistency)** - 评估剧本内部人设，而非与原著对比：
   - 人物在剧本内是否前后一致？是否有突然的性格跳跃？
   - 人设改动只要服务于剧情推动、不违和，就是合理的
   - 即使与原著人设不同，只要剧本内人物立体、有魅力，就应给高分

5. **改编质量 (Adaptation Quality)**:
   - 是否保留并放大了故事的核心魅力（爽点、虐点、金手指）？
   - 正向改动（比原著更精彩）应该加分
   - 视听化改编是否到位？文字转画面是否有创意？
   - **严重扣分项**：照搬原著文字，没有视听化处理

6. **情绪带动 (Emotional Impact)**:
   - 情绪点是否充分释放？爽感、虐感、甜感是否拉满？
   - 情绪节奏是否有起伏？高潮点是否足够强烈？
   - 如果情绪表达比原著更强烈，应该加分
   - **严重扣分项**：情绪平淡、缺乏爆点、高潮被稀释

7. **画面表现 (Visual Presentation)**:
   - 场景描写是否具有画面感？是否便于拍摄？
   - 动作指示（⊿）是否清晰、具体、可执行？
   - 镜头语言是否丰富？视觉手法是否有效强化情绪？

# 评分标准（极度严格，必须拉开巨大差距）
**⚠️ 警告：你必须非常严格地打分！节奏拖沓是短剧改编的致命伤！**

**节奏问题的严重性（必须严格执行）：**
- 如果剧本节奏和小说类似或更慢 → 总分不得超过55分
- 如果存在大段照搬小说对话 → "钩子与节奏"维度不得超过45分
- 如果一集内容明显可以压缩 → 至少扣20分

**总分标准（严格执行）：**
- **90-100分（现象级爆款）**：完美无缺，可遇不可求，一年难见一部
- **85-89分（顶级商业水准）**：几乎无可挑剔，可直接投拍的精品
- **80-84分（优秀水准）**：质量上乘，仅有极少量瑕疵
- **70-79分（良好水准）**：整体不错，但有明显可优化空间
- **60-69分（合格水准）**：基本可用，但问题较多需要修改
- **50-59分（勉强及格）**：问题明显，需要较大幅度修改
- **40-49分（不合格）**：问题严重，需要大幅重写
- **30-39分（严重不合格）**：基本失败，建议推翻重来
- **30分以下（完全失败）**：不具备改编价值

**维度评分要求：**
- **实事求是**：根据剧本实际质量打分，好剧本各维度都可以高，差剧本各维度都可以低
- **敢于给极端分数**：做得极好的给90+，做得极差的给40以下，不要都挤在60-75区间
- **每个维度独立评判**：不要因为某个维度高就拉高其他维度，也不要强行制造差异
- **严格标准**：大多数普通剧本应该在50-70分区间，80分以上需要真正优秀
- **节奏是核心**：如果"钩子与节奏"维度低于50分，总分不应超过60分

**评分示例（注意分数分布）：**
- 节奏拖沓的剧本（总分48）：钩子与节奏35分，其他维度45-65之间
- 节奏尚可但有问题的剧本（总分62）：钩子与节奏58分，其他维度55-72之间
- 节奏紧凑的优秀剧本（总分82）：钩子与节奏88分，其他维度75-90之间

# Output Schema
请输出 JSON 格式。
对于每条批注 (annotation)：
- **score**: 0 (致命伤/Fatal) or 1 (建议优化/Warning)。
- **dimension**: e.g. "逻辑.动机", "节奏.拖沓", "改编.偏离原著".
- **location.lineContent**: 剧本中**最能体现该问题**的一句原文（用于高亮）。
- **issue**: 用专业的导演视角指出问题本质。
- **suggestion**: 给出**具体的修改策略**。

Example JSON Structure:
{
  "totalScore": 48,
  "summary": "本剧本存在严重的节奏问题：1）大量照搬小说对话，没有进行短剧化压缩，节奏和原著几乎一样慢；2）第3-5集铺垫过长，迟迟不进入核心冲突；3）方岩黑化动机铺垫不足，转折突兀；4）部分内心戏缺乏视觉化处理。唯一亮点是开场动作戏设计。",
  "dimensionScores": [
    { "dimension": "逻辑闭环", "score": 52, "comment": "主线逻辑基本自洽，但方岩黑化动机铺垫缺失，第7集转折略显突兀" },
    { "dimension": "情节推动", "score": 45, "comment": "大量场景信息密度过低，存在明显水时长，杨盈盈支线喧宾夺主" },
    { "dimension": "钩子与节奏", "score": 38, "comment": "【致命问题】节奏和小说原文几乎一样慢，大段对话照搬原著，完全没有短剧化压缩，一集内容可以压缩到半集" },
    { "dimension": "人设一致性", "score": 55, "comment": "主要人物基本一致，但秦红裳的复杂性被削弱，部分配角扁平" },
    { "dimension": "改编质量", "score": 42, "comment": "视听化处理严重不足，大量文字直接照搬，没有转化为画面语言" },
    { "dimension": "情绪带动", "score": 58, "comment": "爽点有所释放，但因节奏拖沓导致情绪被稀释，高潮缺乏蓄力" },
    { "dimension": "画面表现", "score": 48, "comment": "动作指示过于笼统，大量内心戏缺乏视觉化处理" }
  ],
  "annotations": [
    {
       "dimension": "节奏.拖沓",
       "location": { "lineContent": "（大段对话照搬原著）", "scene": "第3集 3-2场" },
       "score": 0,
       "issue": "【致命伤】这段对话完全照搬小说原文，长达500字，严重拖慢节奏。短剧一集只有1.5分钟，这段对话就占了30秒以上。",
       "suggestion": "必须大幅压缩：1）删除所有铺垫性对话；2）只保留核心冲突台词；3）用动作和表情替代解释性对话；4）目标压缩到100字以内。",
       "canBatchFix": true
    },
    {
       "dimension": "改编.视听化不足",
       "location": { "lineContent": "他心里很后悔", "scene": "第5集 5-3场" },
       "score": 1,
       "issue": "内心描写没有视觉化处理，无法拍摄。",
       "suggestion": "改为具体动作：'他颤抖着手捡起地上的照片，指节发白'。",
       "canBatchFix": false
    }
  ]
}
`;

    try {
    // 根据剧本长度和模型类型动态调整超时时间
    // 长剧本（>50000字）需要更长的处理时间
    const scriptLength = script.length;
    let timeoutDuration = calculateTimeout(scriptLength, modelId);

    // Claude Opus 支持更长的上下文，给予更长的超时时间
    const isOpus = modelId.includes('opus');
    const isClaudeFamily = modelId.includes('claude');

    if (scriptLength > 150000) {
      // 超超长剧本（>15万字）
      if (isOpus) {
        timeoutDuration = 1800000; // Opus: 30分钟
      } else if (isClaudeFamily) {
        timeoutDuration = 1200000; // Claude: 20分钟
      } else {
        timeoutDuration = 900000; // 其他: 15分钟
      }
    } else if (scriptLength > 100000) {
      // 超长剧本（10-15万字）
      if (isOpus) {
        timeoutDuration = 1200000; // Opus: 20分钟
      } else if (isClaudeFamily) {
        timeoutDuration = 900000; // Claude: 15分钟
      } else {
        timeoutDuration = 720000; // 其他: 12分钟
      }
    } else if (scriptLength > 50000) {
      // 长剧本（5-10万字）
      timeoutDuration = isClaudeFamily ? 600000 : 480000; // Claude: 10分钟, 其他: 8分钟
    } else {
      // 普通剧本（<5万字）
      timeoutDuration = isClaudeFamily ? 300000 : 180000; // Claude: 5分钟, 其他: 3分钟
    }

    console.log(`[Deep Audit] 超时设置: ${timeoutDuration / 1000}秒 (${Math.round(timeoutDuration / 60000)}分钟)`);

    const response = await callUniversalAPI(config, modelId, [{ role: 'user', content: prompt }], {
        temperature: 0.4,
        responseFormat: { type: 'json_object' },
        timeout: timeoutDuration
    });

        console.log(`[Deep Audit] API 调用成功，开始解析结果`);
        console.log(`[Deep Audit] 响应长度: ${response.text.length} 字符`);

        // 判断是否使用 Claude 模型，如果是则启用 Gemini 修复
        const isClaudeModel = modelId.toLowerCase().includes('claude');

        // 使用异步安全 JSON 解析，Claude 模型启用 Gemini 修复
        const result = await safeJsonParseAsync(
            response.text,
            "Deep Audit",
            apiKey,
            baseUrl,
            isClaudeModel // 只有 Claude 模型才启用 Gemini 修复
        );

        // Post-process to ensure IDs and types
        const annotations = (result.annotations || []).map((a: any, idx: number) => ({
            ...a,
            id: `anno_${Date.now()}_${idx}`,
            status: 'pending'
        }));

        console.log(`[Deep Audit] 审稿完成 - 总分: ${result.totalScore}, 批注数: ${annotations.length}`);

        return {
            scriptId: Date.now().toString(),
            totalScore: result.totalScore || 0,
            dimensionScores: result.dimensionScores || [],
            annotations: annotations,
            summary: result.summary || "",
            timestamp: Date.now()
        };
    } catch (e: any) {
        console.error("[Deep Audit] 审稿失败:", e);
        console.error("[Deep Audit] 错误详情:", {
            message: e.message,
            status: e.status,
            name: e.name
        });
        throw e;
    }
};

// --- NEW: 分批深度审稿（用于超长剧本 >20万字）---
export const performBatchedDeepAudit = async (
    apiKey: string,
    script: string,
    novelContext: string,
    outlineContext: string,
    baseUrl?: string,
    modelId: string = 'claude-opus-4-6-a',
    onProgress?: (current: number, total: number, message: string) => void
): Promise<AuditReport> => {
    const CHUNK_SIZE = 80000; // 每批次处理 8 万字
    const scriptLength = script.length;

    console.log(`[Batched Deep Audit] 开始分批审稿 - 总长度: ${scriptLength}字, 模型: ${modelId}`);

    // 如果剧本不超过 20 万字，直接调用普通审稿
    if (scriptLength <= 200000) {
        console.log(`[Batched Deep Audit] 剧本长度未超过20万字，使用普通审稿`);
        return performDeepAudit(apiKey, script, novelContext, outlineContext, baseUrl, modelId);
    }

    // 分批处理
    const chunks: string[] = [];
    for (let i = 0; i < scriptLength; i += CHUNK_SIZE) {
        chunks.push(script.substring(i, Math.min(i + CHUNK_SIZE, scriptLength)));
    }

    console.log(`[Batched Deep Audit] 分为 ${chunks.length} 批次处理`);

    const allAnnotations: AuditAnnotation[] = [];
    const dimensionScoresMap = new Map<string, { total: number; count: number }>();
    let totalScoreSum = 0;

    // 逐批审稿
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkStart = i * CHUNK_SIZE;
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, scriptLength);

        if (onProgress) {
            onProgress(i + 1, chunks.length, `正在审稿第 ${i + 1}/${chunks.length} 批次 (${chunkStart}-${chunkEnd}字)`);
        }

        console.log(`[Batched Deep Audit] 处理第 ${i + 1}/${chunks.length} 批次`);

        try {
            const chunkReport = await performDeepAudit(
                apiKey,
                chunk,
                novelContext,
                outlineContext,
                baseUrl,
                modelId
            );

            // 合并批注（调整位置偏移）
            chunkReport.annotations.forEach(anno => {
                allAnnotations.push({
                    ...anno,
                    id: `batch${i}_${anno.id}`,
                    location: {
                        ...anno.location,
                        lineContent: `[第${i + 1}批] ${anno.location.lineContent}`
                    }
                });
            });

            // 累积维度分数
            chunkReport.dimensionScores.forEach(ds => {
                const existing = dimensionScoresMap.get(ds.dimension);
                if (existing) {
                    existing.total += ds.score;
                    existing.count += 1;
                } else {
                    dimensionScoresMap.set(ds.dimension, { total: ds.score, count: 1 });
                }
            });

            totalScoreSum += chunkReport.totalScore;

        } catch (e) {
            console.error(`[Batched Deep Audit] 第 ${i + 1} 批次失败:`, e);
            // 继续处理下一批次
        }
    }

    // 计算平均分数
    const avgTotalScore = Math.round(totalScoreSum / chunks.length);
    const dimensionScores: AuditScore[] = Array.from(dimensionScoresMap.entries()).map(([dimension, data]) => ({
        dimension,
        score: Math.round(data.total / data.count),
        comment: `基于 ${data.count} 个批次的平均分数`
    }));

    console.log(`[Batched Deep Audit] 分批审稿完成 - 总批注数: ${allAnnotations.length}, 平均分: ${avgTotalScore}`);

    return {
        scriptId: Date.now().toString(),
        totalScore: avgTotalScore,
        dimensionScores,
        annotations: allAnnotations,
        summary: `【分批审稿报告】本剧本共 ${scriptLength} 字，分 ${chunks.length} 批次审核完成。共发现 ${allAnnotations.length} 处问题。`,
        timestamp: Date.now()
    };
};

// --- NEW: 增量式深度审稿（分段分析，动态更新结论）---
export const performIncrementalDeepAudit = async (
    apiKey: string,
    script: string,
    novelContext: string,
    outlineContext: string,
    baseUrl?: string,
    modelId: string = 'claude-opus-4-6-a',
    onProgress?: (current: number, total: number, message: string) => void
): Promise<AuditReport> => {
    const CHUNK_SIZE = 50000; // 每批次处理 5 万字剧本
    const scriptLength = script.length;

    console.log(`[Incremental Audit] 开始增量式审稿 - 总长度: ${scriptLength}字, 模型: ${modelId}`);

    // 分批处理
    const chunks: string[] = [];
    for (let i = 0; i < scriptLength; i += CHUNK_SIZE) {
        chunks.push(script.substring(i, Math.min(i + CHUNK_SIZE, scriptLength)));
    }

    console.log(`[Incremental Audit] 分为 ${chunks.length} 批次处理`);

    // 全局结论区域（动态更新）
    let globalConclusion = {
        totalScore: 0,
        dimensionScores: [] as AuditScore[],
        summary: "",
        keyIssues: [] as string[],
        overallTrend: ""
    };

    const allAnnotations: AuditAnnotation[] = [];
    const config = getAPIConfig(apiKey, baseUrl, modelId);

    // 逐批审稿，每次都参考和更新全局结论
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkStart = i * CHUNK_SIZE;
        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, scriptLength);

        if (onProgress) {
            onProgress(i + 1, chunks.length, `正在审稿第 ${i + 1}/${chunks.length} 段 (${chunkStart}-${chunkEnd}字)`);
        }

        console.log(`[Incremental Audit] 处理第 ${i + 1}/${chunks.length} 段`);

        // 构建增量式 Prompt
        const incrementalPrompt = `
# Role
你是一名**资深短剧改编顾问**，正在对一部**小说改编短剧**进行**分段增量式审稿**。
核心任务是评估**小说到短剧的改编质量**，包括剧情压缩、节奏把控、情绪放大等改编技巧。

# 当前任务
这是第 ${i + 1}/${chunks.length} 段的审稿。你需要：
1. 以小说原文为参照基准，分析本段剧本的改编问题
2. **参考之前的全局结论**，保持评价标准的一致性
3. **更新全局结论**，整合本段的新发现

# 之前的全局结论（供参考）
${i === 0 ? "这是第一段，暂无之前的结论。" : `
- 当前总分: ${globalConclusion.totalScore}
- 维度评分: ${JSON.stringify(globalConclusion.dimensionScores)}
- 总体趋势: ${globalConclusion.overallTrend}
- 关键问题: ${globalConclusion.keyIssues.join('; ')}
`}

# 参考上下文
【小说原文 - 改编参照基准】：${novelContext.substring(0, 3000)}...
【大纲】：${outlineContext.substring(0, 2000)}...

# 本段剧本（第 ${i + 1}/${chunks.length} 段）
${chunk}

# 审核维度（重要：剧本自洽优先，正向改动应加分）
**核心原则：改编不是照搬原著，合理改动应加分。逻辑和人设只要在剧本内自洽即可。**

**⚠️ 短剧改编的核心要求：节奏压缩**
- 如果节奏和小说类似或更慢 → 这是致命伤，总分不得超过55分
- 如果大段照搬小说对话 → "钩子与节奏"维度不得超过45分

1. 逻辑闭环：剧本内部逻辑是否自洽？（不必与原著一致，自圆其说即可）
2. 情节推动：每场戏是否有效推动剧情？信息密度是否足够？
3. 钩子与节奏：**最重要的维度！** 节奏是否大幅压缩？是否符合短剧特点？
4. 人设一致性：人物在剧本内是否前后一致？（改动只要服务剧情就OK）
5. 改编质量：核心魅力是否保留放大？正向改动应加分
6. 情绪带动：情绪点是否充分释放？爽感是否拉满？
7. 画面表现：场景是否有画面感？动作指示是否清晰可执行？

# 评分标准（极度严格，必须拉开巨大差距）
**⚠️ 警告：大多数剧本应该在50-70分区间，80分以上极为罕见。节奏拖沓是致命伤！**
- 90-100分（现象级）：完美无缺，一年难见一部
- 85-89分（顶级商业）：几乎无可挑剔
- 80-84分（优秀）：质量上乘，极少瑕疵
- 70-79分（良好）：整体不错，有明显优化空间
- 60-69分（合格）：基本可用，问题较多
- 50-59分（勉强及格）：问题明显，需较大修改
- 40-49分（不合格）：问题严重，需大幅重写
- 40分以下（失败）：建议推翻重来

**节奏问题的严重性：**
- 节奏和小说类似或更慢 → 总分不得超过55分
- 大段照搬小说对话 → "钩子与节奏"不得超过45分

**维度评分要求：实事求是打分，好剧本各维度都可以高，差剧本各维度都可以低。敢于给极端分数，不要都挤在60-75区间。**

# 输出要求
请输出 JSON 格式，包含两部分：

1. **本段分析 (currentSegment)**：
   - annotations: 本段发现的具体问题（需结合小说原文对比）
   - segmentScore: 本段的评分 (0-100)
   - segmentSummary: 本段的简要总结（需体现改编评估视角）

2. **更新后的全局结论 (updatedGlobal)**：
   - totalScore: 综合所有已审稿段的总分 (0-100)
   - dimensionScores: 各维度评分（逻辑闭环、情节推动、钩子与节奏、人设还原、改编质量、情绪带动、画面表现）
   - summary: 整体评价（整合所有段的发现，体现改编质量评估）
   - keyIssues: 关键问题列表（最多5个，聚焦改编问题）
   - overallTrend: 总体趋势描述（如"前半部分改编紧凑，后半部分节奏拖沓"）

Example JSON:
{
  "currentSegment": {
    "annotations": [
      {
        "dimension": "逻辑.因果断裂",
        "location": { "lineContent": "..." },
        "score": 0,
        "issue": "角色行为动机完全缺失，前后矛盾严重",
        "suggestion": "需要补充至少2-3场戏铺垫动机转变",
        "canBatchFix": false
      }
    ],
    "segmentScore": 52,
    "segmentSummary": "本段逻辑漏洞严重，但节奏把控是亮点"
  },
  "updatedGlobal": {
    "totalScore": 48,
    "dimensionScores": [
      { "dimension": "逻辑闭环", "score": 35, "comment": "因果链严重断裂，多处行为动机缺失" },
      { "dimension": "情节推动", "score": 58, "comment": "关键情节基本保留，但信息密度不足" },
      { "dimension": "钩子与节奏", "score": 72, "comment": "节奏把控是本剧最大亮点，钩子设置到位" },
      { "dimension": "人设一致性", "score": 32, "comment": "人物前后矛盾严重，多处性格跳跃" },
      { "dimension": "改编质量", "score": 48, "comment": "核心魅力被大幅削弱，正向改动几乎没有" },
      { "dimension": "情绪带动", "score": 55, "comment": "爽点有所释放，但情绪起伏平淡" },
      { "dimension": "画面表现", "score": 38, "comment": "动作指示模糊，大量场景无法执行拍摄" }
    ],
    "summary": "前${i + 1}段整体改编质量良好，保留了原著核心框架...",
    "keyIssues": ["部分情感铺垫被过度压缩", "XXX伏笔缺失"],
    "overallTrend": "改编质量稳定，局部需补充情感铺垫"
  }
}
`;

        try {
            const response = await callUniversalAPI(config, modelId, [{ role: 'user', content: incrementalPrompt }], {
                temperature: 0.4,
                responseFormat: { type: 'json_object' },
                timeout: 600000 // 10分钟
            });

            // 判断是否使用 Claude 模型
            const isClaudeModel = modelId.toLowerCase().includes('claude');

            // 使用异步安全 JSON 解析，Claude 模型启用 Gemini 修复
            const result = await safeJsonParseAsync(
                response.text,
                `Incremental Audit 第${i + 1}段`,
                apiKey,
                baseUrl,
                isClaudeModel
            );

            // 收集本段的批注
            if (result.currentSegment?.annotations) {
                result.currentSegment.annotations.forEach((anno: any, idx: number) => {
                    allAnnotations.push({
                        ...anno,
                        id: `seg${i}_${Date.now()}_${idx}`,
                        location: {
                            ...anno.location,
                            lineContent: `[第${i + 1}段] ${anno.location.lineContent}`
                        },
                        status: 'pending'
                    });
                });
            }

            // 更新全局结论
            if (result.updatedGlobal) {
                globalConclusion = {
                    totalScore: result.updatedGlobal.totalScore || globalConclusion.totalScore,
                    dimensionScores: result.updatedGlobal.dimensionScores || globalConclusion.dimensionScores,
                    summary: result.updatedGlobal.summary || globalConclusion.summary,
                    keyIssues: result.updatedGlobal.keyIssues || globalConclusion.keyIssues,
                    overallTrend: result.updatedGlobal.overallTrend || globalConclusion.overallTrend
                };
            }

            console.log(`[Incremental Audit] 第 ${i + 1} 段完成 - 本段评分: ${result.currentSegment?.segmentScore}, 全局总分: ${globalConclusion.totalScore}`);

        } catch (e) {
            console.error(`[Incremental Audit] 第 ${i + 1} 段失败:`, e);
            // 继续处理下一批次
        }
    }

    console.log(`[Incremental Audit] 增量式审稿完成 - 总批注数: ${allAnnotations.length}, 最终总分: ${globalConclusion.totalScore}`);

    return {
        scriptId: Date.now().toString(),
        totalScore: globalConclusion.totalScore,
        dimensionScores: globalConclusion.dimensionScores,
        annotations: allAnnotations,
        summary: `【增量式审稿报告】${globalConclusion.summary}\n\n总体趋势: ${globalConclusion.overallTrend}\n\n关键问题: ${globalConclusion.keyIssues.join('; ')}`,
        timestamp: Date.now()
    };
};

export const getFixOptions = async (
    apiKey: string,
    originalText: string,
    issue: string,
    contextScript: string,
    baseUrl?: string
): Promise<string[]> => {
    const fixModel = '[次]gemini-3-flash-preview';
    const config = getAPIConfig(apiKey, baseUrl, fixModel);

    const prompt = `
# Task
你是一名专业的短剧编剧。针对剧本中被标记为有问题的一段文字，请提供 3 个**截然不同**的修改方案。
请注意：这不仅是修改台词，更是**优化剧情处理方式**。

【问题描述】：${issue}
【原句】："${originalText}"
【上下文参考】：
${contextScript.substring(0, 500)} ...

# Requirement
请输出 3 个具体的、可直接替换原句的文本段落。
1. **方案一（极致冲突版）**：最大化情绪张力，动作幅度大，直接引爆矛盾。
2. **方案二（悬疑/内敛版）**：通过潜台词或微表情传达信息，增加高级感和悬念。
3. **方案三（快节奏/效率版）**：删繁就简，用最少的动作/台词完成剧情推动，适合短剧节奏。

# Output Format (JSON Array of Strings)
["方案一内容...", "方案二内容...", "方案三内容..."]
`;

    const response = await callUniversalAPI(config, '[次]gemini-3-flash-preview', [{ role: 'user', content: prompt }], {
        responseFormat: { type: 'json_object' },
        timeout: 60000,
        maxRetries: 1,
    });
    const result = parseFixOptionsResult(response.text);
    return result;
};

export const batchOptimizeScript = async (
    apiKey: string,
    fullScript: string,
    optimizationType: string, // e.g., "visualize_actions", "remove_os", "fix_format"
    baseUrl?: string
): Promise<string> => {
    const batchModel = '[次]gemini-3-pro-preview-thinking';
    const config = getAPIConfig(apiKey, baseUrl, batchModel);

    const instruction = getBatchOptimizationInstruction(optimizationType);

    const prompt = `
# Task
请对以下剧本进行**全篇批量优化**。
【优化指令】：${instruction}

【原始剧本】：
${fullScript}

# Output
请直接输出优化后的完整剧本，不要包含任何解释性文字。保持剧本格式。
`;

    const response = await callUniversalAPI(config, '[次]gemini-3-pro-preview-thinking', [{ role: 'user', content: prompt }], {
        timeout: 120000,
        maxRetries: 1,
    });

    return response.text || fullScript;
};

// --- NEW: Multi-Script Comparison ---
export const compareScripts = async (
    apiKey: string,
    scripts: { name: string; content: string }[],
    baseUrl?: string,
    modelId: string = '[次]gemini-3-pro-preview-thinking'
): Promise<ComparisonReport> => {
    const config = getAPIConfig(apiKey, baseUrl, modelId);

    // Prepare inputs
    const inputs = scripts.map((s, i) => `
    === SCRIPT ${i+1}: ${s.name} ===
    ${s.content.substring(0, 30000)} ... (truncated if too long)
    `).join('\n\n');

    const prompt = `
# Role
你是一名**资深短剧制片人**，现在需要对同一集的**不同版本剧本**进行横向测评（A/B Test）。
请从**商业价值、节奏感、冲突张力**等维度进行评分，并选出“最佳版本”。

# Input Scripts
${inputs}

# Evaluation Criteria (评分维度)
1. **冲突前置 (Hook Strength)**: 开篇3秒是否能抓住观众？
2. **情绪价值 (Emotional Impact)**: 爽点/虐点是否到位？
3. **视觉化程度 (Visuals)**: 是否适合拍摄？动作指令是否清晰？
4. **台词效率 (Dialogue Efficiency)**: 是否废话少、信息密度高？

# Task
请输出一份 JSON 格式的对比报告。
1. **winner**: 获胜的剧本文件名。
2. **reasoning**: 200字左右的深度解析，说明为什么它获胜（对比其他版本的优势）。
3. **items**: 每个剧本的详细分析，包含 score (0-100), rank (排名), pros (优点列表), cons (缺点列表), summary (一句话短评)。

# Output Format (JSON)
{
  "winner": "Script Name",
  "reasoning": "...",
  "items": [
    { 
      "fileName": "Script Name", 
      "score": 85, 
      "rank": 1, 
      "pros": ["..."], 
      "cons": ["..."],
      "summary": "..."
    }
  ]
}
`;

    try {
    // 根据剧本总长度和模型类型动态调整超时时间
    const totalLength = scripts.reduce((sum, s) => sum + s.content.length, 0);
    let timeoutDuration = calculateTimeout(totalLength, modelId);

    if (totalLength > 150000) {
      // 超超长剧本对比（>15万字）
      timeoutDuration = modelId.includes('claude') ? 1200000 : 900000; // Claude: 20分钟, 其他: 15分钟
    } else if (totalLength > 100000) {
      // 超长剧本对比（10-15万字）
      timeoutDuration = modelId.includes('claude') ? 900000 : 720000; // Claude: 15分钟, 其他: 12分钟
    } else if (totalLength > 50000) {
      // 长剧本对比（5-10万字）
      timeoutDuration = modelId.includes('claude') ? 600000 : 480000; // Claude: 10分钟, 其他: 8分钟
    } else {
      // 普通剧本对比（<5万字）
      timeoutDuration = modelId.includes('claude') ? 300000 : 180000; // Claude: 5分钟, 其他: 3分钟
    }

    const response = await callUniversalAPI(config, modelId, [{ role: 'user', content: prompt }], {
        temperature: 0.4,
        responseFormat: { type: 'json_object' },
        timeout: timeoutDuration
    });

        const result = safeJsonParse(response.text, "AuditSingleEpisode");
        return {
            ...result,
            timestamp: Date.now()
        };
    } catch (e) {
        console.error("Script Comparison Failed", e);
        throw e;
    }
};
