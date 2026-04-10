/**
 * JSON 解析和修复工具模块
 * 处理 LLM 返回的 JSON 格式问题
 */

import { callUniversalAPI, getAPIConfig } from "../apiClient";

const buildQuotedPayloadCandidates = (text: string): string[] => {
  const candidates: string[] = [];
  const pushCandidate = (candidate?: string | null) => {
    if (!candidate) return;
    const trimmed = candidate.trim();
    if (!trimmed || candidates.includes(trimmed)) return;
    candidates.push(trimmed);
  };

  const trimmed = text.trim();
  pushCandidate(trimmed);

  const firstQuote = trimmed.indexOf('"');
  const lastQuote = trimmed.lastIndexOf('"');

  if (firstQuote >= 0 && lastQuote > firstQuote) {
    pushCandidate(trimmed.slice(firstQuote, lastQuote + 1));
  }

  if (trimmed.startsWith('"') && lastQuote > 0 && lastQuote < trimmed.length - 1) {
    pushCandidate(trimmed.slice(0, lastQuote + 1));
  }

  return candidates;
};

const unwrapStringifiedJsonCarrier = (text: string, maxDepth: number = 2): string => {
  let current = text.trim();

  for (let depth = 0; depth < maxDepth; depth++) {
    let decoded: string | null = null;

    for (const candidate of buildQuotedPayloadCandidates(current)) {
      try {
        const parsed = JSON.parse(candidate);

        if (typeof parsed === 'string') {
          const next = parsed.trim();
          if (next) {
            decoded = next;
            break;
          }
        } else if (parsed && typeof parsed === 'object') {
          return JSON.stringify(parsed);
        }
      } catch {
        // 忽略，继续尝试下一个候选
      }
    }

    if (!decoded || decoded === current) {
      break;
    }

    current = decoded;
  }

  return current;
};

const decodeEscapedJsonQuotes = (text: string): string => {
  const trimmed = text.trim();
  const escapedQuoteCount = (trimmed.match(/\\"/g) || []).length;
  const quoteCount = (trimmed.match(/"/g) || []).length;
  const trimmedStart = trimmed.trimStart();

  const looksLikeEscapedJson =
    escapedQuoteCount >= 6 &&
    quoteCount <= escapedQuoteCount + 2 &&
    (trimmedStart.startsWith('{') || trimmedStart.startsWith('[') || trimmedStart.startsWith('```'));

  if (!looksLikeEscapedJson) {
    return trimmed;
  }

  return trimmed.replace(/\\"/g, '"').trim();
};

const normalizeJsonCarrierText = (text: string): string => {
  if (!text) return "";
  let cleaned = decodeEscapedJsonQuotes(unwrapStringifiedJsonCarrier(text));

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "");
  }

  return cleaned.trim();
};

/**
 * 清理 JSON 文本 - 智能提取 JSON 主体
 * 策略优先级：
 * 0. 解包被整体字符串化的 JSON / markdown 载荷
 * 1. 提取 markdown ```json ... ``` 代码块内容（无论代码块前面有多少文字）
 * 2. 使用平衡括号匹配找到最外层的 {...} 或 [...] JSON 结构
 * 3. 兜底：简单 trim
 */
export const cleanJson = (text: string): string => {
  if (!text) return "";
  let cleaned = normalizeJsonCarrierText(text);

  const codeBlockMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const extracted = decodeEscapedJsonQuotes(codeBlockMatch[1].trim());
    if (extracted.startsWith('{') || extracted.startsWith('[')) {
      return extracted;
    }
  }

  const jsonStart = findJsonStart(cleaned);
  if (jsonStart >= 0) {
    const extracted = extractBalancedJson(cleaned, jsonStart);
    if (extracted) return decodeEscapedJsonQuotes(extracted);
  }

  return cleaned.trim();
};

/**
 * 找到文本中第一个可能是 JSON 起始的 { 或 [ 的位置
 * 跳过引号内的 { 和 [
 */
const findJsonStart = (text: string): number => {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' || text[i] === '[') {
      return i;
    }
  }
  return -1;
};

/**
 * 从 startPos 开始，用括号平衡算法提取完整的 JSON 块
 * 返回 null 表示找不到平衡的闭合
 */
const extractBalancedJson = (text: string, startPos: number): string | null => {
  const openChar = text[startPos];
  const closeChar = openChar === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startPos; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (ch === '"' && !escaped) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === '{' || ch === '[') depth++;
      if (ch === '}' || ch === ']') depth--;

      if (depth === 0 && ch === closeChar) {
        return text.substring(startPos, i + 1);
      }
    }
  }

  // 没有找到平衡闭合，回退到 lastIndexOf
  const lastClose = text.lastIndexOf(closeChar);
  if (lastClose > startPos) {
    return text.substring(startPos, lastClose + 1);
  }

  return null;
};

