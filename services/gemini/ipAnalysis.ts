/**
 * IP 价值分析服务
 * 对小说进行多维度评分，评估短剧改编适配度，并给出改编策略建议
 * 支持长文本（>200K chars）的增量分批分析
 */

import { callUniversalAPI, getAPIConfig, getRecommendedModel } from '../apiClient';
import { safeJsonParseAsync } from '../utils/jsonUtils';
import type { IpAnalysisReport, IpDimensionScore } from '../../types';

// ==================== 常量配置 ====================

/** 分批阈值：超过此字数启用分批分析 */
const BATCH_THRESHOLD = 200000;

/** 每批字符数 (由8万提至15万，切片更粗) */
const CHUNK_SIZE = 150000;

/** 最大批次数量（15 * 15万 = 225万字上限） */
const MAX_BATCHES = 15;

// ==================== 类型定义 ====================

/** 单批分析结果 */
interface ChunkAnalysisResult {
  dimensionScores: IpDimensionScore[];   // 8个维度的评分
  chunkSummary: string;                  // 本批内容的分析摘要
  keyFindings: string[];                 // 本批的关键发现
  strengths: string[];                  // 本批发现的优势
  weaknesses: string[];                 // 本批发现的劣势
  hookDesignScore?: number;             // 钩子设计评分（仅第一批有效）
  shortDramaCompatibility?: number;      // 短剧适配度（仅第一批有效）
  // 新增（仅第一批有效）
  aiDramaStyle?: {
    recommended: '2d_anime' | '3d_anime' | 'ai_realistic';
    scores: { '2d_anime': number; '3d_anime': number; 'ai_realistic': number };
    reasoning: string;
  };
  narrativePerspective?: {
    recommended: 'first-person' | 'third-person';
    reasoning: string;
  };
}

/** 分批分析累积器 */
interface ScoresAccumulator {
  scores: number[][];     // 各维度分数累加 [dim0_score, dim1_score, ...]
  comments: string[][];   // 各维度评语累加 [dim0_comments, dim1_comments, ...]
  strengths: string[];     // 所有批次的优势
  weaknesses: string[];    // 所有批次的劣势
  keyFindings: string[];   // 所有批次的关键发现
  chunkSummaries: string[];// 所有批次的摘要
  hookDesignScore: number | null;   // 仅第一批
  shortDramaCompatibility: number | null; // 仅第一批
  aiDramaStyle: ChunkAnalysisResult['aiDramaStyle'] | null;
  narrativePerspective: ChunkAnalysisResult['narrativePerspective'] | null;
}

// ==================== 8个评分维度定义 ====================

const DIMENSIONS = [
  { key: '剧情节奏', name: '剧情节奏', desc: '评估每十章爽点/反转密度与节奏把控。好的小说：前十章至少2-3个爽点或反转，爽点快速兑现动作落地，反转颠覆认知逻辑闭环，每2-3章有1个情绪爆点；差的小说：平铺直叙、节奏拖沓、水字数，扣分极狠。' },
  { key: '人物塑造', name: '人物塑造', desc: '评估人物改编记忆点。好的小说：主角有极端人设反差（扮猪吃虎、黑化逆袭、身份逆转等），配角功能清晰有记忆点，前十章人物性格立住；差的小说：人设模糊、脸谱化、毫无辨识度，改编后无法在短剧短时间内被记住。' },
  { key: '短剧适配度', name: '短剧改编适配度', desc: '评估小说天然适配AI短剧的程度。好的小说：章节短小精悍（每章约1000-3000字适合切1-3分钟短剧），对白口语化动作化无大段内心独白，剧情单元独立紧凑可逐集切分；差的小说：章节冗长、心理描写泛滥、环境描写堆砌，完全不适配短剧节奏。' },
  { key: '世界观设定', name: '世界观设定', desc: '评估小说世界观对短剧改编的友好度。好的小说：规则体系简洁清晰观众秒懂，视觉化元素强烈（场景动作冲突画面感强）；差的小说：修仙等级体系庞杂、多势力政治博弈、抽象概念堆积，用户理解成本高，短剧呈现困难。' },
  { key: '冲突强度', name: '冲突强度', desc: '评估矛盾冲突的尖锐度、频率与烈度。好的小说：主角处于明显对立关系中（家族恩怨身份压制情感纠葛等），冲突高频递进至高潮，打压→反杀真相揭穿身份逆转等爆点密集；差的小说：矛盾模糊、冲突稀少、平铺直叙无对立张力。' },
  { key: '情感共鸣', name: '情感共鸣', desc: '评估爽感情绪调动能力。好的小说：打脸逆袭反杀碾压等爽感密集刺激到位，读者情绪被强力调动；差的小说：情绪寡淡毫无波澜，缺乏爽点刺激。催泪共情等情感元素可加分但非必需，短剧核心是爽。' },
  { key: '钩子设计', name: '钩子设计', desc: '评估前三章开篇吸引力。好的小说：前三章内逐步建立吸引力，允许前1-2章有合理铺垫，第三章前应至少构建1个清晰悬念钩子（身份命运关系等），整体有追看欲望；差的小说：前三章平淡拖沓，悬念缺失，读者无追看动力。' },
  { key: '叙事结构', name: '叙事结构', desc: '评估主线清晰度与叙事紧凑度。好的小说：主线明确读者秒懂核心矛盾，章节衔接紧凑无游离冗余段落，起承转合自然；差的小说：主线模糊、支线干扰、节奏松散、章节之间缺乏衔接感。' },
];

