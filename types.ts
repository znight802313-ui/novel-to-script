
export interface Chapter {
  id: number;
  title: string;
  content: string;
}

// 剧本类型：第一人称解说 或 第三人称演绎
export type ScriptNarrativeType = 'first-person' | 'third-person';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  quotedText?: string;
}

export interface ScriptVersion {
  id: string;
  content: string;
  timestamp: number;
  note: string;
  type: 'manual' | 'ai' | 'auto';
}

// --- IP 价值分析 ---
export interface IpDimensionScore {
  dimension: string; // 维度名称
  score: number;      // 0-100 分
  comment: string;   // 简短评语
}

export interface IpAnalysisReport {
  totalScore: number;          // 综合评分 0-100
  summary: string;             // 整体评价摘要
  dimensionScores: IpDimensionScore[];
  recommendation: {
    strategy: 'high_fidelity' | 'heavy_adaptation'; // IP遵循度高压缩 / 大幅度魔改
    reasoning: string;         // 推荐理由
    confidence: number;        // 推荐置信度 0-1
  };
  strengths: string[];         // 小说优势
  weaknesses: string[];        // 小说劣势
  shortDramaCompatibility: number; // 短剧改编适配度 0-100
  // AI短剧类型适配度评估
  aiDramaStyle?: {
    recommended: '2d_anime' | '3d_anime' | 'ai_realistic'; // 推荐类型
    scores: {
      '2d_anime': number;       // 2D动漫适配分 0-100
      '3d_anime': number;       // 3D动漫适配分 0-100
      'ai_realistic': number;   // AI仿真人适配分 0-100
    };
    reasoning: string;          // 推荐理由
  };
  // 叙事角度推荐
  narrativePerspective?: {
    recommended: 'first-person' | 'third-person'; // 推荐叙事角度
    reasoning: string;          // 推荐理由
  };
  timestamp: number;
}

// --- Legacy Audit Item (kept for backward compatibility if needed, but AuditAnnotation is preferred) ---
export interface AuditItem {
  id: string;
  category: string;
  severity: 'high' | 'medium' | 'low';
  issue: string;
  suggestion: string;
  targetQuote?: string;
  status: 'pending' | 'applied' | 'ignored';
}

// --- NEW: Deep Audit System Types ---

export interface AuditScore {
  dimension: string; // "剧情", "人物", "动作", "格式"
  score: number; // 0-100
  comment: string;
}

export interface AuditAnnotation {
  id: string;
  dimension: string; // e.g. "动作.执行力"
  location: {
    lineContent: string; // The specific text in script
    scene?: string;
  };
  score: number; // 0 (Fatal) or 1 (Warning)
  issue: string;
  suggestion: string;
  canBatchFix: boolean; // Is this a pattern that can be fixed globally?
  status: 'pending' | 'fixed' | 'ignored';
}

export interface AuditReport {
  scriptId: string;
  totalScore: number;
  dimensionScores: AuditScore[];
  annotations: AuditAnnotation[];
  summary: string; // Overall AI comment
  timestamp: number;
}

// --- NEW: Script Comparison Types ---
export interface ComparisonItem {
  fileName: string;
  score: number;
  rank: number;
  pros: string[];
  cons: string[];
  summary: string;
}

export interface ComparisonReport {
  winner: string; // FileName of the winner
  reasoning: string; // Why it won
  items: ComparisonItem[];
  timestamp: number;
}

// --- NEW: Deep Character Analysis System (Time-Axis State Machine) ---

export interface CharacterRelation {
  target: string;
  attitude: string;
  subtext: string;
}

export interface CharacterStage {
  id: string; // Unique ID for this stage node
  stageIndex: number;
  stageName: string; // e.g. "少年乞讨期"

  // 1. Mapping Index
  sourceRange: string; // "第1-5章"
  startChapter: number;
  endChapter: number;

