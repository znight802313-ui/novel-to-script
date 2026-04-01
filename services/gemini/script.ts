import { ChatMessage, ScriptGenerationConfig, ScriptNarrativeType } from '../../types';
import { callUniversalAPI, getAPIConfig } from '../apiClient';
import { safeJsonParse } from './resultParser';
import { SYSTEM_INSTRUCTION_FIRST_PERSON, SYSTEM_INSTRUCTION_THIRD_PERSON } from './promptFactory';

export const generateEpisodeScript = async (
  apiKey: string,
  config: ScriptGenerationConfig,
  modelId: string = '[次]gemini-3-flash-preview',
  baseUrl?: string,
  options?: { signal?: AbortSignal }
): Promise<string> => {
  const apiConfig = getAPIConfig(apiKey, baseUrl, modelId);

  // 根据剧本类型选择系统指令
  const systemInstruction = config.narrativeType === 'first-person'
    ? SYSTEM_INSTRUCTION_FIRST_PERSON
    : SYSTEM_INSTRUCTION_THIRD_PERSON;

  console.log('🎬 生成剧本配置:', {
    episodeId: config.episodeId,
    episodeTitle: config.episodeTitle,
    narrativeType: config.narrativeType,
    usingInstruction: config.narrativeType === 'first-person' ? '第一人称解说' : '第三人称演绎'
  });

  // OPTIMIZATION: Reduce context size
  const shouldUseNovelReference = config.useNovelReference !== false;

  const optimizedNovelContent = shouldUseNovelReference
    ? config.novelContent.substring(0, 10000)
    : '';

  // Format Character List
  let characterContext = "";
  if (config.characterList && config.characterList.length > 0) {
      characterContext = config.characterList.map(c => `- ${c.name}：${c.desc}`).join("\n");
  } else if (config.characters) {
      characterContext = config.characters;
  }

  // Construct structured context prompt
  let structuredContext = "";

  if (config.targetChapter) structuredContext += `\n【对应原著章节】：${config.targetChapter}\n`;
  if (characterContext) structuredContext += `\n【本集出场人物及人设】：\n${characterContext}\n`;
  if (config.openingHook) structuredContext += shouldUseNovelReference
    ? `
【开篇钩子/看点】：${config.openingHook}
⚠️ 注意：开篇钩子必须基于原文剧情，不要为了"抓眼球"而编造原文中不存在的情节。
`
    : `
【开篇钩子/看点】：${config.openingHook}
⚠️ 注意：开篇钩子必须服务于本集既定剧情，不要脱离集纲主线额外发散。
`;
  if (config.endingHook) structuredContext += shouldUseNovelReference
    ? `
【结尾钩子/悬念】：${config.endingHook}
⚠️ 注意：结尾钩子必须是原文剧情的自然延伸，不要为了"悬念"而过度改编或添加原文中没有的反转。
`
    : `
【结尾钩子/悬念】：${config.endingHook}
⚠️ 注意：结尾钩子必须承接本集既有剧情，不要额外扩写脱离主线的新支线。
`;
  if (config.endingClosure) structuredContext += `\n【结尾收尾/终局落点】：${config.endingClosure}\n⚠️ 注意：如果这是结尾集，请优先完成主线落地、人物命运安放和情绪收束，不要为了强留悬念而破坏结局兑现。\n`;
  if (config.foreshadowing) structuredContext += `\n【伏笔/铺垫】：${config.foreshadowing}\n`;
  if (config.keyQuotes) structuredContext += `\n【必须包含的金句/关键台词】：\n${config.keyQuotes}\n`;
  if (config.worldSetting) structuredContext += `\n【世界观/背景/核心设定】：\n${config.worldSetting}\n`;
  if (config.viralTips) structuredContext += `\n【爆款创作技巧（重要）】：\n${config.viralTips}\n⚠️ 注意：请在剧本创作中严格遵循上述技巧要求，将这些元素融入到情节设计、冲突设置、悬念铺垫中，提升观众的观看体验。\n`;
  if (config.conflictArcFiltered) structuredContext += `\n【核心冲突博弈提示】：\n${config.conflictArcFiltered}\n`;
  if (config.relationshipArcFiltered) structuredContext += `\n【本集核心羁绊关系提示】：\n${config.relationshipArcFiltered}\n`;

  const targetWordCount = config.targetWordCount || 800;

  // 根据剧本类型构建不同的提示词
  let prompt = '';

  if (config.narrativeType === 'first-person') {
    // 第一人称解说文案的提示词

    // 构建叙述者信息提示
    let narratorPrompt = '';
    if (config.narratorInfo) {
      // 如果已有固定叙述者，强制使用
      narratorPrompt = `\n【固定叙述者】：${config.narratorInfo.name}（${config.narratorInfo.identity}）
⚠️ **重要**：本系列所有集数都必须以"${config.narratorInfo.name}"的第一人称"我"来叙述，不得更换视角！\n`;
    } else {
      // 第一集，需要提取叙述者
      narratorPrompt = `\n【叙述者提取】：这是第一集，请从【本集出场人物】中选择主角作为固定叙述者，并在生成剧本后明确告知叙述者是谁。\n`;
    }

    prompt = `
请创作第一人称解说文案：**${config.episodeTitle}** （这是全剧的第 ${config.episodeId} 集）。
${narratorPrompt}
${config.previousScriptContext
  ? `【上一集完整解说（用于故事连贯性）】：
${config.previousScriptContext}

⚠️ **衔接要求**：
- 本集必须从上一集结束的地方自然延续，不要重复上一集已讲过的情节
- 如果上一集结尾有悬念或转折，本集开头要简短回应（10-20字），然后立即进入新内容
- 保持人物关系、情绪基调与上一集一致，确保故事连贯流畅`
  : `【上一集解说参考】：无（这是第一集，请直接开始）`}
${shouldUseNovelReference && config.previousNovelTail ? `
【上一集原文结尾（衔接参考）】：
以下是上一集对应原著章节的结尾片段，本集开头的故事应自然衔接此处，不要遗漏其中未被上一集解说覆盖的情节：
${config.previousNovelTail}
` : ""}
【本集创作参数】：
${structuredContext}

【本集剧情梗概（核心剧情）】：
${config.outlineContent}

${optimizedNovelContent
    ? `【参考小说原文（用于提炼情节和细节）】：\n${optimizedNovelContent}`
    : "【参考小说原文】：无（请完全基于分集大纲进行创作）"}

请开始生成本集的第一人称解说文案。
**重要提示**：
1. 【固定视角】${config.narratorInfo ? `必须以"${config.narratorInfo.name}"的第一人称"我"来讲述` : '必须用第一人称"我"的视角讲述，且"我"必须是【本集出场人物】中的主角（通常是第一位角色）'}
2. ${shouldUseNovelReference ? '【忠实原文】剧情发展、人物行为、事件逻辑必须严格遵循【小说原文】，不得为了追求"钩子"或"爽感"而擅自改编核心剧情' : '【遵循集纲】剧情发展、人物行为、事件逻辑必须严格遵循【本集剧情梗概】与【本集创作参数】，不要偏离既定主线'}\n3. ${shouldUseNovelReference ? '【开篇抓人】开篇应选择原文中自然存在的冲突点，可以调整叙事顺序，但不要编造原文中不存在的情节。如果不是第一集，要先用10-20字自然衔接上一集' : '【开篇抓人】开篇应从当前集纲中自然存在的冲突点切入，可以调整叙事顺序，但不要额外编造与设定冲突的新情节。如果不是第一集，要先用10-20字自然衔接上一集'}
4. 【快节奏】快节奏、高信息密度、口语化表达
5. 【系统提示】系统提示用【...】格式突出显示
6. 【输出格式】输出为连续的文本段落，不需要场景号、角色名等剧本格式
7. 【避免重复】仔细检查上一集内容，本集不要重复已讲过的情节，要推进新的故事发展
8. 【逻辑自洽】确保改编后的剧情前后逻辑一致，不能因为追求单集效果而埋下后续剧情的逻辑bug
9. **目标字数：约 ${targetWordCount} 字**（请控制在 ${Math.floor(targetWordCount * 0.8)} - ${Math.floor(targetWordCount * 1.2)} 字之间）
`;
  } else {
    // 第三人称演绎剧本的提示词
    prompt = `
请创作剧本：**${config.episodeTitle}** （这是全剧的第 ${config.episodeId} 集）。

【上一集完整剧本（用于连贯性）】：
${config.previousScriptContext || "无（这是第一集，请直接开始）"}
${shouldUseNovelReference && config.previousNovelTail ? `
【上一集原文结尾（衔接参考）】：
以下是上一集对应原著章节的结尾片段，本集开头的剧情应自然衔接此处，不要遗漏其中未被上一集剧本覆盖的情节：
${config.previousNovelTail}
` : ""}
【本集创作参数】：
${structuredContext}

【本集剧情梗概（核心剧情）】：
${config.outlineContent}

${optimizedNovelContent
    ? `【参考小说原文（用于提炼台词和细节）】：\n${optimizedNovelContent}`
    : "【参考小说原文】：无（请完全基于分集大纲进行创作，自行补充合理的细节和对话）"}

请开始生成本集剧本。
**强制格式要求**：
1. 首行标题必须是：【第${config.episodeId}集】
2. 场景编号格式：${config.episodeId}-1, ${config.episodeId}-2 ...
3. 包含开场抓人点、视觉镜头⊿、内心OS。
4. **目标字数：约 ${targetWordCount} 字**（请控制在 ${Math.floor(targetWordCount * 0.8)} - ${Math.floor(targetWordCount * 1.2)} 字之间）

**⚠️ 核心原则（最高优先级）**：
1. ${shouldUseNovelReference ? '**忠实原文**：剧情发展、人物行为、事件逻辑必须严格遵循【小说原文】，不得为了追求"钩子"或"爽感"而擅自改编核心剧情。' : '**遵循集纲**：剧情发展、人物行为、事件逻辑必须严格遵循【本集剧情梗概】与【本集创作参数】，不要偏离既定主线。'}\n2. ${shouldUseNovelReference ? '**提炼而非创造**：可以调整表达方式、节奏和镜头语言，但不能改变事件本质或添加原文中不存在的情节。' : '**补足而不跑偏**：可以补充合理的场面细节、台词和镜头语言，但不能改动既定事件走向，也不要新增与设定冲突的重要情节。'}\n3. **逻辑自洽**：确保改编后的剧情前后逻辑一致，不能因为追求单集效果而埋下后续剧情的逻辑bug。\n4. ${shouldUseNovelReference ? '**钩子基于原文**：开场和结尾的钩子必须是原文剧情中自然存在的冲突点，不要凭空编造。' : '**钩子基于既有剧情**：开场和结尾的钩子必须来自本集既定剧情冲突，不要额外扩写无关支线。'}
`;
  }

  try {
    console.log('📤 发送 API 请求，使用系统指令:', systemInstruction.substring(0, 100) + '...');

    const response = await callUniversalAPI(apiConfig, modelId, [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.75,
        signal: options?.signal
    });
    return response.text || "生成内容为空";
  } catch (error) {
    console.error("Script Generation Error:", error);
    throw error;
  }
};

