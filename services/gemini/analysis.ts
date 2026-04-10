import { AnalyzedCharacter, CharacterStage, PlotPhase, StoryBlueprint } from '../../types';
import { callUniversalAPI, getAPIConfig, getPromptMaxChars } from '../apiClient';
import { safeJsonParseAsync, calculateTimeout } from '../utils/jsonUtils';
import { extractBatchChapterIds, normalizePlotPhases, normalizeStageMappings } from '../../utils/chapterRangeNormalization';

// Removed local getPromptMaxChars to use centralized version from apiClient

// Architecture Merge Logic Helper
function mergeArchitectureIntoBlueprint(currentBlueprint: StoryBlueprint, archResult: any): StoryBlueprint {
    currentBlueprint.summarySoFar = archResult.updatedCumulativeSummary || currentBlueprint.summarySoFar;
    
    if (archResult.growthArc) {
        currentBlueprint.growthArc.summary = archResult.growthArc.summary || currentBlueprint.growthArc.summary;
        if (archResult.growthArc.newNodes) {
             currentBlueprint.growthArc.nodes = [...currentBlueprint.growthArc.nodes, ...archResult.growthArc.newNodes];
        }
    }
    if (archResult.conflictArcNodes) {
        currentBlueprint.conflictArc.nodes = [...currentBlueprint.conflictArc.nodes, ...archResult.conflictArcNodes];
    }
    if (archResult.relationshipNodes) {
        currentBlueprint.relationshipArc.nodes = [...currentBlueprint.relationshipArc.nodes, ...archResult.relationshipNodes];
    }
    if (archResult.mysteryNodes) {
        currentBlueprint.mysteryArc.nodes = [...currentBlueprint.mysteryArc.nodes, ...archResult.mysteryNodes];
    }
    return currentBlueprint;
}

const systemPromptStr = `你是一个纯 JSON 输出机器。
## 输出铁律（最高优先级）
1. 你的回复必须是且仅是一个合法的 JSON 对象
2. 直接以 { 开头，以 } 结尾
3. 严禁输出任何 markdown 标记、代码块标记、解释性文字、前缀或后缀
4. 所有 JSON 字符串值内部，绝对禁止使用未转义的 ASCII 双引号，如需引用请用中文引号『』或【】
5. 字符串值内部禁止出现未转义的换行符
`;