  // 2. Age & Status Anchor
  currentAge: string; // number or description like "12岁"
  visualAgeDesc: string; // "看起来像8岁"

  // 3. Visual & Action Anchor
  appearance: string; // 衣着、外貌
  physicalState: string; // 身体状态 (Action Lines basis)
  signatureProps: string; // 核心道具

  // 4. Cognitive & Logic Anchor
  knownInfo: string[]; // 防剧透护栏
  coreGoal: string; // 行动元动力

  // 5. Voice & Personality Anchor
  speakingStyle: string; // 语速、词汇层级
  personalityTags: string[]; 

  // 6. Relation Anchor
  relations: CharacterRelation[];
}

export interface AnalyzedCharacter {
  id: string;
  // Static Profile
  name: string;
  gender: string;
  origin: string; // 籍贯/种族
  role: string; // "男主", "反派" (Functional role)
  bio: string; // General static summary
  
  // Dynamic Timeline
  timeline: CharacterStage[];
}

// --- NEW: Story Blueprint Structures ---

export interface StoryArcNode {
  stage: string; // "起步", "进阶", "质变" etc.
  event: string;
  action: string;
  result: string;
}

// Structured Point for Emotional Plot
export interface PlotPointDetail {
  description: string;
  emotionalScore: number; // 1-10
  emotionalTag: string; // e.g. "爽点", "泪点"
  foreshadowing?: string; // Optional foreshadowing note
}

// Structured Worldview/Setting extraction
export interface WorldviewDetail {
  powerSystem?: string;
  items?: string;
  geography?: string;
  monsters?: string;
}

export interface GoldenFingerDetail {
  definition?: string; // What is it?
  impact?: string; // What did it do here?
  cost?: string; // Limitations
  ruleBreaker?: string; // How it breaks rules
}

export interface PlotEvent {
  title: string;
  range: string;
  content: string; // Kept for backward compatibility (maps to summary)
  
  // --- New Structured Fields ---
  summary?: string; // 100-word action skeleton
  importance?: number; // 1-5 Stars
  plotPoints?: PlotPointDetail[]; // Chronological emotional points
  worldview?: WorldviewDetail;
  goldenFinger?: GoldenFingerDetail;
  quotes?: string[]; // Golden quotes
}

export interface PlotPhase {
  phaseName: string;
  events: PlotEvent[];
}

export interface StoryBlueprint {
  // 主角信息（用于第一人称叙述）
  protagonist?: {
    name: string;
    identity: string; // 如"女主角"、"男主角"
  };

  growthArc: {
    summary: string;
    nodes: StoryArcNode[];
  };
  conflictArc: {
    nodes: { stage: string; antagonist: string; conflict: string; result: string }[];
  };
  relationshipArc: {
    nodes: { character: string; identity: string; change: string }[];
  };
  mysteryArc: { // New Field for "Dark/Fate Line"
    summary: string;
    nodes: { 
      origin: string; 
      progress: string; 
      suspense: string;
      foreshadowingChapter?: string; // 伏笔出现章
      payoffChapter?: string;       // 伏笔回收章
    }[];
  };
  mainPlotArc: {
    phases: PlotPhase[];
  };
  analyzedChapters: number; // How many chapters have been analyzed so far
  summarySoFar: string; // Running summary for AI context
}

// --- Modified Existing Structures ---

export interface CharacterProfile {
  id: string;
  name: string;
  desc: string;
  isCustomized?: boolean;
}

export interface Episode {
  id: number;
  title: string;
  content: string;
  targetChapter: string;
  generatedScript: string | null;
  scriptVersions?: ScriptVersion[];
  lastVersionScript?: string | null;
  usedSourceText?: string;
  chatHistory: ChatMessage[];
  auditItems?: AuditItem[];
  status: 'pending' | 'generating' | 'completed' | 'error';
  isAnalyzing?: boolean;
  isAuditing?: boolean;

  // New: Link to deep audit report
  auditReport?: AuditReport | null;