/**
 * 基础 JSON 修复函数 - 针对 Claude 输出优化
 */
export const repairJson = (text: string): string => {
  if (!text) return "{}";
  let fixed = text;

  // 1. 移除可能的 markdown 代码块标记
  fixed = cleanJson(fixed);

  // 2. 提取最外层 JSON 根节点（兼容对象或数组）
  const jsonStart = findJsonStart(fixed);
  if (jsonStart === -1) {
    return "{}";
  }

  const extractedRoot = extractBalancedJson(fixed, jsonStart);
  if (!extractedRoot) {
    return "{}";
  }
  fixed = extractedRoot;

  // 3. 修复常见的 JSON 格式问题
  // 3.1 移除注释（// 和 /* */）
  fixed = fixed.replace(/\/\/[^\n]*/g, '');
  fixed = fixed.replace(/\/\*[\s\S]*?\*\//g, '');

  // 3.2 修复尾随逗号（数组和对象末尾的逗号）
  fixed = fixed.replace(/,(\s*[\]}])/g, '$1');

  // 3.3 修复缺失的逗号（在 } 或 ] 后面紧跟 { 或 " 的情况）
  fixed = fixed.replace(/}(\s*)"/g, '},$1"');
  fixed = fixed.replace(/](\s*)"/g, '],$1"');
  fixed = fixed.replace(/"(\s*)"(?=\s*[a-zA-Z])/g, '",$1"');
  fixed = fixed.replace(/}(\s*)\{/g, '},$1{');
  fixed = fixed.replace(/](\s*)\[/g, '],$1[');

  // 3.4 修复数字后面缺少逗号的情况
  fixed = fixed.replace(/(\d)(\s*)"(\w+)":/g, '$1,$2"$3":');

  // 3.5 修复 true/false/null 后面缺少逗号
  fixed = fixed.replace(/(true|false|null)(\s*)"(\w+)":/g, '$1,$2"$3":');

  return fixed;
};

/**
 * 深度修复 JSON 字符串 - 处理字符串值内的特殊字符
 */
export const deepRepairJson = (text: string): string => {
  let fixed = repairJson(text);

  // 逐字符解析，修复字符串内的问题
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < fixed.length; i++) {
    const char = fixed[i];

    if (escaped) {
      escaped = false;
      result += char;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      result += char;
      continue;
    }

    if (char === '"' && !escaped) {
      inString = !inString;
      result += char;
      continue;
    }

    // 在字符串内部处理特殊字符
    if (inString) {
      // 处理未转义的换行符
      if (char === '\n' || char === '\r') {
        result += '\\n';
        continue;
      }
      // 处理未转义的制表符
      if (char === '\t') {
        result += '\\t';
        continue;
      }
      // 处理控制字符
      const code = char.charCodeAt(0);
      if (code < 32 && code !== 10 && code !== 13 && code !== 9) {
        result += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
    }

    result += char;
  }

  // 如果字符串未闭合，添加闭合引号
  if (inString) {
    result += '"';
  }

  return result;
};

/**
 * 修复 JSON 字符串值内部的未转义双引号
 * 例如: {"key": "悟空"大闹天宫"的宿命"} → {"key": "悟空\u201c大闹天宫\u201d的宿命"}
 * 原理：用状态机逐字符扫描，判断某个 " 到底是 JSON 语法引号还是内容引号
 */