export const analyzeArchitectureOnly = async (
    apiKey: string,
    novelText: string,
    currentBlueprint: StoryBlueprint | null,
    baseUrl?: string,
    modelId: string = '[次]gemini-3-pro-preview-thinking'
) => {
    const config = getAPIConfig(apiKey, baseUrl, modelId);

    const lastGrowthNode = currentBlueprint?.growthArc.nodes.length
        ? currentBlueprint.growthArc.nodes[currentBlueprint.growthArc.nodes.length - 1]
        : null;
    const lastConflictNode = currentBlueprint?.conflictArc.nodes.length
        ? currentBlueprint.conflictArc.nodes[currentBlueprint.conflictArc.nodes.length - 1]
        : null;
    const lastGrowthStage = lastGrowthNode ? lastGrowthNode.stage : "无";
    const lastConflictStage = lastConflictNode ? lastConflictNode.stage : "无";

    const summaryContext = currentBlueprint ? `
    【前文剧情摘要】：${currentBlueprint.summarySoFar}
    【当前进度】：已分析约 ${currentBlueprint.analyzedChapters} 章
    【上一个成长/进化阶段】：${lastGrowthStage}
    【上一个对抗/势力阶段】：${lastConflictStage}
    ` : "这是小说的开篇分析。";

    const systemPrompt = systemPromptStr;
    const userPrompt = `# Role
你是一名资深网文主编和剧情架构师。
# Task
请根据【小说最新章节】，提取"故事三维架构"和"暗线"。
${summaryContext}

# Input Text
${novelText.substring(0, getPromptMaxChars(modelId))} ...

# Continuity Instruction (CRITICAL - 连贯性要求)
这是一个**长篇连续剧**的分析任务。请注意：
1. **绝对一致的阶段命名**：不要机械地开启新阶段。如果本批次剧情属于上一个"成长阶段"或"对抗阶段"的延续，**必须一字不差地复用**上一个阶段的名称（如 \`${lastGrowthStage}\` 或 \`${lastConflictStage}\`）。只有发生了重大的境界突破或换地图，才能创建新阶段名。绝对不要添加"（延续）"、"（二）"等后缀。
2. 重点分析本批次新增的【关键事件】和【冲突结果】。

# Extraction Rules
A. **成长/进化线 (Growth)**：主角"从何处来—到何处去"的轨迹（能力/地位/认知）。**【颗粒度要求：宏观总结】**：请仅捕捉具有里程碑意义的重大提升（如大境界突破、阶层跨越、核心能力觉醒）。严禁记录零碎的小经验增长或重复性的日常琐事，保持主轴的简洁与高级感。
B. **羁绊/团队线 (Bond)**：主角与队友/CP/宿敌的关系演变与高光互动。**【颗粒度要求：详尽解析】**请写出具体的互动细节、情感转变的深层契机以及双方的深层羁绊，绝不能只写干瘪的一句话。
C. **对抗/势力线 (Conflict)**：【冲突原因】+【主角应对策略】+【结果与收益】（遵循公式：危机+策略/金手指+破局=收获）。**【颗粒度要求：详尽解析】**请详细描述双方是如何博弈的，敌人的打压手段是什么，主角破局的具体反击手法、使用的大招是什么，绝不能泛泛而谈。
D. **暗线/宿命线 (Mystery)**：身世秘密、复仇线索、全局伏笔。**【动态章节标记要求】**：你必须为每一条被发掘的暗线明确标注 \`foreshadowingChapter\`（伏笔最初被埋下/出现的章节号，例如"第5章"或"第5-8章"）和 \`payoffChapter\`（如果这段伏笔在本批次或前文中已经回收/揭晓，填写揭晓的章节号；如果尚未回收，请严格填写"暂无"）。系统将利用这两个字段在未来的单集创作中实施精准触发机制。
E. **累计剧情大纲 (动态更新)**：将提取的【前文剧情摘要】与本批次核心剧情相融合，重新编写一份从开头一直到当前最新进度的**完整、连贯**的总体故事大纲。不要只是机械地把两段文字拼在一起，要改写成一段自然流畅、涵盖全剧前因后果的全局主线摘要。

# Output JSON Requirements
**CRITICAL**: You must output ONLY valid JSON. **DO NOT** include any conversational text, explanations, or markdown blocks before or after the JSON object.

**JSON字符串值铁律**：
- 所有 JSON 字符串值内部，绝对禁止使用未转义的 ASCII 双引号。如果必须在文本中引用书名或专有名词，请改用中文引号『』或【】或直接省略引号。
- 绝不允许在字符串值中出现未转义的换行符。

{
  "updatedCumulativeSummary": "string",
  "growthArc": { "summary": "string", "newNodes": [ { "stage": "string", "event": "string", "action": "string", "result": "string" } ] },
  "conflictArcNodes": [ { "stage": "初级/中级等", "antagonist": "string", "conflict": "string(要求详尽)", "result": "string(要求详尽)" } ],
  "relationshipNodes": [ { "character": "string", "identity": "string", "change": "string(要求详尽)" } ],
  "mysteryNodes": [ { "origin": "string", "progress": "string", "suspense": "string", "foreshadowingChapter": "第X章", "payoffChapter": "第Y章或暂无" } ]
}`;
    
    const response = await callUniversalAPI(config, modelId, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ], {
        temperature: 0.3,
        maxTokens: 57344,
        responseFormat: { type: 'json_object' },
        timeout: 120000,
    });

    return await safeJsonParseAsync(response.text, "Architecture", apiKey, baseUrl, true);
};