/**
 * 从第一集剧本中提取叙述者信息
 * 用于第一人称解说模式，确保后续集数使用相同的叙述者视角
 */
export const extractNarratorFromScript = async (
  apiKey: string,
  firstEpisodeScript: string,
  characterList: { name: string; desc: string }[],
  modelId: string = '[次]gemini-3-flash-preview',
  baseUrl?: string
): Promise<{ name: string; identity: string } | null> => {
  const apiConfig = getAPIConfig(apiKey, baseUrl, modelId);

  const characterContext = characterList.map(c => `- ${c.name}：${c.desc}`).join("\n");

  const prompt = `
请分析以下第一人称解说剧本，识别出叙述者是谁。

【剧本内容】：
${firstEpisodeScript.substring(0, 2000)}

【出场人物列表】：
${characterContext}

请以JSON格式返回叙述者信息：
{
  "name": "叙述者角色名",
  "identity": "身份描述（如：女主角、男主角、配角等）"
}

**要求**：
1. 叙述者必须是【出场人物列表】中的某一个角色
2. 通常是剧本中以第一人称"我"讲述故事的主角
3. 只返回JSON，不要其他解释
`;

  try {
    const response = await callUniversalAPI(apiConfig, modelId, [
      { role: 'user', content: prompt }
    ], {
      temperature: 0.3,
      responseFormat: { type: 'json_object' }
    });

    const result = safeJsonParse(response.text, 'extractNarrator');

    if (result.name && result.identity) {
      console.log('✅ 成功提取叙述者:', result);
      return {
        name: result.name,
        identity: result.identity
      };
    }

    console.warn('⚠️ 提取叙述者失败，返回数据不完整:', result);
    return null;
  } catch (error) {
    console.error('❌ 提取叙述者时出错:', error);
    return null;
  }
};