export const fixUnescapedQuotesInJson = (text: string): string => {
  const cleaned = cleanJson(text);
  // 先尝试直接解析，如果成功就不需要修复
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    // 需要修复
  }

  let result = '';
  let i = 0;
  const len = cleaned.length;

  while (i < len) {
    const ch = cleaned[i];

    // 跳过非字符串区域
    if (ch !== '"') {
      result += ch;
      i++;
      continue;
    }

    // 找到一个 "，这是某个 JSON 字符串的开始
    result += '"';
    i++;

    // 收集字符串内容直到找到真正的结束引号
    let strContent = '';
    while (i < len) {
      const c = cleaned[i];

      // 处理转义序列
      if (c === '\\' && i + 1 < len) {
        strContent += c;
        strContent += cleaned[i + 1];
        i += 2;
        continue;
      }

      // 遇到引号 - 判断是结束引号还是内容中的引号
      if (c === '"') {
        // 往后看：如果后面是 JSON 语法字符（:, }, ], 空白后跟这些），则这是真正的结束引号
        let lookAhead = i + 1;
        while (lookAhead < len && (cleaned[lookAhead] === ' ' || cleaned[lookAhead] === '\n' || cleaned[lookAhead] === '\r' || cleaned[lookAhead] === '\t')) {
          lookAhead++;
        }
        const nextNonSpace = lookAhead < len ? cleaned[lookAhead] : '';
        
        if (nextNonSpace === ':' || nextNonSpace === ',' || nextNonSpace === '}' || nextNonSpace === ']' || nextNonSpace === '') {
          // 这是真正的结束引号
          break;
        } else {
          // 这是内容中的引号，替换为中文引号
          strContent += '\u201c';
          i++;
          continue;
        }
      }

      strContent += c;
      i++;
    }

    result += strContent + '"';
    if (i < len) i++; // 跳过结束引号
  }

  return result;
};

const tryParseJsonCandidate = (text: string): any | null => {
  const candidates = [
    text,
    cleanJson(text),
    repairJson(text),
    deepRepairJson(text),
    fixUnescapedQuotesInJson(text),
  ].map(candidate => candidate?.trim()).filter((candidate): candidate is string => !!candidate);

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      return JSON.parse(candidate);
    } catch {
      // 继续尝试下一种修复结果
    }
  }

  try {
    let aggressive = deepRepairJson(text);
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < aggressive.length; i++) {
      const char = aggressive[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (char === '[') bracketCount++;
        if (char === ']') bracketCount--;
      }
    }

    while (bracketCount > 0) {
      aggressive += ']';
      bracketCount--;
    }
    while (braceCount > 0) {
      aggressive += '}';
      braceCount--;
    }

    return JSON.parse(aggressive);
  } catch {
    return null;
  }
};

const collectCompleteArrayItems = (
  text: string,
  arrayStart: number,
): { items: string[]; trailingPartial: string | null } => {
  const items: string[] = [];
  let itemStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = arrayStart + 1; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (itemStart === -1) {
      if (char === ']') {
        return { items, trailingPartial: null };
      }
      if (char === ',' || /\s/.test(char)) {
        continue;
      }
      itemStart = i;
    }

    if (char === '{' || char === '[') {
      depth++;
      continue;
    }

    if (char === '}' || char === ']') {
      depth--;
      if (itemStart !== -1 && depth === 0) {
        items.push(text.slice(itemStart, i + 1).trim());
        itemStart = -1;
        continue;
      }
      if (char === ']' && itemStart === -1) {
        return { items, trailingPartial: null };
      }
    }
  }

  return {
    items,
    trailingPartial: itemStart >= 0 ? text.slice(itemStart).trim() : null,
  };
};

const trySalvageCharacterEntry = (text: string): any | null => {
  const staticProfileKey = text.indexOf('"static_profile"');
  const newStagesKey = text.indexOf('"new_stages"');
  if (staticProfileKey === -1 || newStagesKey === -1) {
    return null;
  }

  const staticProfileStart = text.indexOf('{', staticProfileKey);
  const staticProfileText = staticProfileStart >= 0 ? extractBalancedJson(text, staticProfileStart) : null;
  const staticProfile = staticProfileText ? tryParseJsonCandidate(staticProfileText) : null;
  if (!staticProfile || typeof staticProfile !== 'object' || Array.isArray(staticProfile)) {
    return null;
  }

  const newStagesArrayStart = text.indexOf('[', newStagesKey);
  if (newStagesArrayStart === -1) {
    return null;
  }

  const { items } = collectCompleteArrayItems(text, newStagesArrayStart);
  const parsedStages = items
    .map(item => tryParseJsonCandidate(item))
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));

  if (parsedStages.length === 0) {
    return null;
  }

  return {
    static_profile: staticProfile,
    new_stages: parsedStages,
  };
};