export const analyzeOutlineOnly = async (
    apiKey: string,
    novelText: string,
    currentBlueprint: StoryBlueprint | null,
    baseUrl?: string,
    modelId: string = '[次]gemini-3-pro-preview-thinking'
) => {
    const config = getAPIConfig(apiKey, baseUrl, modelId);
    
    const batchChapterIds = extractBatchChapterIds(novelText);
    const startChapter = batchChapterIds.length > 0 ? batchChapterIds[0] : 1;
    const endChapter = batchChapterIds.length > 0 ? batchChapterIds[batchChapterIds.length - 1] : startChapter + 9;

    const lastPhase = currentBlueprint?.mainPlotArc.phases.length
        ? currentBlueprint.mainPlotArc.phases[currentBlueprint.mainPlotArc.phases.length - 1]
        : null;
    const lastPhaseName = lastPhase ? lastPhase.phaseName : "无";
    const lastEvent = lastPhase?.events.length
        ? lastPhase.events[lastPhase.events.length - 1]
        : null;
    const lastEventTitle = lastEvent ? lastEvent.title : "无";
    const lastEventSummary = lastEvent ? lastEvent.summary : "无";

    const summaryContext = currentBlueprint ? `
    【前文剧情摘要】：${currentBlueprint.summarySoFar}
    【上一个剧情阶段(Last Phase)】：${lastPhaseName}
    【上一个大事件(Last Event)名称】：${lastEventTitle}
    【上一个大事件(Last Event)摘要】：${lastEventSummary}
    ` : "这是小说的开篇分析。";

    const systemPrompt = systemPromptStr;
    const continuityInstruction = (lastPhaseName !== "无" && lastEventTitle !== "无") 
        ? `
# Continuity Instruction (CRITICAL - 连贯性要求 & 动态更新)
你正在处理长篇小说的中间部分。文本的开头通常紧接【上一个大事件】。
1. **阶段软边界 (Phase Boundary)**：如果剧情依然属于【${lastPhaseName}】这个大阶段，**必须一字不差地复用** \`${lastPhaseName}\` 作为 \`phaseName\`。只有名称完全一样，系统才能将跨批次的章节正确合并为同一个长阶段。
2. **事件动态合并铁律 (Event Merge Rule)**：如果本批次继续在写【${lastEventTitle}】这个未完结的大事件（即使发生了一些小剧情推进，只要核心事件跨度没结束），你**必须一字不差地复用** \`${lastEventTitle}\` 作为 \`title\`！系统会自动捕捉到相同的 \`title\`，并将本批次和上一批次缝合为同一个更宏大的动态事件，并用你本次提取的结构去【动态更新】旧大纲！只有开启全新的剧作大板块时，才能启用新的 \`title\`。
`
        : `
# Continuity Instruction (CRITICAL - 连贯性要求)
这是小说的开篇或全新的故事转折点。请根据【小说最新章节】的宏大叙事内容，**自行提炼并命名**一个极具网文吸引力的 \`phaseName\` (如：第一卷：潜龙在渊) 和 \`title\` (如：初入仙门)。
`;

    const userPrompt = `# Role
你是一名精通商业小说节奏铺排的剧情策划。

# Task
请根据【小说最新章节】，输出一份**结构化、数据化、可直接用于分集**的**主线大纲**。
${summaryContext}

# Input Text
${novelText.substring(0, getPromptMaxChars(modelId))} ...
${continuityInstruction}

# Chapter Range Rules (章节映射铁律 - 绝对强制)
本批次小说内容确定涵盖：**第 ${startChapter} 章 至 第 ${endChapter} 章**。
1. **全量完整覆盖（最高优先级指令）**：你回复中的 \`phases\` 和 \`events\` 必须**百分之百完整覆盖**从第 ${startChapter} 章到第 ${endChapter} 章的所有内容！**严禁漏掉结尾章节**。
2. **末尾对齐**：最后一个事件的 \`range\` 必须包含且**中止于第 ${endChapter} 章**。绝对不允许在第 ${endChapter} 章之前提前结束生成。
3. **首向对齐**：第一个事件的 range 必须从第 ${startChapter} 章开始。
3. **禁止半章**：range 只能写完整章节，如“第8章”或“第8-9章”，严禁“第8章前半”“第8章后半”“第8章上半”“第8章下半”等写法。
4. **禁止跨阶段重复章号**：同一章节号只能归属于一个 Phase。即使转折发生在单章内部，也必须把整章只归到一个阶段，不能让不同阶段重复使用相同章节号。

# Structural Requirements (必须严格执行)
请将内容按剧情阶段（Phase）和具体大事件（Events）进行拆解。

**【CRITICAL: 合理的阶段与小节层级控制 (MACRO LEVEL)】**
1. **阶段 (Phase) 的自然划分**：Phase 代表的是一个完整的故事大篇章（如：外门大比篇、退婚风波篇）。一个阶段的跨度**视剧情而定，可能只有几章，也可能长达几十上百章**。不管长短，只有当一个完整的核心事件群彻底结束，或者发生地图更换、核心矛盾转移时，才应该开启新的 Phase。**绝对禁止把每一个零散的小剧情板块都当成一个独立的 Phase！**
2. **事件 (Event) 的强制极度压缩**：在 Phase 内部，你必须进行**超级事件概括**。**绝对禁止“一两章提取一个事件”的流水账式概括！**（例如绝不能出现类似“第1章发生什么、第2章发生什么”的细碎划分）。请将连续多个章节里的前因后果、日常、打斗，**强制合并打包为一段宏大的时间轴事件（Event）**。建议在一次 10 章左右的批次中，最多只允许提炼出 1 到 3 个核心超级大事件。请无情地将相关小事件压缩并融入同一个 Event 中，坚决消除琐碎的细节！

对于每一个核心大事件（Event），必须包含以下 5 个维度的详细信息：

1. **剧情主线 & 改编重要度**：
   - **summary**: 100字左右，剔除旁白和心理活动，动作骨架（谁+做了什么+结果如何）。
   - **importance**: 打分 1-5 (5=核心转折/死亡/揭秘, 3=铺垫/升级, 1=注水/日常)。

2. **关键情节点 & 情绪浓度** (plotPoints):
   - 按时间序列出 3-5 个情节点。
   - **emotionalScore**: 1-10分 (10分=极度震撼/爽点/泪点)。
   - **emotionalTag**: 情绪标签 (如: 逆袭打脸, 绝望, 甜蜜)。
   - **foreshadowing**: 若有伏笔，请简述，否则留空。

3. **世界观设定补充** (worldview):
   - **powerSystem**: 新等级/技能。
   - **items**: 法宝/丹药。
   - **geography**: 新地图/势力。
   - **monsters**: 异兽/NPC。
   - (若无新设定则留空)

4. **金手指 (Golden Finger)** (goldenFinger):
   - **definition**: 主角打破规则的优势/系统/异能。
   - **impact**: 本事件中起了什么具体作用？
   - **cost**: 代价或限制。
   - **ruleBreaker**: 它是如何打破常规世界观规则的？

5. **金句 (Quotes)**:
   - 提取最具冲击力或符合人设的台词 1-3 句。

# Output JSON Requirements
**CRITICAL**: You must output ONLY valid JSON. **DO NOT** include any conversational text, explanations, or markdown blocks before or after the JSON object.

**JSON字符串值铁律**：
- 所有 JSON 字符串值内部，绝对禁止使用未转义的 ASCII 双引号。如果必须引用专有名词，请改用中文引号『』或【】。
- 绝不允许在字符串值中出现未转义的换行符。

{
  "phases": [
    {
      "phaseName": "例如：第一阶段：起——绝境重生...",
      "events": [
         {
            "title": "例如：绝境觉醒",
            "range": "例如：1-3章",
            "summary": "...",
            "importance": 5,
            "plotPoints": [
                { "description": "...", "emotionalScore": 10, "emotionalTag": "爽点", "foreshadowing": "..." }
            ],
            "worldview": { "powerSystem": "...", "items": "..." },
            "goldenFinger": { "definition": "...", "impact": "..." },
            "quotes": ["..."]
         }
      ]
    }
  ]
}`;

    const response = await callUniversalAPI(config, modelId, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ], {
        temperature: 0.3,
        maxTokens: 57344,
        responseFormat: { type: 'json_object' },
        timeout: 120000,
    });

    const result = await safeJsonParseAsync(response.text, "Outline", apiKey, baseUrl, true);

    return {
        ...result,
        phases: normalizePlotPhases(Array.isArray(result?.phases) ? result.phases : [], batchChapterIds)
    };
};