// ==================== 核心 Prompt 构建 ====================

function buildChunkPrompt(
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  previousFindingsSummary: string | null,
  novelName: string,
  totalChars: number
): string {
  const isFirstChunk = chunkIndex === 0;
  const isLastChunk = chunkIndex === totalChunks - 1;

  // 维度名称必须与 DIMENSIONS 的 key 严格一致，防止模型输出不一致导致评分全部 default 到 50
  const dimensionsDesc = DIMENSIONS.map((d, idx) =>
    `${idx + 1}. ${d.name} (${d.key}) — ${d.desc}`
  ).join('\n');

  // 钩子设计只在第一批评估
  const hookNote = isFirstChunk
    ? ''
    : '\n**注意：钩子设计维度已在第一批评估，本批留空或沿用第一批评分。**';

  return `# Role
你是**铁面无私的金牌AI短剧制作人兼爆款剧本审阅专家**，拥有百亿票房操盘经验。你专门评估小说改编为**AI短剧**（包括2D动漫短剧、3D动漫短剧、AI仿真人短剧）的潜力。你审稿极其挑剔，擅长深度评估文字是否具备爆款AI短剧改编基因，并能毒舌但专业、一针见血地点出致命缺陷与核心优势。

# 重要背景
本次评估的最终目的是将小说改编为**AI短剧剧本**，最终呈现形式为AI生成的视频短剧。AI短剧有三种主要形态：
- **2D动漫**：适合玄幻修仙、异世界、二次元风格、动作打斗场面多的作品
- **3D动漫**：适合都市、现代、科幻、需要立体空间感和角色表演的作品
- **AI仿真人**：适合都市情感、现实题材、职场、家庭伦理等写实风格的作品

# 当前任务
对小说《${novelName}》（总字数：${totalChars}字）进行**第 ${chunkIndex + 1}/${totalChunks} 批**的IP价值深度解构。

${isFirstChunk ? '这是第一批（开篇内容），必须用最严苛的眼光审视：开篇钩子是否足够勾人、前三章是否立刻起爆、男主/女主出场是否有极致的人设反差。同时你必须判断该作品最适合哪种AI短剧形态，以及最适合的叙事角度。' : ''}
${isLastChunk ? '这是最后一批（收尾内容），请重点评估：高潮爆发是否到位、底牌回收是否有力、整体的最终完成度。' : ''}
${!isFirstChunk && !isLastChunk ? '这是中间批（第' + (chunkIndex + 1) + '批），请评估这部分剧情是否注水拖沓，爽点是否密集。' : ''}

${previousFindingsSummary ? `
# 之前的分析结论（继承并保持严苛标准）
${previousFindingsSummary}
` : '（本批无前置结论）'}

# 待分析内容（第 ${chunkIndex + 1}/${totalChunks} 批）
${chunk}

# 评估维度（8个维度，每个维度 0-100 分）
${dimensionsDesc}
${hookNote}

# 严苛评分原则（务必做到铁面无私！）
严格按照文本质量打分，不预设任何分布：
- **0-40分 (致命缺陷)**：毫无亮点，完全不适合短剧化，需彻底推倒重来。
- **41-60分 (平庸/低于行业线)**：套路老旧，节奏拖沓，没有足够的情绪拉扯价值。
- **61-75分 (及格/勉强可拍)**：有一定亮点，但需经过专业编剧大幅度”魔改”提纯。
- **76-85分 (良级/具备爆款潜质)**：极其优秀的表现，在10%的头部作品中才会出现。
- **86-100分 (神作级)**：完美契合短剧逻辑，可以直接拿来做分镜。（**极不轻易给出85分以上**）

⚠️ 注意：严禁做老好人，需要优劣评估分明，切勿将分数扎堆在 70-80 区间！该给 40 分的绝不手软！该给高分的就给高分！对于每个维度的 “comment” 字段，你必须**直接给出打这个分数的具体原因和核心证据**（为什么是这个分？文本里哪里没做好或者哪里做得极好？）。必须呈现极强的**专业视角**与**锋利的见解**，拒绝诸如”描写生动”、”剧情吸引人”等缺乏业内深度的废话。

# 改编策略参考
- 若总分 >= 75 且短剧适配度 >= 70 → 适合"高保真剧情压缩"（原汁原味影视化）
- 若总分 < 75 或短剧适配度 < 70 → 建议"剔骨剥皮式结构魔改"（提取设定，重新编排短剧爽点节奏）

# 强制 JSON 输出要求 (CRITICAL ERROR PREVENTION)

你必须返回一个**纯净且合法的 JSON 对象**。
1. **绝对不允许**输出任何解释性前言或后语，**不要**使用 Markdown 的 \`\`\`json 包裹，直接输出由大括号 {} 包裹的纯文本结构。
2. 你必须包含且仅包含以下根级字段，字段名必须一字不差！
3. 请在字符串值中处理好内部引号逃逸 (使用 \\" 来代替 ")。
4. "score" 必须是纯整数格式。

必须百分百照抄下面的 Key 结构模板（不要增加或更改对象层级）：

{
  "dimensionScores": [
    { "dimension": "剧情节奏", "score": 55, "comment": "你的毒舌且专业的评语..." },
    { "dimension": "人物塑造", "score": 60, "comment": "..." },
    { "dimension": "短剧适配度", "score": 45, "comment": "..." },
    { "dimension": "世界观设定", "score": 75, "comment": "..." },
    { "dimension": "冲突强度", "score": 50, "comment": "..." },
    { "dimension": "情感共鸣", "score": 65, "comment": "..." },
    { "dimension": "钩子设计", "score": 40, "comment": "..." },
    { "dimension": "叙事结构", "score": 60, "comment": "..." }
  ],
  "chunkSummary": "用制作人的口吻给出本批次极度精炼的诊断总结（最高要求专业性）",
  "keyFindings": ["专业发现点1", "专业发现点2"],
  "strengths": ["核心优势1", "核心优势2"],
  "weaknesses": ["致命弱点1", "致命弱点2"],
  "shortDramaCompatibility": 50,
  "hookDesignScore": 40${isFirstChunk ? `,
  "aiDramaStyle": {
    "recommended": "2d_anime",
    "scores": { "2d_anime": 75, "3d_anime": 55, "ai_realistic": 40 },
    "reasoning": "你对AI短剧呈现形态的专业判断理由..."
  },
  "narrativePerspective": {
    "recommended": "first-person",
    "reasoning": "你对叙事角度的专业判断理由..."
  }` : ''}
}
  `;
}