const trySalvageCharactersPayload = (text: string): any | null => {
  const normalized = normalizeJsonCarrierText(text);
  const directParsed = tryParseJsonCandidate(normalized);

  if (directParsed && typeof directParsed === 'object' && !Array.isArray(directParsed) && Array.isArray((directParsed as any).characterUpdates)) {
    return directParsed;
  }

  if (Array.isArray(directParsed)) {
    return { characterUpdates: directParsed };
  }

  const characterUpdatesKey = normalized.indexOf('"characterUpdates"');
  const arrayStart = characterUpdatesKey >= 0
    ? normalized.indexOf('[', characterUpdatesKey)
    : normalized.trimStart().startsWith('[')
      ? normalized.indexOf('[')
      : -1;

  if (arrayStart === -1) {
    return null;
  }

  const { items, trailingPartial } = collectCompleteArrayItems(normalized, arrayStart);
  const parsedItems = items
    .map(item => tryParseJsonCandidate(item))
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));

  if (trailingPartial) {
    const salvagedTail = trySalvageCharacterEntry(trailingPartial);
    if (salvagedTail) {
      parsedItems.push(salvagedTail);
    }
  }

  if (parsedItems.length === 0) {
    return null;
  }

  return { characterUpdates: parsedItems };
};

const getJsonErrorPosition = (message: string, text: string): number | null => {
  const posMatch = message.match(/position\s+(\d+)/i);
  if (posMatch) {
    const position = parseInt(posMatch[1], 10);
    return Number.isNaN(position) ? null : position;
  }

  const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (!lineColumnMatch) {
    return null;
  }

  const line = parseInt(lineColumnMatch[1], 10);
  const column = parseInt(lineColumnMatch[2], 10);
  if (Number.isNaN(line) || Number.isNaN(column) || line < 1 || column < 1) {
    return null;
  }

  const lines = text.split('\n');
  if (line > lines.length) {
    return null;
  }

  let position = 0;
  for (let i = 0; i < line - 1; i++) {
    position += lines[i].length + 1;
  }

  return Math.min(position + column - 1, text.length);
};

const logJsonErrorContext = (
  context: string,
  label: string,
  text: string,
  error: unknown,
  radius: number = 120
) => {
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  const position = getJsonErrorPosition(message, text);

  if (position === null) {
    console.warn(`[${context}] ${label} 无法定位具体报错位置，文本长度: ${text.length}`);
    console.warn(`[${context}] ${label} 开头片段:`, JSON.stringify(text.slice(0, 200)));
    console.warn(`[${context}] ${label} 结尾片段:`, JSON.stringify(text.slice(-200)));
    return;
  }

  const start = Math.max(0, position - radius);
  const end = Math.min(text.length, position + radius);
  const before = text.slice(start, position);
  const after = text.slice(position, end);
  const errorChar = position < text.length ? text[position] : '(EOF)';

  console.warn(
    `[${context}] ${label} 报错位置: ${position}/${text.length}，错误字符: ${JSON.stringify(errorChar)}`
  );
  console.warn(`[${context}] ${label} 报错前文:`, JSON.stringify(before));
  console.warn(`[${context}] ${label} 报错后文:`, JSON.stringify(after));
};

/**
 * 安全的 JSON 解析函数 - 多重容错
 */