export const analyzeCharactersOnly = async (
    apiKey: string,
    novelText: string,
    currentCharacters: AnalyzedCharacter[],
    baseUrl?: string,
    modelId: string = '[次]gemini-3-pro-preview-thinking'
) => {
    const config = getAPIConfig(apiKey, baseUrl, modelId);

    const prevContextChar = currentCharacters.map(c => {
        const lastStage = c.timeline.length > 0 ? c.timeline[c.timeline.length-1] : null;
        return `- 【${c.name}】: 上一个阶段名为「${lastStage ? lastStage.stageName : "Initial"}」`;
    }).join('\n');

    const systemPrompt = systemPromptStr;
    const userPrompt = `# Role
你是一名精通网文人设和剧情逻辑的人物侧写师。

# Task
请仔细阅读【小说最新章节】，提取并生成**本批次文本中所有出场人员**（包括主角、配角、反派及关键龙套）的【动态人物档案】。

## ⚠️ 核心要求 (Must Follow)
1. **全员提取**：不要只盯着主角！必须识别本章节中出现的**每一个**有名字、有台词或对剧情有影响的人物。
2. **新旧判定**：
   - **新人物**：如果人物未在【已有角色列表】中出现，请为其创建一个完整的档案（static_profile + initial stage）。
   - **已有人物**：如果人物已在列表中，请对比其在本章中的表现，决定是【动态更新】还是【新增阶段】。

# Dynamic Update & Split Logic (动态合并与拆分逻辑 - 中等颗粒度平衡)
【平衡指令】：人物的“阶段(Stage)”需要反映出角色在**一段主要剧情线（通常跨度十到二十章）**中的核心状态。既不能一章一变，也不能几十章一成不变。

1. **常规合并 (复用旧名)**：如果该角色在本章只是推进日常、经历小战斗、获得普通物品、结交朋友，其**大境界、所处的核心环境、主要身份都没有变**，你**必须一字不差地复用** \`last_known_stage_name\`，将新细节合入其中。
   - ❌ 错误示范：只是打赢了一场小比武，就新建“比武夺冠的杂役”。（应继续用“杂役弟子”）
   - ❌ 错误示范：刚拿到一把新剑，就叫“获得神剑的高手”。（阶段名复用旧的，剑写进道具里）

2. **适度拆分 (启用新名)**：当发生以下**剧情大节点**时，请**果断结束上一个阶段，启用新的阶段名**（新阶段名要能精辟概括接下来的状态）：
   - **大境界突破**：如从“练气期”突破到“筑基期”（小境界如练气三层到四层不拆，必须是大境界）。
   - **大地图转换/核心身份变化**：如从“外门杂役”晋升并进入内门成为“内门精英”，或者从“新手村”彻底离开进入“修仙界主城”。
   - **重大事件导致心态或境遇巨变**：如经历宗门覆灭后开启“流亡复仇者”阶段，或在某个秘境中经历生死蜕变。
   
   **【判断标准】：问自己“这段剧情是不是标志着小说进入了下一个大篇章或副本？”，如果是，就新建阶段；如果只是当前副本中的一环，就复用旧名。**

# Context Data
## 【已有角色及最后阶段名】
${prevContextChar || "（暂无已有角色）"}

## 【小说最新章节文本】
${novelText.substring(0, getPromptMaxChars(modelId))} ...

# Data Schema Requirements (扁平化结构 - 减少嵌套)
对于每个角色，请输出如下 JSON 结构：
- **static_profile**: 姓名、性别、籍贯、角色定位（男主/女主/反派/配角/龙套）、简介。
- **new_stages**: 一个数组。每个阶段对象的字段全部平铺（不要嵌套子对象）：
  - stage_name: 阶段名称（注意复用逻辑）
  - text_range: 章节范围文本，如"第8章"或"第8-9章"
  - chapter_start: 起始章节号(数字)
  - chapter_end: 结束章节号(数字)
  - appearance: 外貌描述
  - physical_state: 身体/境界状态
  - signature_props: 标志性道具/武器
  - core_goal: 当前核心目标
  - speaking_style: 说话风格
  - personality_tags: 性格标签数组
  - relations: 关系网络数组 [{"target":"对象名","attitude":"态度","subtext":"关系说明"}]

## 关系网络补充说明 (subtext 字段要求)
每个关系的 subtext 字段**严禁留空**，必须填写具体的关系深层描述，包含互动细节、心理认知变化、利用价值等。例如：
- ✘ 错误示范: "subtext":"" 或 "subtext":"敌对"
- ✔ 正确示范: "subtext":"通过赌约彻底让其归心，视为未来的左膀右臂"

## 章节映射铁律
1. 禁止半章：text_range 只能写完整章节，严禁"前半""后半"等。
2. 禁止跨阶段重复章号。

# Output JSON Requirements
**CRITICAL**: 只输出合法 JSON。禁止 markdown 标记、解释文字、代码块。
- 字符串值内部禁止 ASCII 双引号，改用中文引号或单引号
- 字符串值内部禁止真实换行符
- 根节点必须是 {"characterUpdates":[...]}
- 严禁尾随逗号
- 使用紧凑 JSON 输出

{"characterUpdates":[{"static_profile":{"name":"角色名","gender":"男/女","origin":"籍贯","role":"男主/配角","bio":"简介"},"new_stages":[{"stage_name":"阶段名","text_range":"第X章-第Y章","chapter_start":1,"chapter_end":1,"appearance":"","physical_state":"","signature_props":"","core_goal":"","speaking_style":"","personality_tags":[""],"relations":[{"target":"","attitude":"","subtext":""}]}]}]}`;


    const timeoutDuration = calculateTimeout(novelText.length, modelId);
    console.log(`[Characters] 动态超时: ${timeoutDuration / 1000}s (文本长度: ${novelText.length}, 模型: ${modelId})`);

    const response = await callUniversalAPI(config, modelId, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ], {
        temperature: 0.4,
        maxTokens: 57344,
        timeout: timeoutDuration,
        responseFormat: { type: 'json_object' }
    });

    const result = await safeJsonParseAsync(response.text, "Characters", apiKey, baseUrl, true);
    const batchChapterIds = extractBatchChapterIds(novelText);

    return {
        ...result,
        characterUpdates: Array.isArray(result?.characterUpdates)
            ? result.characterUpdates.map((update: any) => ({
                ...update,
                new_stages: normalizeStageMappings(
                    Array.isArray(update.new_stages)
                        ? update.new_stages
                        : (update.new_stage ? [update.new_stage] : []),
                    batchChapterIds
                )
            }))
            : []
    };
};