// ==================== 核心分析函数 ====================

// 归一化函数：去空格 + 去"改编"等常见冗余词 + 处理连字符
const normalizeDim = (s: string): string =>
  s.replace(/\s+/g, '').replace(/改编/g, '').replace(/[-－–—_]/g, '');

/**
 * 从原始文本中暴力提取维度评分（正则兜底方案）
 * 当 JSON 解析和 Gemini 修复全部失败时，最后一搏
 */
function regexExtractDimensionScores(rawText: string, chunkIndex: number): {
  dimMap: Map<string, any>;
  rawScores: any[];
  extras: { chunkSummary?: string; keyFindings?: string[]; strengths?: string[]; weaknesses?: string[]; shortDramaCompatibility?: number; hookDesignScore?: number };
} {
  const rawScores: any[] = [];
  const extras: any = {};

  console.warn(`[IP Analysis] 第${chunkIndex + 1}批启用正则暴力提取模式...`);

  // 策略1: 提取 "dimension": "XXX", "score": 78, "comment": "..." 模式
  const pattern1 = /"dimension"\s*:\s*"([^"]+)"\s*,\s*"score"\s*:\s*(\d+)\s*,\s*"comment"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/g;
  let m;
  while ((m = pattern1.exec(rawText)) !== null) {
    rawScores.push({ dimension: m[1].trim(), score: parseInt(m[2]), comment: m[3] });
  }

  // 策略2: 宽松模式 - "dimension": "XXX" ... "score": 78（字段可能不紧邻）
  if (rawScores.length < 4) {
    const pattern2 = /"dimension"\s*:\s*"([^"]+)"[^}]{0,500}?"score"\s*:\s*(\d+)/g;
    while ((m = pattern2.exec(rawText)) !== null) {
      const dim = m[1].trim();
      const existing = rawScores.find(r => r.dimension === dim);
      if (!existing) {
        rawScores.push({ dimension: dim, score: parseInt(m[2]), comment: '正则提取' });
      }
    }
  }

  // 策略3: 超宽松 - 直接搜索 "维度名": 数字 模式
  if (rawScores.length < 4) {
    for (const d of DIMENSIONS) {
      const existing = rawScores.find(r => normalizeDim(r.dimension) === normalizeDim(d.key));
      if (existing) continue;
      // 搜索 "剧情节奏" ... score ... 数字
      const dimPattern = new RegExp(`["']${d.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^}]{0,300}?["']?score["']?\\s*[:：]\\s*(\\d+)`, 'i');
      const dimMatch = rawText.match(dimPattern);
      if (dimMatch) {
        rawScores.push({ dimension: d.key, score: parseInt(dimMatch[1]), comment: '正则提取' });
      }
    }
  }

  // 提取顶层字段
  const compatMatch = rawText.match(/"shortDramaCompatibility"\s*:\s*(\d+)/);
  if (compatMatch) extras.shortDramaCompatibility = parseInt(compatMatch[1]);

  const hookMatch = rawText.match(/"hookDesignScore"\s*:\s*(\d+)/);
  if (hookMatch) extras.hookDesignScore = parseInt(hookMatch[1]);

  const summaryMatch = rawText.match(/"chunkSummary"\s*:\s*"([^"]{0,500})"/);
  if (summaryMatch) extras.chunkSummary = summaryMatch[1];

  // 提取 strengths / weaknesses / keyFindings 数组
  const extractStringArray = (key: string): string[] => {
    const arrayMatch = rawText.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]{0,2000})\\]`));
    if (!arrayMatch) return [];
    const items: string[] = [];
    const itemPattern = /"([^"]+)"/g;
    let itemMatch;
    while ((itemMatch = itemPattern.exec(arrayMatch[1])) !== null) {
      items.push(itemMatch[1]);
    }
    return items;
  };

  extras.strengths = extractStringArray('strengths');
  extras.weaknesses = extractStringArray('weaknesses');
  extras.keyFindings = extractStringArray('keyFindings');

  // 建立 dimMap
  const dimMap = new Map<string, any>();
  for (const item of rawScores) {
    const norm = normalizeDim(String(item.dimension || ''));
    if (norm && !dimMap.has(norm)) {
      dimMap.set(norm, item);
    }
  }

  console.log(`[IP Analysis] 正则提取结果: 提取到 ${rawScores.length} 个维度, dimMap keys=${JSON.stringify([...dimMap.keys()])}`);

  return { dimMap, rawScores, extras };
}

/**
 * 从 parsed 对象或 dimMap 中提取最终的维度评分数组
 */
function buildDimensionScores(
  dimMap: Map<string, any>,
  chunkIndex: number,
): IpDimensionScore[] {
  return DIMENSIONS.map((d) => {
    const norm = normalizeDim(d.key);
    const found = dimMap.get(norm);
    
    const score = typeof found?.score === 'number' ? found.score :
      (typeof found?.分数 === 'number' ? found.分数 :
        (typeof found?.value === 'number' ? found.value :
          (typeof found?.rating === 'number' ? found.rating : -1)));
          
    const comment = found?.comment || found?.评语 || found?.remark ||
      found?.description || found?.说明 || '暂无评语';
      
    if (!found) {
      console.warn(`[IP Analysis] ⚠️ 第${chunkIndex + 1}批维度"${d.key}"未匹配，归一化key="${norm}"，可用维度=${JSON.stringify([...dimMap.keys()])}`);
    }
    
    return {
      dimension: d.key,
      score,
      comment: String(comment),
    };
  });
}

/**
 * 分析单个文本块的IP价值
 */
async function analyzeSingleIpChunk(
  textChunk: string,
  chunkIndex: number,
  totalChunks: number,
  previousFindingsSummary: string | null,
  apiKey: string,
  baseUrl: string | undefined,
  modelId: string,
  novelName: string,
  totalChars: number,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<ChunkAnalysisResult> {
  if (onProgress) {
    onProgress(chunkIndex + 1, totalChunks, `正在分析第 ${chunkIndex + 1}/${totalChunks} 批...`);
  }

  const prompt = buildChunkPrompt(
    textChunk,
    chunkIndex,
    totalChunks,
    previousFindingsSummary,
    novelName,
    totalChars
  );

  const config = getAPIConfig(apiKey, baseUrl, modelId);
  const isClaudeModel = modelId.toLowerCase().includes('claude');

  const response = await callUniversalAPI(
    config,
    modelId,
    [{ role: 'user', content: prompt }],
    {
      temperature: 0.4,
      responseFormat: { type: 'json_object' },
      timeout: 180000, // 3分钟超时
    }
  );

  const rawResponseText = response.text;

  // ==================== 第一层：标准JSON解析（含Gemini修复） ====================
  let parsed: any = null;
  try {
    parsed = await safeJsonParseAsync(
      rawResponseText,
      `IP Analysis 第${chunkIndex + 1}批`,
      apiKey,
      baseUrl,
      isClaudeModel  // 允许 Gemini 修复
    );
  } catch (parseError: any) {
    console.warn(`[IP Analysis] 第${chunkIndex + 1}批 JSON 解析失败（含Gemini修复）:`, parseError.message);
    parsed = {}; // 标记为空，后续走正则兜底
  }

  // 调试日志
  console.log(`[IP Analysis] 第${chunkIndex + 1}批原始解析结果:`, JSON.stringify(parsed, null, 2));

  // ==================== 第二层：从 parsed 对象提取维度 ====================
  const rawScores: any[] = [];
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.dimensionScores)) rawScores.push(...parsed.dimensionScores);
    if (Array.isArray(parsed.scores)) rawScores.push(...parsed.scores);
    if (Array.isArray(parsed.dimensions)) rawScores.push(...parsed.dimensions);

    // 模型返回扁平对象 { "剧情节奏": 78, "人物塑造": 65 }
    const knownDims = DIMENSIONS.map(d => d.key);
    for (const key of Object.keys(parsed)) {
      if (knownDims.includes(key) && typeof parsed[key] === 'number') {
        rawScores.push({ dimension: key, score: parsed[key], comment: '暂无评语' });
      }
    }
  }

  // 建立 dimMap
  let dimMap = new Map<string, any>();
  for (const item of rawScores) {
    if (item && typeof item === 'object') {
      const dimName = item.dimension || item.name || item.维度 || '';
      if (dimName) {
        const norm = normalizeDim(String(dimName));
        if (!dimMap.has(norm)) {
          dimMap.set(norm, item);
        }
      }
    }
  }

  let dimensionScores = buildDimensionScores(dimMap, chunkIndex);
  let validScores = dimensionScores.filter(d => d.score !== -1);

  // ==================== 第三层：如果标准解析提取不足4个维度，启用正则暴力提取 ====================
  let regexExtras: any = {};
  if (validScores.length < 4) {
    console.warn(`[IP Analysis] 第${chunkIndex + 1}批标准解析仅提取到 ${validScores.length}/8 个维度，启用正则兜底...`);
    
    const regexResult = regexExtractDimensionScores(rawResponseText, chunkIndex);
    
    // 合并：正则提取的结果补充到已有的 dimMap 中
    for (const [norm, item] of regexResult.dimMap) {
      if (!dimMap.has(norm)) {
        dimMap.set(norm, item);
      }
    }
    
    // 重新构建维度评分
    dimensionScores = buildDimensionScores(dimMap, chunkIndex);
    validScores = dimensionScores.filter(d => d.score !== -1);
    regexExtras = regexResult.extras;
    
    console.log(`[IP Analysis] 正则兜底后提取到 ${validScores.length}/8 个维度`);
  }

  // ==================== 第四层：Gemini 3.0 Pro AI 语义级数据清洗 ====================
  if (validScores.length < 4) {
    console.warn(`[IP Analysis] 第${chunkIndex + 1}批正则兜底仍不足 (${validScores.length}/8)，启用 Gemini 3.0 Pro AI 语义清洗...`);
    
    try {
      const geminiRepairPrompt = `你是一个 JSON 数据提取专家。下面是一个 AI 模型分析小说 IP 价值后返回的文本，但其格式有严重问题导致无法解析。