export const safeJsonParse = (text: string, context: string = "Unknown"): any => {
  if (!text) return {};

  // 第一次尝试：直接解析清理后的文本
  const cleaned = cleanJson(text);
  try {
    return JSON.parse(cleaned);
  } catch (e1: any) {
    console.warn(`[${context}] 第一次 JSON 解析失败: ${e1.message?.substring(0, 100)}`);
    logJsonErrorContext(context, '清理后 JSON', cleaned, e1);
  }

  // 第二次尝试：使用基础修复函数
  const repaired = repairJson(text);
  try {
    return JSON.parse(repaired);
  } catch (e2: any) {
    console.warn(`[${context}] 第二次 JSON 解析失败: ${e2.message?.substring(0, 100)}`);
    logJsonErrorContext(context, '基础修复 JSON', repaired, e2);
  }

  // 第三次尝试：使用深度修复函数
  const deepRepaired = deepRepairJson(text);
  try {
    return JSON.parse(deepRepaired);
  } catch (e3: any) {
    console.warn(`[${context}] 第三次 JSON 解析失败: ${e3.message?.substring(0, 100)}`);
    logJsonErrorContext(context, '深度修复 JSON', deepRepaired, e3);
  }

  // 第3.5次尝试：修复字符串值内部的未转义双引号（如中文书名号误用 ASCII 引号）
  try {
    const quoteFixed = fixUnescapedQuotesInJson(text);
    return JSON.parse(quoteFixed);
  } catch (e35: any) {
    console.warn(`[${context}] 第3.5次 JSON 解析失败 (引号修复): ${e35.message?.substring(0, 100)}`);
    logJsonErrorContext(context, '引号修复 JSON', fixUnescapedQuotesInJson(text), e35);
  }

  // 第四次尝试：更激进的修复 - 逐字符检查括号匹配并补齐
  try {
    let aggressive = deepRepaired;

    // 统计括号
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < aggressive.length; i++) {
      const char = aggressive[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (char === '[') bracketCount++;
        if (char === ']') bracketCount--;
      }
    }

    // 补齐缺失的括号
    while (bracketCount > 0) {
      aggressive += ']';
      bracketCount--;
    }
    while (braceCount > 0) {
      aggressive += '}';
      braceCount--;
    }

    return JSON.parse(aggressive);
  } catch (e4: any) {
    console.warn(`[${context}] 第四次 JSON 解析失败: ${e4.message?.substring(0, 100)}`);
    logJsonErrorContext(context, '激进修复 JSON', deepRepaired, e4);
  }

  // 第4.5次尝试：Characters 专用尾部保全与外层壳解包
  if (context.includes('Character')) {
    const salvagedCharacters = trySalvageCharactersPayload(text);
    if (salvagedCharacters) {
      console.warn(
        `[${context}] 启用 Characters 尾部保全修复，保留 ${Array.isArray(salvagedCharacters.characterUpdates) ? salvagedCharacters.characterUpdates.length : 0} 个完整角色更新`
      );
      return salvagedCharacters;
    }
  }

  // 第五次尝试：使用正则提取核心字段或返回默认容错结构
  try {
    console.warn(`[${context}] 尝试提取核心字段或启用特定降级方案...`);

    // 如果是大纲、架构或人物档案解析失败，直接抛出异常让 safeJsonParseAsync 去尝试 Gemini 修复
    // 或让外层分析服务捕获，进而触发界面上的重试按钮
    // IP Analysis 也需要走 Gemini 修复路径，因为它的维度名和正则默认值不匹配
    if (
      context.includes('Outline') ||
      context.includes('Architecture') ||
      context.includes('Character') ||
      context.includes('DraftEpisodes') ||
      context.includes('IP Analysis') ||
      context.includes('IpAnalysis')
    ) {
      throw new Error(`JSON_PARSE_FAILED_${context}`);
    }
    // 提取 summary
    const summaryMatch = text.match(/"summary"\s*:\s*"([^"]{0,500})"/);
    const summary = summaryMatch ? summaryMatch[1] : "JSON解析失败，已提取部分数据";

    // 提取 dimensionScores 数组 - 支持灵活字段顺序
    const dimensionScores: any[] = [];
    // 尝试多种正则模式以适应不同的 JSON 字段顺序
    const regexPatterns = [
      // 模式1: dimension, score, comment (严格顺序)
      /"dimension"\s*:\s*"([^"]+)"\s*,\s*"score"\s*:\s*(\d+)\s*,\s*"comment"\s*:\s*"([^"]{0,200})"/g,
      // 模式2: dimension, score (comment在后面)
      /"dimension"\s*:\s*"([^"]+)"\s*,\s*"score"\s*:\s*(\d+)/g,
      // 模式3: dimension, 任意字段..., score
      /"dimension"\s*:\s*"([^"]+)"[^}]{0,300}?"score"\s*:\s*(\d+)/g,
      // 模式4: 宽松模式 - 捕获 dimension 和后面的数字分数
      /"(?:dimension|维度)"\s*:\s*"([^"]+)"/g,
    ];

    const foundDimensions = new Set<string>();
    for (let pi = 0; pi < 2; pi++) {
      const pattern = regexPatterns[pi];
      let match;
      regexPatterns[pi].lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const dim = match[1].trim();
        if (!foundDimensions.has(dim) && dim.length > 0 && dim.length < 20) {
          const score = pi < 2 ? parseInt(match[2]) : 55;
          foundDimensions.add(dim);
          dimensionScores.push({
            dimension: dim,
            score: score,
            comment: "数据提取不完整"
          });
        }
      }
      if (dimensionScores.length > 0) break;
    }

    // 提取 shortDramaCompatibility / hookDesignScore
    const compatMatch = text.match(/"shortDramaCompatibility"\s*:\s*(\d+)/);
    const hookMatch = text.match(/"hookDesignScore"\s*:\s*(\d+)/);
    const compat = compatMatch ? parseInt(compatMatch[1]) : undefined;
    const hook = hookMatch ? parseInt(hookMatch[1]) : undefined;

    // 提取 totalScore (兜底)
    const scoreMatch = text.match(/"totalScore"\s*:\s*(\d+)/);
    const totalScore = scoreMatch ? parseInt(scoreMatch[1]) : (compat || 60);

    // 如果没有提取到维度评分，使用安全默认值
    if (dimensionScores.length === 0) {
      console.warn(`[${context}] ⚠️ 无法从响应中提取维度评分，使用安全默认值`);
      // 不再使用错误的 hardcoded 维度名，只返回一个空数组让外层用 50 填充
      // dimensionScores 保持为空数组
    }

    // 提取 annotations 数组
    const annotations: any[] = [];
    const annoRegex = /"dimension"\s*:\s*"([^"]+)"[^}]*"issue"\s*:\s*"([^"]{0,300})"/g;
    let annoMatch;
    let annoIdx = 0;
    while ((annoMatch = annoRegex.exec(text)) !== null && annoIdx < 20) {
      // 避免重复提取 dimensionScores 中的内容
      if (!annoMatch[2].includes("数据提取不完整")) {
        annotations.push({
          id: `extracted_${Date.now()}_${annoIdx}`,
          dimension: annoMatch[1],
          location: { lineContent: "（自动提取）" },
          score: 1,
          issue: annoMatch[2],
          suggestion: "请手动检查原始审核结果",
          canBatchFix: false,
          status: 'pending'
        });
        annoIdx++;
      }
    }

    console.log(`[${context}] 成功提取核心字段 - 总分: ${totalScore}, 维度: ${dimensionScores.length}, 批注: ${annotations.length}`);

    return {
      totalScore,
      summary: summary + "（注：部分数据因格式问题自动提取）",
      dimensionScores,
      annotations
    };
  } catch (e5: any) {
    console.error(`[${context}] JSON 解析最终失败:`, e5.message);
    logJsonErrorContext(context, '原始文本', text, e5);
    throw new Error(`JSON 解析失败: ${e5.message}`);
  }
};

