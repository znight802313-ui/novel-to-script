
import { Chapter, Episode } from '../types';

// Helper to read file as text
export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
};

// Helper to extract text from DOCX
export const readDocxAsText = async (file: File): Promise<string> => {
  try {
    const [{ default: mammoth }, arrayBuffer] = await Promise.all([
      import('mammoth'),
      file.arrayBuffer(),
    ]);
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (e) {
    console.error("Docx parsing failed:", e);
    throw new Error("DOCX 文件解析失败，请尝试另存为 TXT 格式。");
  }
};

// Optimized chapter parser (Line-by-line scanning)
export const parseNovelChapters = (text: string): Chapter[] => {
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  const chapters: Chapter[] = [];
  
  let currentTitle = "序章/开始";
  let currentContent: string[] = [];
  let id = 1;

  // Regex to identify chapter titles (e.g., "第1章", "第一章", "Chapter 1")
  // Optimized to match only start of line
  const chapterTitleRegex = /^\s*(第[0-9零一二三四五六七八九十百千]+章.*)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(chapterTitleRegex);

    if (match) {
       // Save previous chapter if it has content or isn't the dummy start
       if (currentContent.length > 0 || chapters.length > 0) {
          chapters.push({
             id: id++,
             title: currentTitle,
             content: currentContent.join('\n').trim()
          });
       }
       
       currentTitle = match[1].trim();
       currentContent = [];
    } else {
       currentContent.push(line);
    }
  }
  
  // Push the final chapter
  if (currentContent.length > 0) {
     chapters.push({
        id: id++,
        title: currentTitle,
        content: currentContent.join('\n').trim()
     });
  }

  // Cleanup: Remove dummy prologue if it's empty or extremely short and we have other chapters
  if (chapters.length > 1 && chapters[0].title === "序章/开始" && chapters[0].content.length < 50) {
      chapters.shift();
      // Re-index
      chapters.forEach((c, idx) => c.id = idx + 1);
  }

  // Fallback: If no chapters detected, treat whole text as one chapter
  if (chapters.length === 0) {
    return [{ id: 1, title: "全文", content: text }];
  }

  return chapters;
};

// Regex to split outline into episodes
export const parseOutlineEpisodes = (text: string): Episode[] => {
  const episodeRegex = /(?:^|\n)\s*(第[0-9]+集.*)(?:\r?\n|\r)([\s\S]*?)(?=(?:\n\s*第[0-9]+集)|$)/g;
  
  const episodes: Episode[] = [];
  let match;
  let id = 1;

  while ((match = episodeRegex.exec(text)) !== null) {
    const title = match[1].trim();
    const content = match[2].trim();
    
    // Extract "对应原著章节"
    const chapterMatch = content.match(/对应原著章节[：:]\s*(.*)/);
    const targetChapter = chapterMatch ? chapterMatch[1].trim() : "";

    episodes.push({
      id: id++,
      title,
      content,
      targetChapter,
      generatedScript: null,
      lastVersionScript: null,
      usedSourceText: "", 
      chatHistory: [],
      status: 'pending'
    });
  }

  if (episodes.length === 0) {
      return [{
          id: 1,
          title: "第1集",
          content: text,
          targetChapter: "",
          generatedScript: null,
          lastVersionScript: null,
          usedSourceText: "",
          chatHistory: [],
          status: 'pending'
      }];
  }

  return episodes;
};

// --- Shared Utilities for Content Extraction ---

export const cnToInt = (cn: string): number => {
  if (!cn) return 0;
  if (!isNaN(Number(cn))) return Number(cn);
  const map: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '两': 2
  };
  if (map[cn] !== undefined) return map[cn];
  if (cn.startsWith('十')) return 10 + (map[cn[1]] || 0);
  if (cn.endsWith('十')) return (map[cn[0]] || 1) * 10;
  if (cn.includes('十')) {
    const parts = cn.split('十');
    return (map[parts[0]] || 1) * 10 + (map[parts[1]] || 0);
  }
  return 0;
};