  // New: Target word count for script generation
  targetWordCount?: number;

  // New: Narrative type for script generation
  narrativeType?: ScriptNarrativeType;

  draftNovelContent?: string;
  draftOutline?: string;
  draftWorldSetting?: string;
  draftKeyQuotes?: string;
  draftCharacters?: string;
  draftCharacterList?: CharacterProfile[];
  draftOpeningHook?: string;
  draftEndingHook?: string;
  draftEndingClosure?: string;
  viralTips?: string; // New field for viral writing tips
  draftForeshadowing?: string;
  draftTargetChapter?: string;
}

export interface AnalysisRange {
  start: number;
  end: number;
}

export interface BlueprintRetrySnapshot {
  blueprint: StoryBlueprint | null;
  characters: AnalyzedCharacter[];
}

export interface OutlineGlobalSettings {
  viralTips: string;
  expectedTotalEpisodesMin?: number | null;
  expectedTotalEpisodesMax?: number | null;
}

export interface OutlineGenerationProgressContext {
  totalChapters: number;
  processedChapters: number;
  progressPercent: number;
  generatedEpisodeCount: number;
  remainingChapters: number;
  expectedTotalEpisodesMin?: number | null;
  expectedTotalEpisodesMax?: number | null;
  remainingEpisodeRangeMin?: number | null;
  remainingEpisodeRangeMax?: number | null;
  estimatedTotalEpisodes?: number | null;
}

export interface ProjectState {
  novelName: string;
  novelChapters: Chapter[];
  episodes: Episode[];
  // New Fields for the full workflow
  blueprint: StoryBlueprint | null;
  characters: AnalyzedCharacter[];
  currentStep: AppStep;

  // For independent Audit Mode
  standaloneScript?: string;

  // 分集重组阶段的全局设置
  outlineGlobalSettings?: OutlineGlobalSettings;

  // Global narrative type setting
  narrativeType?: ScriptNarrativeType;

  // 第一人称叙述者信息（从第一集提取并固定）
  firstPersonNarrator?: {
    name: string;        // 叙述者角色名
    identity: string;    // 身份描述，如"女主角"、"男主角"
    extractedFrom: number; // 从第几集提取的
  };

  isParsing: boolean;
  apiKey?: string;
  baseUrl?: string;
  blueprintLastAnalysisRange?: AnalysisRange | null;
  blueprintRetrySnapshot?: BlueprintRetrySnapshot | null;

  // IP 价值分析结果
  ipAnalysisReport?: IpAnalysisReport | null;
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  IP_ANALYSIS = 'IP_ANALYSIS', // Step 1: IP价值分析
  BLUEPRINT = 'BLUEPRINT', // Step 2: Deconstruction
  OUTLINE = 'OUTLINE',     // Step 3: Reconstruction
  SCRIPT = 'SCRIPT',       // Step 4: Generation
  AUDIT = 'AUDIT'          // Step 5: Standalone Audit
}

export interface ScriptGenerationConfig {
  novelContent: string;
  outlineContent: string;
  previousScriptContext: string;
  previousNovelTail?: string; // 上一集原文的结尾片段，用于衔接
  episodeId: number;
  episodeTitle: string;
  worldSetting?: string;
  // REMOVED: tone
  keyQuotes?: string;
  characters?: string;
  characterList?: CharacterProfile[];
  openingHook?: string;
  endingHook?: string;
  endingClosure?: string;
  foreshadowing?: string;
  targetChapter?: string;
  targetWordCount?: number;
  narrativeType?: ScriptNarrativeType;
  useNovelReference?: boolean;
  viralTips?: string; // 爆款创作技巧
  conflictArcFiltered?: string; // 针对本集出场人物过滤出的冲突博弈节点
  relationshipArcFiltered?: string; // 针对本集出场人物过滤出的羁绊关系线节点
  // 第一人称固定叙述者信息
  narratorInfo?: {
    name: string;
    identity: string;
  };
}
