import { CharacterProfile, OutlineGenerationProgressContext, StoryBlueprint } from '../../types';
import { callUniversalAPI, getAPIConfig } from '../apiClient';
import { parseDraftEpisodesResult, parseOutlineParseResult } from './resultParser';
import { canonicalizeChapterRangeText, normalizeEpisodeTargetChapters } from '../../utils/chapterRangeNormalization';
import { extractChapterIds } from '../../utils/fileParser';

const formatEpisodeRangeForPrompt = (
    minValue?: number | null,
    maxValue?: number | null,
    emptyText: string = '未设置'
): string => {
    const normalizedMin = minValue ?? null;
    const normalizedMax = maxValue ?? null;

    if (normalizedMin !== null && normalizedMax !== null) {
        if (normalizedMin === normalizedMax) {
            return `${normalizedMin}集`;
        }
        return `${normalizedMin}-${normalizedMax}集`;
    }

    if (normalizedMin !== null) {
        return `至少${normalizedMin}集`;
    }

    if (normalizedMax !== null) {
        return `至多${normalizedMax}集`;
    }

    return emptyText;
};

const buildGlobalPacingInstruction = (
    progressContext?: OutlineGenerationProgressContext,
): string => {
    if (!progressContext) return '';

    const progressPercent = progressContext.progressPercent ?? 0;
    const remainingEpisodeBudgetText = formatEpisodeRangeForPrompt(
        progressContext.remainingEpisodeRangeMin,
        progressContext.remainingEpisodeRangeMax,
        '未设置'
    );
    const totalEpisodeBudgetText = formatEpisodeRangeForPrompt(
        progressContext.expectedTotalEpisodesMin,
        progressContext.expectedTotalEpisodesMax,
        '未设置'
    );

    let stageLabel = '前期铺垫阶段';
    let stageInstruction = '当前仍处在前期，可以正常铺垫人物、关系和悬念，但不要让支线戏份压过主线。';

    if (progressPercent >= 80) {
        stageLabel = '接近尾声阶段';
        stageInstruction = '当前已经接近全文尾声，必须优先主线回收、冲突升级和结局兑现，禁止再无谓扩写新支线。';
    } else if (progressPercent >= 50) {
        stageLabel = '中后期推进阶段';
        stageInstruction = '当前处在中后期，应减少枝节、提高压缩率，把更多篇幅留给核心冲突推进与关键情绪高潮。';
    }

    const budgetTightInstruction = progressContext.remainingEpisodeRangeMax !== null && progressContext.remainingChapters > 0
        ? `- 如果剩余可用集数上限仅剩 ${progressContext.remainingEpisodeRangeMax} 集，请主动收敛拆分密度，避免后半程集数失控。`
        : '';

    return `
【全局创作进度与预算】
- 总章节数：${progressContext.totalChapters}
- 当前已处理章节数：${progressContext.processedChapters}
- 当前进度百分比：${progressPercent}%
- 已生成集数：${progressContext.generatedEpisodeCount}集
- 剩余章节数：${progressContext.remainingChapters}章
- 期望整体剧集区间：${totalEpisodeBudgetText}
- 剩余可用集数区间：${remainingEpisodeBudgetText}
${progressContext.estimatedTotalEpisodes ? `- 按当前节奏预估总集数：约 ${progressContext.estimatedTotalEpisodes} 集` : '- 按当前节奏预估总集数：暂无（生成若干集后再评估）'}
- 当前阶段判断：${stageLabel}

【全局收敛规则（必须遵守）】
- 前期允许正常铺垫，但仍要保证每集都有清晰冲突、钩子或情绪推进。
- 中后期必须减少枝节、提高压缩率，合并重复信息与弱支线，集中火力推进主线。
- 接近尾声时，优先主线回收、冲突升级、结局兑现，禁止再无谓扩写支线或新增大支线。
- ${stageInstruction}
${budgetTightInstruction}
`;
};