请你从中提取出 8 个维度的评分数据，并按照以下严格的 JSON 格式返回。

**必须包含的 8 个维度（dimension 字段必须一字不差）**：
1. 剧情节奏
2. 人物塑造
3. 短剧适配度
4. 世界观设定
5. 冲突强度
6. 情感共鸣
7. 钩子设计
8. 叙事结构

**输出格式（纯 JSON，不要任何解释）**：
{
  "dimensionScores": [
    { "dimension": "剧情节奏", "score": 55, "comment": "评语" },
    { "dimension": "人物塑造", "score": 60, "comment": "评语" },
    { "dimension": "短剧适配度", "score": 45, "comment": "评语" },
    { "dimension": "世界观设定", "score": 70, "comment": "评语" },
    { "dimension": "冲突强度", "score": 50, "comment": "评语" },
    { "dimension": "情感共鸣", "score": 65, "comment": "评语" },
    { "dimension": "钩子设计", "score": 40, "comment": "评语" },
    { "dimension": "叙事结构", "score": 60, "comment": "评语" }
  ],
  "chunkSummary": "摘要",
  "strengths": ["优势1"],
  "weaknesses": ["劣势1"],
  "shortDramaCompatibility": 50,
  "hookDesignScore": 40
}

**需要清洗的原始文本**：
${rawResponseText.slice(0, 15000)}`;

      const repairModelId = '[次]gemini-3-pro-preview-thinking';
      const repairConfig = getAPIConfig(apiKey, baseUrl, repairModelId);
      
      const repairResponse = await callUniversalAPI(
        repairConfig,
        repairModelId,
        [{ role: 'user', content: geminiRepairPrompt }],
        { temperature: 0, timeout: 60000 }
      );

      const repairParsed = await safeJsonParseAsync(
        repairResponse.text,
        `IP Analysis Gemini修复 第${chunkIndex + 1}批`,
        apiKey,
        baseUrl,
        false
      );

      if (repairParsed && Array.isArray(repairParsed.dimensionScores)) {
        console.log(`[IP Analysis] Gemini 3.0 Pro AI 清洗成功，提取到 ${repairParsed.dimensionScores.length} 个维度`);
        
        // 用 AI 清洗的结果重建 dimMap
        for (const item of repairParsed.dimensionScores) {
          if (item && item.dimension && typeof item.score === 'number') {
            const norm = normalizeDim(String(item.dimension));
            dimMap.set(norm, item); // 覆盖之前的提取结果
          }
        }
        
        dimensionScores = buildDimensionScores(dimMap, chunkIndex);
        validScores = dimensionScores.filter(d => d.score !== -1);
        
        // 同时提取其他字段
        if (repairParsed.chunkSummary) regexExtras.chunkSummary = repairParsed.chunkSummary;
        if (Array.isArray(repairParsed.strengths)) regexExtras.strengths = repairParsed.strengths;
        if (Array.isArray(repairParsed.weaknesses)) regexExtras.weaknesses = repairParsed.weaknesses;
        if (Array.isArray(repairParsed.keyFindings)) regexExtras.keyFindings = repairParsed.keyFindings;
        if (typeof repairParsed.shortDramaCompatibility === 'number') regexExtras.shortDramaCompatibility = repairParsed.shortDramaCompatibility;
        if (typeof repairParsed.hookDesignScore === 'number') regexExtras.hookDesignScore = repairParsed.hookDesignScore;
        
        console.log(`[IP Analysis] Gemini AI 清洗后提取到 ${validScores.length}/8 个维度`);
      }
    } catch (geminiRepairError: any) {
      console.warn(`[IP Analysis] Gemini 3.0 Pro AI 清洗失败:`, geminiRepairError.message);
    }
  }

  // ==================== 最终校验 ====================
  if (validScores.length < 4) {
    throw new Error(`AI 返回的结果无法解析出有效的评估维度内容 (仅提取到 ${validScores.length}/8 项)。模型原始输出可能出现幻觉或超时拒绝。`);
  }

  // 对遗失维度补齐（使用已有的平均分兜底）
  const avgScore = Math.max(50, Math.round(validScores.reduce((sum, item) => sum + item.score, 0) / validScores.length));
  dimensionScores.forEach(d => {
    if (d.score === -1) {
      d.score = avgScore;
      d.comment = `该维度未被模型评估，使用平均分 ${avgScore} 补齐`;
    }
  });

  // ==================== 构建结果 ====================
  const result: ChunkAnalysisResult = {
    dimensionScores,
    chunkSummary: parsed?.chunkSummary || regexExtras.chunkSummary || parsed?.summary || '暂无摘要',
    keyFindings: Array.isArray(parsed?.keyFindings) ? parsed.keyFindings :
      (Array.isArray(parsed?.key_findings) ? parsed.key_findings :
        (regexExtras.keyFindings?.length ? regexExtras.keyFindings : [])),
    strengths: Array.isArray(parsed?.strengths) ? parsed.strengths :
      (Array.isArray(parsed?.优势) ? parsed.优势 :
        (regexExtras.strengths?.length ? regexExtras.strengths : [])),
    weaknesses: Array.isArray(parsed?.weaknesses) ? parsed.weaknesses :
      (Array.isArray(parsed?.劣势) ? parsed.劣势 :
        (regexExtras.weaknesses?.length ? regexExtras.weaknesses : [])),
  };

  if (chunkIndex === 0) {
    // hookDesignScore
    const hookNorm = normalizeDim('钩子设计');
    const hookItem = dimMap.get(hookNorm);
    result.hookDesignScore = typeof parsed?.hookDesignScore === 'number' ? parsed.hookDesignScore :
      (typeof regexExtras.hookDesignScore === 'number' ? regexExtras.hookDesignScore :
        (typeof hookItem?.score === 'number' ? hookItem.score : 50));

    // shortDramaCompatibility
    const compatNorm1 = normalizeDim('短剧改编适配度');
    const compatNorm2 = normalizeDim('短剧适配度');
    const compatItem = dimMap.get(compatNorm1) || dimMap.get(compatNorm2);
    result.shortDramaCompatibility = typeof parsed?.shortDramaCompatibility === 'number' ? parsed.shortDramaCompatibility :
      (typeof regexExtras.shortDramaCompatibility === 'number' ? regexExtras.shortDramaCompatibility :
        (typeof compatItem?.score === 'number' ? compatItem.score : 50));

    // aiDramaStyle - AI短剧类型适配度
    const aiStyle = parsed?.aiDramaStyle || regexExtras.aiDramaStyle;
    if (aiStyle && aiStyle.recommended && aiStyle.scores) {
      const validTypes = ['2d_anime', '3d_anime', 'ai_realistic'] as const;
      result.aiDramaStyle = {
        recommended: validTypes.includes(aiStyle.recommended) ? aiStyle.recommended : '2d_anime',
        scores: {
          '2d_anime': typeof aiStyle.scores['2d_anime'] === 'number' ? aiStyle.scores['2d_anime'] : 50,
          '3d_anime': typeof aiStyle.scores['3d_anime'] === 'number' ? aiStyle.scores['3d_anime'] : 50,
          'ai_realistic': typeof aiStyle.scores['ai_realistic'] === 'number' ? aiStyle.scores['ai_realistic'] : 50,
        },
        reasoning: aiStyle.reasoning || '暂无判断理由',
      };
    }

    // narrativePerspective - 叙事角度推荐
    const narr = parsed?.narrativePerspective || regexExtras.narrativePerspective;
    if (narr && narr.recommended) {
      const validPersp = ['first-person', 'third-person'] as const;
      result.narrativePerspective = {
        recommended: validPersp.includes(narr.recommended) ? narr.recommended : 'third-person',
        reasoning: narr.reasoning || '暂无判断理由',
      };
    }
  }

  return result;
}

// ==================== 分批分析 ====================

/**
 * 增量式分批IP分析（用于长文本 > 200K chars）
 */
async function analyzeIpValueIncremental(
  novelText: string,
  apiKey: string,
  baseUrl: string | undefined,
  modelId: string,
  novelName: string,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<Omit<IpAnalysisReport, 'timestamp'>> {
  const totalChars = novelText.length;

  // 智能计算分批（在 CHUNK_SIZE 附近寻找完整段落/句子边界截断，避免破坏语义完整性）
  const batches: string[] = [];
  let currentIndex = 0;

  while (currentIndex < totalChars && batches.length < MAX_BATCHES) {
    let nextIndex = Math.min(currentIndex + CHUNK_SIZE, totalChars);
    
    // 如果还没到文章末尾，尝试安全切割
    if (nextIndex < totalChars) {
      // 往前找寻找最近的换行符，最多往前找 2000 个字符
      const searchStart = Math.max(currentIndex, nextIndex - 2000);
      const lastNewline = novelText.lastIndexOf('\n', nextIndex);
      
      if (lastNewline > searchStart) {
        nextIndex = lastNewline + 1; // 以换行符作为安全切分点
      } else {
        // 找不到换行符，退而求其次找句子结束符
        const punctuationTokens = ['。', '！', '？', '”'];
        let lastPunctuation = -1;
        for (const token of punctuationTokens) {
          const pt = novelText.lastIndexOf(token, nextIndex);
          if (pt > lastPunctuation) lastPunctuation = pt;
        }
        
        if (lastPunctuation > searchStart) {
          nextIndex = lastPunctuation + 1; // 包含这个标点符号
        }
      }
    }
    
    batches.push(novelText.substring(currentIndex, nextIndex));
    currentIndex = nextIndex;
  }

  console.log(`[IP Analysis] 增量分析 - 总字数: ${totalChars}, 分为 ${batches.length} 批处理`);

  const accumulator: ScoresAccumulator = {
    scores: [],
    comments: [],
    strengths: [],
    weaknesses: [],
    keyFindings: [],
    chunkSummaries: [],
    hookDesignScore: null,
    shortDramaCompatibility: null,
    aiDramaStyle: null,
    narrativePerspective: null,
  };

  let previousFindingsSummary: string | null = null;

  for (let i = 0; i < batches.length; i++) {
    const chunkResult = await analyzeSingleIpChunk(
      batches[i],
      i,
      batches.length,
      previousFindingsSummary,
      apiKey,
      baseUrl,
      modelId,
      novelName,
      totalChars,
      onProgress
    );

    // 累积维度分数
    if (i === 0) {
      // 第一批：初始化分数数组
      accumulator.scores = chunkResult.dimensionScores.map(s => [s.score]);
      accumulator.comments = chunkResult.dimensionScores.map(s => [s.comment]);
    } else {
      // 后续批次：追加到对应维度
      chunkResult.dimensionScores.forEach((s, idx) => {
        if (accumulator.scores[idx]) {
          accumulator.scores[idx].push(s.score);
        }
        if (accumulator.comments[idx]) {
          accumulator.comments[idx].push(s.comment);
        }
      });
    }

    // 收集优势/劣势/发现
    if (chunkResult.strengths.length > 0) {
      accumulator.strengths.push(...chunkResult.strengths);
    }
    if (chunkResult.weaknesses.length > 0) {
      accumulator.weaknesses.push(...chunkResult.weaknesses);
    }
    if (chunkResult.keyFindings.length > 0) {
      accumulator.keyFindings.push(...chunkResult.keyFindings);
    }
    accumulator.chunkSummaries.push(chunkResult.chunkSummary);

    // 收集第一批的特殊分数
    if (chunkResult.hookDesignScore !== undefined) {
      accumulator.hookDesignScore = chunkResult.hookDesignScore;
    }
    if (chunkResult.shortDramaCompatibility !== undefined) {
      accumulator.shortDramaCompatibility = chunkResult.shortDramaCompatibility;
    }
    if (chunkResult.aiDramaStyle) {
      accumulator.aiDramaStyle = chunkResult.aiDramaStyle;
    }
    if (chunkResult.narrativePerspective) {
      accumulator.narrativePerspective = chunkResult.narrativePerspective;
    }

    // 构建传递给下一批的上下文摘要
    const topFindings = chunkResult.keyFindings.slice(0, 3);
    const avgChunkScore = chunkResult.dimensionScores.reduce((sum, s) => sum + s.score, 0) / chunkResult.dimensionScores.length;
    previousFindingsSummary = `第${i + 1}批（共${batches.length}批）：平均分 ${avgChunkScore.toFixed(1)}，关键发现：${topFindings.join('；')}，主要优势：${chunkResult.strengths.slice(0, 2).join('；')}，主要问题：${chunkResult.weaknesses.slice(0, 2).join('；')}。`;

    if (onProgress) {
      onProgress(i + 1, batches.length, `第 ${i + 1}/${batches.length} 批分析完成，正在汇总结果...`);
    }
  }

  // 计算最终平均分
  const finalDimensionScores: IpDimensionScore[] = DIMENSIONS.map((d, idx) => {
    const scores = accumulator.scores[idx] || [50];
    const commentsList = accumulator.comments[idx] || [];
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    
    // 合并过滤后的有效评语（去除明显的通用废话，限制最多展示3条最有价值的）
    const validComments = commentsList
      .filter(c => c && c !== '暂无评语' && c !== '正则提取' && c !== '该维度未被评估')
      .map(c => c.trim())
      .filter((v, i, a) => a.indexOf(v) === i); // 去重
      
    let comment = validComments.length > 0 
      ? validComments.slice(0, 3).join('；') 
      : '综合多批分析的平均评分';

    return {
      dimension: d.key,
      score: Math.round(avg),
      comment,
    };
  });

  const totalScore = Math.round(
    finalDimensionScores.reduce((sum, s) => sum + s.score, 0) / finalDimensionScores.length
  );

  const shortDramaCompatibility = accumulator.shortDramaCompatibility ?? Math.round(
    finalDimensionScores.find(s => s.dimension === '短剧适配度')?.score ?? totalScore
  );

  // 改编策略决策
  const strategy: 'high_fidelity' | 'heavy_adaptation' =
    totalScore >= 65 && shortDramaCompatibility >= 60 ? 'high_fidelity' : 'heavy_adaptation';

  const strategyReasoning =
    strategy === 'high_fidelity'
      ? `总分 ${totalScore} 且短剧适配度 ${shortDramaCompatibility} 均超过阈值，推荐保留原著精华的高遵循度改编。`
      : `总分 ${totalScore} 或短剧适配度 ${shortDramaCompatibility} 未达推荐阈值，建议进行大幅度结构化改编。`;

  // 去重优势/劣势（保留前10个）
  const uniqueStrengths = [...new Set(accumulator.strengths)].slice(0, 10);
  const uniqueWeaknesses = [...new Set(accumulator.weaknesses)].slice(0, 10);

  // 用 AI 的分批诊断摘要来构建综合评价
  const summaryCore = accumulator.chunkSummaries.filter(s => s && s !== '暂无摘要').join('；');

  return {
    totalScore,
    summary: summaryCore || `《${novelName}》综合评分 ${totalScore} 分。${uniqueStrengths.slice(0, 2).join('、')}是核心优势，但${uniqueWeaknesses.slice(0, 2).join('、')}等问题需要在改编中重点解决。`,
    dimensionScores: finalDimensionScores,
    recommendation: {
      strategy,
      reasoning: strategyReasoning,
      confidence: 0.85,
    },
    strengths: uniqueStrengths,
    weaknesses: uniqueWeaknesses,
    shortDramaCompatibility,
    aiDramaStyle: accumulator.aiDramaStyle || undefined,
    narrativePerspective: accumulator.narrativePerspective || undefined,
  };
}

// ==================== 统一入口 ====================

export interface AnalyzeIpValueOptions {
  apiKey: string;
  baseUrl?: string;
  modelId?: string;
  fallbackModelId?: string;
  onProgress?: (current: number, total: number, message: string) => void;
  abortSignal?: AbortSignal;
}

/**
 * IP 价值分析统一入口
 * 根据文本长度自动选择：单次分析 或 增量分批分析
 */
export async function analyzeIpValue(
  novelText: string,
  novelName: string,
  options: AnalyzeIpValueOptions
): Promise<IpAnalysisReport> {
  const { apiKey, baseUrl, modelId, fallbackModelId, onProgress, abortSignal } = options;
  const primaryModel = modelId || getRecommendedModel('analysis');
  const totalChars = novelText.length;

  console.log(`[IP Analysis] 开始分析 - 小说: ${novelName}, 总字数: ${totalChars}, 模型: ${primaryModel}`);

  // 尝试执行分析，支持模型降级
  const tryAnalyze = async (modelToUse: string): Promise<Omit<IpAnalysisReport, 'timestamp'>> => {
    if (totalChars <= BATCH_THRESHOLD) {
      // 短文本：单次分析
      if (onProgress) onProgress(1, 1, '正在进行单次分析...');

      const chunkResult = await analyzeSingleIpChunk(
        novelText, 0, 1, null, apiKey, baseUrl, modelToUse, novelName, totalChars, onProgress
      );

      const dimensionScores = chunkResult.dimensionScores;
      const score = Math.round(dimensionScores.reduce((sum, s) => sum + s.score, 0) / dimensionScores.length);
      const compatibility = chunkResult.shortDramaCompatibility ?? Math.round(
        dimensionScores.find(s => s.dimension === '短剧适配度')?.score ?? score
      );
      const strategy: 'high_fidelity' | 'heavy_adaptation' =
        score >= 65 && compatibility >= 60 ? 'high_fidelity' : 'heavy_adaptation';
      const uniqueStrengths = [...new Set(chunkResult.strengths)].slice(0, 10);
      const uniqueWeaknesses = [...new Set(chunkResult.weaknesses)].slice(0, 10);

      // 用 AI 的诊断摘要作为综合评价
      const summaryText = chunkResult.chunkSummary && chunkResult.chunkSummary !== '暂无摘要'
        ? chunkResult.chunkSummary
        : `《${novelName}》综合评分 ${score} 分。${uniqueStrengths.slice(0, 2).join('、')}是核心优势，但${uniqueWeaknesses.slice(0, 2).join('、')}等问题需要在改编中重点解决。`;

      return {
        totalScore: score,
        summary: summaryText,
        dimensionScores,
        recommendation: {
          strategy,
          reasoning: strategy === 'high_fidelity'
            ? `总分 ${score} 且短剧适配度 ${compatibility} 均超过阈值，推荐保留原著精华的高保真改编。`
            : `总分 ${score} 或短剧适配度 ${compatibility} 未达推荐阈值，建议进行剔骨剥皮式结构魔改。`,
          confidence: 0.85,
        },
        strengths: uniqueStrengths,
        weaknesses: uniqueWeaknesses,
        shortDramaCompatibility: compatibility,
        aiDramaStyle: chunkResult.aiDramaStyle || undefined,
        narrativePerspective: chunkResult.narrativePerspective || undefined,
      };
    } else {
      // 长文本：增量分批分析
      return await analyzeIpValueIncremental(novelText, apiKey, baseUrl, modelToUse, novelName, onProgress);
    }
  };

  let result: Omit<IpAnalysisReport, 'timestamp'>;

  try {
    result = await tryAnalyze(primaryModel);
  } catch (primaryError: any) {
    // 主模型失败，尝试降级
    if (fallbackModelId && fallbackModelId !== primaryModel) {
      console.warn(`[IP Analysis] 主模型 ${primaryModel} 失败，尝试降级到 ${fallbackModelId}:`, primaryError.message);
      if (onProgress) onProgress(0, 1, `主模型失败，切换至兜底模型 ${fallbackModelId}...`);
      result = await tryAnalyze(fallbackModelId);
    } else {
      throw primaryError;
    }
  }

  if (onProgress) {
    onProgress(1, 1, '分析完成！');
  }

  return {
    ...result,
    timestamp: Date.now(),
  };
}