export const refineScript = async (
  apiKey: string,
  currentScript: string,
  userInstruction: string,
  chatHistory: ChatMessage[],
  modelId: string = '[次]gemini-3-flash-preview',
  baseUrl?: string,
  selectedText?: string,
  narrativeType?: ScriptNarrativeType
): Promise<{ textResponse: string; newScript: string | null }> => {
  const config = getAPIConfig(apiKey, baseUrl, modelId);

  const historyContext = chatHistory.slice(-5).map(msg =>
    `${msg.role === 'user' ? '用户' : '模型'}: ${msg.text} ${msg.quotedText ? `(引用: "${msg.quotedText.substring(0, 30)}...")` : ''}`
  ).join('\n');

  const selectionContext = selectedText
    ? `\n【用户特意选中的待修改片段】：\n"${selectedText}"\n\n请重点针对上述选中的片段，根据用户的指令进行修改。`
    : "";

  // 根据剧本类型调整修改策略
  const scriptTypeGuidance = narrativeType === 'first-person'
    ? `\n**重要提示**：这是一份第一人称解说文案（口播稿），请保持：
1. 第一人称"我"的视角，不要改成第三人称
2. 口语化、情绪化的表达风格
3. 快节奏、高信息密度的叙事
4. 强转折词（"可笑的是"、"让我没想到的是"、"就在这时"）
5. 系统提示用【...】格式突出显示
6. 输出格式为连续文本段落，不需要场景号、角色名等剧本格式`
    : `\n**重要提示**：这是一份第三人称演绎剧本，请保持：
1. 标准剧本格式（场景号、⊿视觉符号、角色名等）
2. 视觉化的镜头语言和画面描写
3. 精简的对话（单句15字以内）
4. 内心独白用"角色名（OS）"格式`;

  const prompt = `
你是一个专业的剧本修改助手 (Script Doctor)。你的任务是根据用户的指令修改当前的剧本。
${scriptTypeGuidance}

【当前剧本内容】：
${currentScript}

${selectionContext}

【历史对话】：
${historyContext}

【用户最新指令】：
${userInstruction}

# Writing Techniques to Apply (Script Doctor Toolkit)
在执行修改时，请务必运用以下专业编剧技巧（除非用户只是让你改错别字）：
1. **Show, Don't Tell (视觉化)**: 不要让角色说出感受，要通过动作（Beat）表现出来。
   - *Bad*: "他很生气。" -> *Good*: "他猛地摔碎了杯子，玻璃渣溅了一地。"
2. **Subtext (潜台词)**: 台词表面意思和真实意图要有反差。让对话更耐人寻味。
3. **Action Lines (动作流)**: 动作描写要具体、有力，避免使用模糊的形容词。
4. **Pacing (节奏控制)**: 如果这段是冲突戏，请缩短句子，加快节奏；如果是情感戏，适当留白。

**回复要求**：
1. 首先，用自然的语言回复用户的请求（例如解释你做了什么修改）。
2. 然后，必须输出**完整的、修改后的剧本**。
3. **重要**：修改后的剧本必须包裹在 <SCRIPT_START> 和 <SCRIPT_END> 标签之间，以便我提取。例如：
<SCRIPT_START>
【第1集】
...（修改后的完整剧本内容）
<SCRIPT_END>

请保持剧本格式的专业性（场景号、⊿视觉符号等）。
`;

  try {
    const response = await callUniversalAPI(config, modelId, [{ role: 'user', content: prompt }], {
        temperature: 0.7
    });

    const fullText = response.text || "";
    
    // Extract script
    const scriptMatch = fullText.match(/<SCRIPT_START>([\s\S]*?)<SCRIPT_END>/);
    let newScript = null;
    let textResponse = fullText;

    if (scriptMatch) {
      newScript = scriptMatch[1].trim();
      textResponse = fullText.replace(/<SCRIPT_START>[\s\S]*?<SCRIPT_END>/, '').trim();
      if (!textResponse) textResponse = "已根据您的要求修改了剧本。";
    }

    return { textResponse, newScript };
  } catch (error) {
    console.error("Refine Script Error:", error);
    throw error;
  }
};