export const generateDraftEpisodes = async (
    apiKey: string,
    novelText: string,
    blueprint: StoryBlueprint,
    startEpisodeId: number,
    baseUrl?: string,
    modelId: string = '[次]gemini-3-pro-preview-thinking',
    targetEpisodeCount: number | null = null,
    previousContext: string = "",
    startChapter: number = 1,
    endChapter: number = 1,
    viralTips: string = "", // 爆款创作技巧
    progressContext?: OutlineGenerationProgressContext,
): Promise<any[]> => {
    const config = getAPIConfig(apiKey, baseUrl, modelId);

    const mainPlotContext = blueprint.mainPlotArc.phases.map(p => {
        const relevantEvents = p.events.filter(e => {
            if (!e.range) return true; // 若无关联章回范围，保留以作保底
            const ids = extractChapterIds(e.range);
            if (ids.length === 0) return true; // 解析不出数字也保留
            
            const eventStart = Math.min(...ids);
            const eventEnd = Math.max(...ids);
            
            // 判断是否与当前批次区间 [startChapter, endChapter] 有交集
            return eventStart <= endChapter && eventEnd >= startChapter;
        });

        if (relevantEvents.length === 0) return null;

        return `阶段：${p.phaseName}\n事件：${relevantEvents.map(e => `${e.title} (重要度:${e.importance}星) - ${e.summary}`).join('; ')}`;
    }).filter(Boolean).join('\n\n');

    // Filter mystery nodes (Destiny and Dark Arc)
    const mysteryNodesContext = blueprint.mysteryArc?.nodes?.filter(m => {
        const foreshadowIds = extractChapterIds(m.foreshadowingChapter || '');
        const payoffIds = extractChapterIds(m.payoffChapter || '');
        
        // 只要有一段落在范围内就匹配
        const isForeshadowMatch = foreshadowIds.length > 0 && Math.min(...foreshadowIds) <= endChapter && Math.max(...foreshadowIds) >= startChapter;
        const isPayoffMatch = payoffIds.length > 0 && Math.min(...payoffIds) <= endChapter && Math.max(...payoffIds) >= startChapter;
        
        return isForeshadowMatch || isPayoffMatch;
    }).map(m => {
        const isForeshadow = extractChapterIds(m.foreshadowingChapter || '').some(id => id >= startChapter && id <= endChapter);
        const isPayoff = extractChapterIds(m.payoffChapter || '').some(id => id >= startChapter && id <= endChapter);
        
        let typeStr = "";
        if (isForeshadow && isPayoff) typeStr = "【🎯 本批次需铺设且回收该伏笔】";
        else if (isForeshadow) typeStr = "【🎯 本批次为伏笔铺垫首发节点】";
        else if (isPayoff) typeStr = "【🎯 本批次为该暗线悬念回收节点】";
        
        return `${typeStr}\n起源/现状：${m.origin}\n剧情牵引：${m.progress}\n终极悬念：${m.suspense}`;
    }).join('\n\n') || '';

    let episodeConstraint = `
    **集数估算与拆分策略（短剧节奏）**：
    1. **评估信息密度**：请先仔细阅读本批次小说内容（第 ${startChapter} 章到 ${endChapter} 章）。
    2. **时长与压缩比**：
       - **单集时长**：每集短剧对应 **1分半到2分半** 的视频时长（约600-900字剧本）。
       - **压缩比例**：小说原文到剧本的压缩比应控制在 **40%-70%** 之间。
    3. **确定集数（重要）**：
       - **标准节奏**：通常 **1到3章的原文内容** 改编为 **1 集** 短剧是合理的节奏。
       - **高潮段落**：如果这部分内容高潮迭起（例如激烈对峙、重要反转），可以 **1章** 对应 **1集**。
       - **平淡段落**：如果这部分是日常过渡、环境描写，可以 **2-3章** 对应 **1集**。
       - **⚠️ 严禁过度压缩**：单集对应的章节数**不得超过3章**。即使内容平淡，也不要把4章或更多章节压缩成1集，这会导致剧情支离破碎、观众困惑。
    `;

    if (targetEpisodeCount) {
        episodeConstraint += `\n    **强制要求**：请将本批次小说内容严格切分为 **${targetEpisodeCount} 集**。请注意分配均匀，不要前紧后松。`;
    } else {
        episodeConstraint += `\n    4. **自主规划**：请基于上述原则，**自主规划**将这段内容拆分为几集最为合理。
       - **参考公式**：
       - 例如：10章内容应拆分为5-7 集。
       - 并在输出 JSON 的 \`pacing_strategy\` 字段中简要说明你的拆分逻辑。`;
    }

    if (progressContext && (progressContext.expectedTotalEpisodesMin !== null || progressContext.expectedTotalEpisodesMax !== null)) {
        episodeConstraint += `
    **全局预算优先**：你必须结合整部作品的总集数目标来拆分本批次，当前剩余可用集数区间约为 **${formatEpisodeRangeForPrompt(progressContext.remainingEpisodeRangeMin, progressContext.remainingEpisodeRangeMax, '未设置')}**。如果预算偏紧，请主动提高压缩率，避免把有限集数浪费在弱支线和重复信息上。`;
    }

    let continuityInstruction = "";
    if (previousContext) {
        continuityInstruction = `
### 剧情连贯性要求 (最高优先级)
这是该剧的中间部分。
**上一集结尾/上下文**：${previousContext.slice(-500)}
**要求**：本批次的第一集必须**自然流畅**地接上文。
1. 如果上集结尾是悬念，这集开头必须承接（解开或推进）。
2. **严禁断层**：不要突然跳跃时间线或场景，除非原著就是这么写的。
`;
    }

    const globalPacingInstruction = buildGlobalPacingInstruction(progressContext);
    const includesSeriesEnding = progressContext
        ? endChapter >= progressContext.totalChapters
        : false;
    const finaleInstruction = includesSeriesEnding
        ? `
【结尾集收尾要求】
- 本批次已经覆盖到整部作品的最终章节，最后一集必须承担全剧结尾功能。
- 最后一集除了可以保留必要的结尾情绪张力外，更重要的是给出明确的“结尾收尾”信息，用于说明主线如何落地、人物命运如何安放、情绪余韵如何收束。
- 终局集禁止为了强行续看而硬留悬念，优先保证结局兑现、关系落点和主题闭环。`
        : '';

    const prompt = `
# Role
你是一名追求**逻辑严密**和**原著还原度**的精品短剧编剧。
你反感市面上那种为了“爽”而逻辑崩坏、强行降智的“无脑短剧”。你擅长在保留原著韵味的基础上，通过视听语言提升节奏感，而不是通过魔改剧情。

# Task
请阅读提供的【小说正文片段】，并结合【剧情主线架构】，将其改编为一份**分集大纲**。
起始集数编号为：${startEpisodeId}

### ⚠️ 章节覆盖与衔接要求 (关键)
本批次小说内容涵盖：**第 ${startChapter} 章 至 第 ${endChapter} 章**。
1. **全量覆盖**：你生成的这些集数**必须**完整覆盖从第 ${startChapter} 章到第 ${endChapter} 章的所有核心剧情，严禁漏掉中间的章节。
2. **严禁重叠**：每一集对应的章节范围**不得**与前后集重复。例如，如果第一集是“第1-2章”，第二集必须从“第3章”开始，不能也包含“第2章”。
3. **首尾衔接**：
   - 本批次第一集对应的起始章节必须是：**第 ${startChapter} 章**。
   - 本批次最后一集对应的截止章节必须是：**第 ${endChapter} 章**。

【宏观基调与上帝视角】（仅供了解全局逻辑和埋伏笔，切勿将未来剧情写进本批次）
- 故事精神内核（成长主轴）：${blueprint.growthArc?.summary || '无'}
- 全局剧情轮廓（累计剧情摘要）：${blueprint.summarySoFar || '暂无全局摘要'}
${blueprint.mysteryArc?.summary ? `- 宿命与暗线全局提示：${blueprint.mysteryArc.summary}` : ''}
${mysteryNodesContext ? `\n【当前批次精准触发的暗线任务】：\n${mysteryNodesContext}` : ''}

【本集核心任务】（你当前必须严格执行的戏份）
本批次核心事件流：
${mainPlotContext ? mainPlotContext.substring(0, 3000) : '未匹配到本章核心主线事件，请完全依据小说原文进行过渡安排'} ...

${continuityInstruction}
${globalPacingInstruction}
${finaleInstruction}

【小说正文片段（第${startChapter}-${endChapter}章）】：
${novelText.substring(0, 40000)} ...

# Core Philosophy (短剧改编核心原则)
1.  **节奏先行 (Pacing First)**：
    -   **拒绝注水**：去掉原著中冗长的心理描写和环境铺垫。
    -   **快节奏切分**：确保每集都有明确的冲突、悬念或情绪高潮。
2.  **视觉化改编 (Visual Tension)**：
    -   将原著的心理描写转化为具象的动作、表情或视觉冲突。
    -   **适度压缩 (Smart Compression)**：将次要情节进行适度合并或略写，聚焦核心主线。
3.  **情节连贯与伏笔 (Logical Flow & Foreshadowing)**：
    -   在快节奏的同时保证基本的行为逻辑。
    -   **【暗线强制要求】**：如果本批次情节与上述的【宿命与暗线】有任何微小的关联，请务必在生成大纲时，利用 "foreshadowing" (伏笔) 或开篇/结尾钩子字段埋下悬念线索，切忌平铺直叙。
4.  **画面先行**：
    -   分集大纲的描述请尽量**画面化**。

${episodeConstraint}

${viralTips ? `
# 爆款创作技巧（重要）
用户提供了以下创作技巧要求，请在生成分集大纲时**严格遵循**这些指导原则：

${viralTips}

**应用要求**：
- 在规划每一集的剧情时，将上述技巧融入到情节设计、冲突设置、悬念铺垫中
- 确保每集都能体现这些爆款元素，提升观众的观看体验
- 在 mainPlot 描述中体现这些技巧的应用
` : ''}

# Output Requirements
**Metadata Extraction**:
- **targetChapter**: 【重要】必须标注**完整且连续**的章节，格式如”第5章”、”第5-6章”。
- **严禁**：章节重叠、章节跳跃、或使用模糊描述。
- **严禁半章**：不要写“第8章前半”“第8章后半”“第8章上半”“第8章下半”等部分章节定义。
- **严禁跨集重复章号**：同一章节号只能归属于一个剧集梗概。

# Output JSON Requirements
**CRITICAL**: You must output ONLY valid JSON. **DO NOT** include any conversational text.

{
  "pacing_strategy": "（请先分析本批次内容的信息密度，结合短剧快节奏要求，简述你的压缩和拆分策略，明确你要拆分成几集，以及每集对应哪几章。这有助于你进行精确的逻辑推演。）",
  "episodes": [
    {
      "title": "第X集：标题",
      "mainPlot": "剧情描述（300字左右）",${startEpisodeId === 1 ? '\n      "openingHook": "开篇情境",' : ''}
      "endingHook": "结尾钩子或悬念（如果不是终局集，优先填写）",
      "endingClosure": "仅当本集是全剧结尾集时填写：这一集如何完成最终收尾、人物落点与情绪余韵",
      "keyQuotes": "本集原著金句",
      "foreshadowing": "本集伏笔",
      "worldSetting": "关键道具/规则",
      "targetChapter": "第X-Y章",
      "appearingCharacterNames": ["主角名", "配角名"]
    }
  ]
}
`;

    try {
        const response = await callUniversalAPI(config, modelId, [{ role: 'user', content: prompt }], {
            responseFormat: { type: 'json_object' },
            timeout: 120000,
            maxRetries: 1,
        });

        const parsed = await parseDraftEpisodesResult(response.text, apiKey, baseUrl);
        const episodes = normalizeEpisodeTargetChapters(parsed, startChapter, endChapter);
        return episodes;
    } catch (e) {
        console.error("Reconstruction Failed", e);
        throw e;
    }
};