// --- NEW: Script Parser for Audit Mode ---
export const parseScriptToEpisodes = (text: string): Episode[] => {
  const lines = text.split(/\r?\n/);
  const episodes: Map<number, { title: string, parts: string[] }> = new Map();
  
  // 匹配：第X集, 第X场, 第X幕, 【第X集】, Scene X, Episode X
  // 并且放宽对特殊符号和中文数字的支持，匹配行首
  const headerRegex = /^\s*(?:【?\s*第\s*([0-9零一二三四五六七八九十两百千]+)\s*[集场幕回].*?】?|Episode\s*([0-9]+)|Scene\s*([0-9]+))/i;

  let currentId = 0;
  let preambleParts: string[] = []; // 用于保存第一集之前的元数据/前言

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 跳过完结标记
    if (line.includes("完") || line.toLowerCase().includes("end")) {
       if (currentId > 0) {
          episodes.get(currentId)?.parts.push(line);
       } else {
          preambleParts.push(line);
       }
       continue;
    }

    const match = line.match(headerRegex);

    if (match) {
        const idStr = match[1] || match[2] || match[3] || '1';
        const parsedId = cnToInt(idStr) || 1;

        currentId = parsedId;
        
        if (!episodes.has(currentId)) {
            episodes.set(currentId, { title: `第${currentId}集`, parts: [line] });
        } else {
            // 如果已经存在同一集，把新出现的标题（可能是正文标题）也追加进去
            episodes.get(currentId)?.parts.push(""); // 加个空行间隔
            episodes.get(currentId)?.parts.push(line);
        }
    } else {
        if (currentId > 0) {
            episodes.get(currentId)?.parts.push(line);
        } else {
            preambleParts.push(line);
        }
    }
  }

  const results: Episode[] = [];
  const sortedIds = Array.from(episodes.keys()).sort((a, b) => a - b);
  
  // 如果有前言，把它合并到第一集
  const preambleText = preambleParts.join('\n').trim();

  if (sortedIds.length > 0) {
      for (let i = 0; i < sortedIds.length; i++) {
          const id = sortedIds[i];
          const epData = episodes.get(id)!;
          
          let finalScript = epData.parts.join('\n').trim();
          
          // 将前言合并到解析出的第一个集中
          if (i === 0 && preambleText.length > 0) {
              finalScript = preambleText + "\n\n" + finalScript;
          }

          results.push({
              id: id,
              title: epData.title,
              content: "（上传的剧本 - 暂无大纲数据）",
              targetChapter: "",
              generatedScript: finalScript,
              lastVersionScript: null,
              usedSourceText: "",
              chatHistory: [],
              status: 'completed', // 确保审稿模式下准备就绪
              draftOutline: "（上传的剧本 - 暂无大纲数据）",
          });
      }
  } else {
      // 没有任何分集标记的兜底
      const fullText = (preambleText + '\n' + Array.from(episodes.values()).map(v => v.parts.join('\n')).join('\n')).trim();
      if (fullText.length > 0) {
          results.push({
              id: 1,
              title: "全本/第1集",
              content: "（上传的剧本 - 暂无大纲数据）",
              targetChapter: "",
              generatedScript: fullText,
              lastVersionScript: null,
              usedSourceText: "",
              chatHistory: [],
              status: 'completed',
              draftOutline: "（上传的剧本 - 暂无大纲数据）",
          });
      }
  }

  return results;
};

export const extractChapterIds = (targetStr: string): number[] => {
  if (!targetStr) return [];
  const matches = [...targetStr.matchAll(/(?:第)?\s*([0-9]+|[零一二三四五六七八九十两]+)\s*(?:章)?/g)];
  if (matches.length === 0) return [];

  const foundNumbers = matches.map(m => {
    const fullMatch = m[0];
    const numPart = m[1];
    const isChinese = /[零一二三四五六七八九十两]/.test(numPart);
    if (isChinese && !fullMatch.includes('第') && !fullMatch.includes('章')) {
        return null;
    }
    return {
      val: cnToInt(numPart),
      index: m.index || 0,
      raw: fullMatch
    };
  }).filter((n): n is { val: number, index: number, raw: string } => n !== null && n.val > 0);

  const finalIds = new Set<number>();
  for (let i = 0; i < foundNumbers.length; i++) {
    const current = foundNumbers[i];
    finalIds.add(current.val);
    if (i < foundNumbers.length - 1) {
      const next = foundNumbers[i+1];
      const textBetween = targetStr.slice(current.index + current.raw.length, next.index);
      if (/[-~至到]/.test(textBetween)) {
        if (next.val > current.val) {
          for (let j = current.val + 1; j < next.val; j++) {
            finalIds.add(j);
          }
        }
      }
    }
  }
  return Array.from(finalIds).sort((a, b) => a - b);
};

export const getChapterRange = (text: string): { start: number, end: number } | null => {
  const ids = extractChapterIds(text);
  if (ids.length === 0) return null;
  return { start: Math.min(...ids), end: Math.max(...ids) };
};

export const getRelevantChapterContent = (chapters: Chapter[], targetString: string): string => {
    if (!targetString) return ""; // Return empty string if no target, let ScriptGenerator handle fallback if needed
    
    const targetIds = extractChapterIds(targetString);
    if (targetIds.length > 0) {
      const matchedContent = targetIds
        .map(id => {
          const byId = chapters.find(c => c.id === id);
          if (byId) return `【第${id}章原文】：\n${byId.content}`;
          const byTitle = chapters.find(c => c.title.includes(id.toString()) || c.title.includes(`第${id}章`));
          if (byTitle) return `【${byTitle.title}原文】：\n${byTitle.content}`;
          return null;
        })
        .filter(Boolean)
        .join("\n\n-------------------\n\n");
      if (matchedContent) return matchedContent;
    }
    
    // Fallback: simple number match
    const match = targetString.match(/[0-9]+/);
    const chapterNum = match ? parseInt(match[0]) : null;
    if (chapterNum && chapters[chapterNum-1]) return chapters[chapterNum-1].content;
    
    return "";
};