export const analyzeNovelStory = async (
    apiKey: string,
    novelText: string,
    currentBlueprint: StoryBlueprint | null,
    currentCharacters: AnalyzedCharacter[],
    baseUrl?: string,
    modelId: string = '[次]gemini-3-pro-preview-thinking'
): Promise<{ blueprint: StoryBlueprint; characters: AnalyzedCharacter[]; failedTasks: string[] }> => {
    
    const isClaudeModel = modelId.toLowerCase().includes('claude');
    console.log(
        `Analyzing story (Step 1) with model: ${modelId} - ${isClaudeModel ? 'Claude Reduced Concurrency Mode (2+1)' : '3 Parallel Calls (Robust Mode)'}`
    );

    const safeRun = async <T>(promise: Promise<T>, name: string): Promise<T | null> => {
        try {
            return await promise;
        } catch (e) {
            console.error(`Error in ${name} analysis:`, e);
            return null;
        }
    };

    let archResult: any = null;
    let outlineResult: any = null;
    let charResult: any = null;

    if (isClaudeModel) {
        [archResult, outlineResult] = await Promise.all([
            safeRun(analyzeArchitectureOnly(apiKey, novelText, currentBlueprint, baseUrl, modelId), 'Architecture'),
            safeRun(analyzeOutlineOnly(apiKey, novelText, currentBlueprint, baseUrl, modelId), 'Outline')
        ]);

        charResult = await safeRun(
            analyzeCharactersOnly(apiKey, novelText, currentCharacters, baseUrl, modelId),
            'Characters'
        );
    } else {
        [archResult, outlineResult, charResult] = await Promise.all([
            safeRun(analyzeArchitectureOnly(apiKey, novelText, currentBlueprint, baseUrl, modelId), 'Architecture'),
            safeRun(analyzeOutlineOnly(apiKey, novelText, currentBlueprint, baseUrl, modelId), 'Outline'),
            safeRun(analyzeCharactersOnly(apiKey, novelText, currentCharacters, baseUrl, modelId), 'Characters')
        ]);
    }

    // 验证各结果的有效性：JSON 解析的兜底逻辑可能返回非 null 但无有效数据的结果
    // 此时应视为失败，让 UI 显示重试按钮而非"下一批"

    // archResult 需要至少有 updatedCumulativeSummary 或任一 arc 有数据
    if (archResult && !archResult.updatedCumulativeSummary
        && (!archResult.growthArc?.newNodes?.length)
        && (!archResult.conflictArcNodes?.length)
        && (!archResult.relationshipNodes?.length)) {
        console.warn('[Architecture] archResult 虽然非空但不包含有效架构数据，视为失败');
        archResult = null;
    }

    // outlineResult 需要有 phases 数组且包含至少一个事件
    if (outlineResult && (!Array.isArray(outlineResult.phases)
        || outlineResult.phases.length === 0
        || !outlineResult.phases.some((p: any) => p.events?.length > 0))) {
        console.warn('[Outline] outlineResult 虽然非空但不包含有效大纲数据，视为失败');
        outlineResult = null;
    }

    // charResult 需要有 characterUpdates 数组且包含至少一个有效角色
    const isCharResultValid = charResult
        && Array.isArray(charResult.characterUpdates)
        && charResult.characterUpdates.length > 0
        && charResult.characterUpdates.some((u: any) => u.static_profile?.name);

    if (charResult && !isCharResultValid) {
        console.warn('[Characters] charResult 虽然非空但不包含有效角色数据，视为失败');
        charResult = null;
    }

    const failedTasks: string[] = [];
    if (!archResult) failedTasks.push('arch');
    if (!outlineResult) failedTasks.push('outline');
    if (!charResult) failedTasks.push('char');

    if (!archResult && !outlineResult && !charResult) {
        throw new Error("所有分析任务均失败，请检查 API Key 或网络连接。");
    }

    let newBlueprint: StoryBlueprint = currentBlueprint ? { ...currentBlueprint } : {
        growthArc: { summary: "", nodes: [] },
        conflictArc: { nodes: [] },
        relationshipArc: { nodes: [] },
        mysteryArc: { summary: "", nodes: [] },
        mainPlotArc: { phases: [] },
        analyzedChapters: 0,
        summarySoFar: ""
    };

    if (archResult) {
        newBlueprint = mergeArchitectureIntoBlueprint(newBlueprint, archResult);
    }

    if (outlineResult && outlineResult.phases && Array.isArray(outlineResult.phases)) {
        let updatedPhases = [...newBlueprint.mainPlotArc.phases];
        
        outlineResult.phases.forEach((newPhase: PlotPhase) => {
            const lastPhase = updatedPhases.length > 0 ? updatedPhases[updatedPhases.length - 1] : null;
            const isContinuation = lastPhase && (
                lastPhase.phaseName === newPhase.phaseName || 
                lastPhase.phaseName.includes(newPhase.phaseName) || 
                newPhase.phaseName.includes(lastPhase.phaseName)
            );

            if (isContinuation) {
                const enhancedEvents = newPhase.events.map(evt => ({
                    ...evt,
                    content: evt.summary || evt.content || "No summary generated"
                }));
                
                enhancedEvents.forEach(incomingEvt => {
                    const lastEvent = lastPhase!.events.length > 0 ? lastPhase!.events[lastPhase!.events.length - 1] : null;
                    if (lastEvent && (lastEvent.title === incomingEvt.title || incomingEvt.title.includes(lastEvent.title))) {
                        const oldStart = lastEvent.range?.split('-')[0]?.trim() || lastEvent.range;
                        const newEnd = incomingEvt.range?.split('-').pop()?.trim() || incomingEvt.range;
                        if (oldStart && newEnd && oldStart !== newEnd) {
                            lastEvent.range = `${oldStart} - ${newEnd}`; 
                        }
                        lastEvent.summary = incomingEvt.summary || lastEvent.summary;
                        lastEvent.content = incomingEvt.content || lastEvent.content;
                        lastEvent.importance = incomingEvt.importance || lastEvent.importance;
                        lastEvent.plotPoints = incomingEvt.plotPoints || lastEvent.plotPoints; 
                        lastEvent.worldview = incomingEvt.worldview || lastEvent.worldview;
                        lastEvent.goldenFinger = incomingEvt.goldenFinger || lastEvent.goldenFinger;
                        if (incomingEvt.quotes && incomingEvt.quotes.length > 0) {
                            lastEvent.quotes = incomingEvt.quotes;
                        }
                    } else {
                        lastPhase!.events.push(incomingEvt);
                    }
                });
            } else {
                const enhancedEvents = newPhase.events.map(evt => ({
                    ...evt,
                    content: evt.summary || evt.content || "No summary generated"
                }));
                updatedPhases.push({ ...newPhase, events: enhancedEvents });
            }
        });
        newBlueprint.mainPlotArc.phases = updatedPhases;
    }

    const newCharacters = [...currentCharacters];
    if (charResult && charResult.characterUpdates) {
        charResult.characterUpdates.forEach((update: any) => {
            if (!update.static_profile || !update.static_profile.name) return;
            
            const charName = update.static_profile.name;
            let existingCharIndex = newCharacters.findIndex(c => c.name === charName);
            
            const mapStage = (jsonStage: any, idx: number): CharacterStage => ({
                id: Date.now().toString() + Math.random(),
                stageIndex: idx,
                stageName: jsonStage.stage_name || `阶段 ${idx}`,
                // 优先读取扁平字段，向下兼容旧嵌套格式
                sourceRange: jsonStage.text_range || jsonStage.source_mapping?.text_range || "未知章节",
                startChapter: jsonStage.chapter_start || jsonStage.source_mapping?.chapter_start || 0,
                endChapter: jsonStage.chapter_end || jsonStage.source_mapping?.chapter_end || 0,
                currentAge: jsonStage.age_status?.current_age || "未知",
                visualAgeDesc: jsonStage.age_status?.visual_age_desc || "",
                appearance: jsonStage.appearance || jsonStage.visual_layer?.appearance || "",
                physicalState: jsonStage.physical_state || jsonStage.visual_layer?.physical_state || "",
                signatureProps: jsonStage.signature_props || jsonStage.visual_layer?.signature_props || "",
                knownInfo: jsonStage.cognitive_layer?.known_info || [],
                coreGoal: jsonStage.core_goal || jsonStage.cognitive_layer?.core_goal || "",
                speakingStyle: jsonStage.speaking_style || jsonStage.voice_layer?.speaking_style || "",
                personalityTags: jsonStage.personality_tags || jsonStage.voice_layer?.personality_tags || [],
                relations: jsonStage.relations || jsonStage.relation_layer || []
            });

            let incomingStages: any[] = [];
            if (update.new_stages && Array.isArray(update.new_stages)) {
                incomingStages = update.new_stages;
            } else if (update.new_stage) {
                incomingStages = [update.new_stage];
            }

            if (existingCharIndex === -1) {
                const initialStages = incomingStages.map((s, i) => mapStage(s, i + 1));
                const newChar: AnalyzedCharacter = {
                    id: Date.now().toString() + Math.random(),
                    name: update.static_profile.name,
                    gender: update.static_profile.gender || "未知",
                    origin: update.static_profile.origin || "未知",
                    role: update.static_profile.role || "配角",
                    bio: update.static_profile.bio || "",
                    timeline: initialStages
                };
                newCharacters.push(newChar);
            } else {
                const existingChar = newCharacters[existingCharIndex];
                incomingStages.forEach((incomingStage) => {
                    const lastStage = existingChar.timeline.length > 0 ? existingChar.timeline[existingChar.timeline.length-1] : null;
                    const newStageName = incomingStage.stage_name || "";
                    if (lastStage && lastStage.stageName === newStageName) {
                        lastStage.endChapter = incomingStage.chapter_end || incomingStage.source_mapping?.chapter_end || lastStage.endChapter;
                        const incomingRange = incomingStage.text_range || incomingStage.source_mapping?.text_range || "";
                        lastStage.sourceRange = `${lastStage.sourceRange.split('-')[0]} - ${incomingRange.split('-')[1] || "..."}`;
                        lastStage.physicalState = incomingStage.physical_state || incomingStage.visual_layer?.physical_state || lastStage.physicalState;
                        lastStage.coreGoal = incomingStage.core_goal || incomingStage.cognitive_layer?.core_goal || lastStage.coreGoal;
                        lastStage.relations = incomingStage.relations || incomingStage.relation_layer || lastStage.relations;
                    } else {
                        const nextIndex = existingChar.timeline.length + 1;
                        existingChar.timeline.push(mapStage(incomingStage, nextIndex));
                    }
                });
                if (!existingChar.bio && update.static_profile.bio) existingChar.bio = update.static_profile.bio;
                if (!existingChar.origin && update.static_profile.origin) existingChar.origin = update.static_profile.origin;
            }
        });
    }

    if (!newBlueprint.protagonist && newCharacters.length > 0) {
        const protagonist = newCharacters.find(c =>
            c.role === '男主' || c.role === '女主' || c.role === '主角'
        ) || newCharacters[0];

        if (protagonist) {
            newBlueprint.protagonist = {
                name: protagonist.name,
                identity: protagonist.role || '主角'
            };
        }
    }

    return { blueprint: newBlueprint, characters: newCharacters, failedTasks };
};

export const testApiConnection = async (apiKey: string, baseUrl?: string): Promise<{success: boolean, message: string}> => {
  try {
     const testModel = '[次]gemini-3-flash-preview';
     const config = getAPIConfig(apiKey, baseUrl, testModel);
    const response = await callUniversalAPI(config, testModel, [{ role: 'user', content: 'Hi' }], {
        maxTokens: 10
    });
     return { success: true, message: "验证成功！您的配置可以正常连接 API。" };
  } catch (e: any) {
     console.error("Connection Test Failed:", e);
     let errorMsg = e.message || "未知错误";
     return { success: false, message: "连接失败: " + errorMsg };
  }
};