const isLikelyGeminiRepairBaseUrl = (baseUrl?: string): boolean => {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return true;
  return /novai|once\.novai|api\.novai/i.test(trimmed);
};

const getRepairConfigCandidates = (apiKey?: string, baseUrl?: string, modelId?: string) => {
  const candidates: Array<{ apiKey: string; baseUrl: string }> = [];
  const seen = new Set<string>();

  const pushCandidate = (nextApiKey?: string, nextBaseUrl?: string) => {
    try {
      const config = getAPIConfig(nextApiKey || '', nextBaseUrl, modelId);
      if (!config.apiKey) return;
      const key = `${config.baseUrl}::${config.apiKey}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(config);
    } catch {
      // 忽略无效候选
    }
  };

  if (isLikelyGeminiRepairBaseUrl(baseUrl)) {
    pushCandidate(apiKey, baseUrl?.trim() || undefined);
  }

  if (!baseUrl?.trim()) {
    pushCandidate(apiKey, undefined);
  }

  pushCandidate(undefined, undefined);

  return candidates;
};

/**
 * 使用 Gemini 进行 JSON 格式化修复（不改变内容，只修复格式）
 */
export const formatJsonWithGemini = async (
  brokenJson: string,
  _apiKey?: string,
  _baseUrl?: string
): Promise<string> => {
  const repairModelQueue = ['[次]gemini-3-pro-preview-thinking', '[次]gemini-3-flash-preview'];

  const normalizedBrokenJson = cleanJson(brokenJson);
  const repairSource = normalizedBrokenJson.length > 2 ? normalizedBrokenJson : brokenJson.trim();

  const prompt = `你是一个 JSON 格式修复专家。下面是一段格式有问题的 JSON 文本，请修复其格式问题并返回正确的 JSON。

**重要规则：**
1. 只修复格式问题（缺失逗号、引号、括号、代码块包裹、外层字符串包裹等），不要修改任何内容
2. 保持所有字段名、字段值、数组元素完全不变，不要删减、改写、补写语义内容
3. 如果整段内容是“被双引号包裹的 JSON 字符串”或“引号被整体转义的 JSON”，只解开一层，恢复成正常 JSON
4. 如果内容外面包着 markdown 代码块、说明文字或多余前后缀，只移除这些外层包装
5. 只输出修复后的 JSON，不要有任何解释或 markdown 标记
6. 确保输出是有效的 JSON 对象或 JSON 数组，而不是 JSON 字符串

**需要修复的 JSON：**
${repairSource}

**请直接输出修复后的 JSON：**`;

  let lastError: unknown = null;

  for (const repairModelId of repairModelQueue) {
    const configCandidates = getRepairConfigCandidates(_apiKey, _baseUrl, repairModelId);

    for (const config of configCandidates) {
      try {
        const response = await callUniversalAPI(config, repairModelId, [{ role: 'user', content: prompt }], {
          temperature: 0,
          timeout: 90000
        });

        return cleanJson(response.text);
      } catch (error) {
        lastError = error;
        console.warn(`[formatJsonWithGemini] 使用 ${repairModelId} @ ${config.baseUrl} 修复失败:`, error);
      }
    }
  }

  console.error('[formatJsonWithGemini] 格式化失败:', lastError);
  throw lastError instanceof Error ? lastError : new Error(String(lastError || '未知错误'));
};

/**
 * 异步安全 JSON 解析 - 支持 Gemini 修复
 */
export const safeJsonParseAsync = async (
  text: string,
  context: string = "Unknown",
  apiKey?: string,
  baseUrl?: string,
  enableGeminiFix: boolean = false
): Promise<any> => {
  // 首先尝试同步解析
  try {
    return safeJsonParse(text, context);
  } catch (syncError: any) {
    // 如果同步解析失败且启用了 Gemini 修复（即使 apiKey 为空也允许，因为底层 getAPIConfig 会读取默认的 env key）
    if (enableGeminiFix) {
      console.log(`[${context}] 同步解析失败，尝试使用 Gemini 修复...`);
      try {
        const fixedJson = await formatJsonWithGemini(text, apiKey || '', baseUrl);
        return safeJsonParse(fixedJson, `${context}_GeminiFixed`);
      } catch (geminiError: any) {
        console.error(`[${context}] Gemini 修复也失败:`, geminiError.message);
        throw syncError; // 返回原始错误
      }
    }
    throw syncError;
  }
};

/**
 * 计算超时时间 - 根据内容长度动态调整
 */
export const calculateTimeout = (
  contentLength: number,
  modelId: string,
  baseTimeout: number = 180000
): number => {
  const isOpus = modelId.includes('opus');
  const isClaudeFamily = modelId.includes('claude');

  if (contentLength > 150000) {
    if (isOpus) return 1800000; // 30分钟
    if (isClaudeFamily) return 1200000; // 20分钟
    return 900000; // 15分钟
  }
  if (contentLength > 100000) {
    if (isOpus) return 1200000; // 20分钟
    if (isClaudeFamily) return 900000; // 15分钟
    return 720000; // 12分钟
  }
  if (contentLength > 50000) {
    return isClaudeFamily ? 600000 : 480000; // 10分钟 / 8分钟
  }
  return isClaudeFamily ? 300000 : baseTimeout; // 5分钟 / 3分钟
};