export const parseOutlineWithAI = async (
  apiKey: string,
  rawOutline: string,
  baseUrl?: string
): Promise<{
  characterList: CharacterProfile[];
  openingHook: string;
  foreshadowing: string;
  keyQuotes: string;
  worldSetting: string;
  mainPlot: string;
  targetChapter: string;
}> => {
  const parseModel = '[次]gemini-3-flash-preview';
  const config = getAPIConfig(apiKey, baseUrl, parseModel);

  const prompt = `
你是一个专业的剧本大纲分析助手。
请分析以下【原始分集大纲】，并将其拆解分类为结构化数据。
**原则**：
1. **不改变原意**：尽量保留原始信息，只是做分类搬运。
2. **提取与归纳**：
   - **出场人物 (characterList)**：请提取所有人物，并尝试简要概括该人物在本集中的**人设状态/心理/目的**（例如："简初夏：刚出狱，满怀仇恨"）。
   - 将"开篇/开头/钩子"提取到 openingHook（如果没有就不提取，保留空）。
   - 将"伏笔/铺垫"提取到 foreshadowing。
   - 将"金句/台词"提取到 keyQuotes。
   - 将"背景/世界观/核心设定"提取到 worldSetting。
   - 将"对应章节"提取到 targetChapter。
   - **targetChapter 只能保留完整章节**：只允许“第8章”或“第8-9章”，禁止“第8章前半/后半”等半章写法。
   - **剧情梗概 (mainPlot)**：对应原大纲中的"剧情描述"内容，保持信息一致，不要随意删减。
3. 如果某项信息原文中没有，则留空。

【原始分集大纲】：
${rawOutline}

请输出 JSON 格式：
{
  "characterList": [{ "name": "人物姓名", "desc": "该人物本集的人设、状态或目的" }],
  "openingHook": "开篇钩子或看点(如果没有则留空)",
  "foreshadowing": "伏笔或铺垫(如果没有则留空)",
  "keyQuotes": "金句或关键台词",
  "worldSetting": "世界观、背景或核心设定",
  "mainPlot": "原剧集大纲信息中的剧情描述",
  "targetChapter": "对应的原著章节号"
}
`;

  try {
    const response = await callUniversalAPI(config, '[次]gemini-3-flash-preview', [{ role: 'user', content: prompt }], {
        responseFormat: { type: 'json_object' },
        timeout: 60000,
    });

    const result = await parseOutlineParseResult(response.text, apiKey, baseUrl);
    return {
      ...result,
      targetChapter: canonicalizeChapterRangeText(result.targetChapter || '')
    };

  } catch (error) {
    console.error("Outline Parsing Error:", error);
    // Fallback
    return {
      characterList: [],
      openingHook: "",
      foreshadowing: "",
      keyQuotes: "",
      worldSetting: "",
      mainPlot: rawOutline,
      targetChapter: ""
    };
  }
};
