/**
 * 统一的 API 调用客户端
 * 使用 fetch 直接调用 OpenAI 兼容接口，支持带特殊前缀的模型 ID
 * 完全兼容 novai.su 和 MixAI 的 API 格式
 */

// ==================== 类型定义 ====================

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  fallback: string | null;
}

export interface APIConfig {
  apiKey: string;
  baseUrl: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

export interface APIResponse {
  text: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ==================== 模型配置 ====================

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: '[次]claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6 (次)',
    description: 'Anthropic Claude 模型，快速稳定 (次)',
    fallback: '[次]gemini-3.1-pro-preview-thinking'
  },
  {
    id: '[次]claude-opus-4-6',
    name: 'Claude Opus 4.6 (次) ⭐',
    description: '最强大的 Claude Opus 模型，适合深度创作评测 (次)',
    fallback: '[次]claude-sonnet-4-6'
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6 (MixAI) ⭐',
    description: '最新最强的 Claude 模型，推理和创作能力全面提升',
    fallback: '[次]gemini-3.1-pro-preview-thinking'
  },
  {
    id: '[次]gemini-3.1-pro-preview-thinking',
    name: 'Gemini 3.1 Pro Thinking (次)',
    description: '最新版本，更强的推理和思考能力',
    fallback: '[次]gemini-3-pro-preview-thinking'
  },
  {
    id: '[次]gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro (次)',
    description: '最新版本，更强的推理和理解能力',
    fallback: '[次]gemini-3-pro-preview-thinking'
  },
  {
    id: '[次]gemini-3-pro-preview-thinking',
    name: 'Gemini 3.0 Pro (次)',
    description: '强逻辑推理，适合剧情分析',
    fallback: '[次]gemini-3-flash-preview'
  },
  {
    id: '[次]gemini-3-flash-preview',
    name: 'Gemini 3 Flash (次)',
    description: '快速响应，适合日常生成任务',
    fallback: null
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5 (MixAI)',
    description: 'MixAI 提供的 Claude Sonnet 模型',
    fallback: '[次]gemini-3.1-pro-preview-thinking'
  },
  {
    id: 'claude-opus-4-6-a',
    name: 'Claude Opus 4.6 (MixAI) ⭐',
    description: '最强大的 Claude 模型，支持超长上下文（200K tokens）',
    fallback: 'claude-sonnet-4-5-20250929'
  },
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4 (AIXJ)',
    description: '最新 GPT 5.4 模型，高推理倾向',
    fallback: '[次]gemini-3.1-pro-preview-thinking'
  },
  {
    id: 'rsx-claude-opus-4-6',
    name: 'Claude Opus 4.6 (RSX) ⭐',
    description: 'RSX 提供的 Claude Opus 模型，支持超长上下文（200K tokens）',
    fallback: 'rsx-claude-sonnet-4-6'
  },
  {
    id: 'rsx-claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6 (RSX)',
    description: 'RSX 提供的 Claude Sonnet 模型，上下文充足',
    fallback: 'claude-sonnet-4-6'
  },
];

// 默认配置
export const DEFAULT_API_CONFIG = {
  baseUrl: 'https://once.novai.su/v1',
  defaultModel: '[次]gemini-3-pro-preview-thinking',
  analysisModel: 'claude-sonnet-4-6',
  generationModel: '[次]gemini-3-pro-preview-thinking',
  auditModel: 'claude-opus-4-6-a',
  fallbackModel: '[次]gemini-3-pro-preview-thinking',
  timeout: 180000, // 3分钟超时
};

// MixAI 配置 — API Key 从环境变量读取，不硬编码在源码中
const MIXAI_CONFIG = {
  baseUrl: 'https://mixai.cc/v1',
  models: {
    'claude-sonnet-4-6': import.meta.env.VITE_MIXAI_KEY_CLAUDE_SONNET_46 || '',
    'claude-sonnet-4-5-20250929': import.meta.env.VITE_MIXAI_KEY_CLAUDE_SONNET_45 || '',
    'claude-opus-4-6-a': import.meta.env.VITE_MIXAI_KEY_CLAUDE_OPUS_45 || '',
  }
};

// AIXJ 配置
const AIXJ_CONFIG = {
  baseUrl: 'https://aixj.top/v1', // 补全 v1 路径以兼容 OpenAI 格式
  apiKey: import.meta.env.VITE_AIXJ_KEY || '',
};

// RSX 配置 — 模型 ID 带 rsx- 前缀以区分 MixAI
const RSX_CONFIG = {
  baseUrl: 'https://rsxermu666.cn/v1',
  models: {
    'rsx-claude-sonnet-4-6': import.meta.env.VITE_RSX_KEY || '',
    'rsx-claude-opus-4-6': import.meta.env.VITE_RSX_KEY || '',
  }
};

// ==================== 模型上下文限制 ====================

/**
 * 各模型的上下文窗口人物限制（字符数，按 4 chars/token 保守估算）
 * 用于在 geminiService 中动态截断 Prompt，充分利用大模型上下文能力
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Claude Opus 4.6 — 200K tokens → ~500K chars，保守用 400K
  '[次]claude-opus-4-6': 400000,
  'claude-opus-4-6-a': 400000,
  // Claude Sonnet 4.6 / 4.5 — 200K tokens → 保守用 300K
  '[次]claude-sonnet-4-6': 300000,
  'claude-sonnet-4-6': 300000,
  'claude-sonnet-4-5-20250929': 300000,
  // Gemini 3.1 Pro — 1M tokens → 保守用 800K chars
  '[次]gemini-3.1-pro-preview-thinking': 800000,
  '[次]gemini-3.1-pro-preview': 800000,
  // Gemini 3.0 Pro & Flash — 1M tokens → 保守用 500K chars
  '[次]gemini-3-pro-preview-thinking': 500000,
  '[次]gemini-3-flash-preview': 500000,
  // GPT-5.2 — 保守估算 128K tokens → 150K chars
  '[次]gpt-5.2': 150000,
  // Claude Sonnet/Opus 4.6 (RSX) — 200K tokens → 保守用 300K
  'rsx-claude-sonnet-4-6': 300000,
  'rsx-claude-opus-4-6': 400000,
};

/**
 * 获取指定模型的 Prompt 文本最大字符数（用于安全截断 novelText 等长文本）
 * 返回值会预留约 20K chars 的空间给系统 prompt 和输出
 */
export const getPromptMaxChars = (modelId: string): number => {
  const contextLimit = MODEL_CONTEXT_LIMITS[modelId];
  if (!contextLimit) return 50000; // 未知模型使用保守默认值
  // 预留 20K chars 给系统 Prompt + 输出
  return Math.max(contextLimit - 20000, 30000);
};

// ==================== 工具函数 ====================

/**
 * 判断是否为 MixAI 模型
 */
export const isMixAIModel = (modelId: string): boolean => {
  return Object.keys(MIXAI_CONFIG.models).includes(modelId);
};

/**
 * 获取 API 配置
 */
export const getAPIConfig = (
  apiKey: string,
  baseUrl?: string,
  modelId?: string
): APIConfig => {
  // 如果是 MixAI 模型
  if (modelId && isMixAIModel(modelId)) {
    return {
      apiKey: MIXAI_CONFIG.models[modelId as keyof typeof MIXAI_CONFIG.models],
      baseUrl: MIXAI_CONFIG.baseUrl,
    };
  }

  // 如果是 RSX 模型（通过 rsx- 前缀识别）
  if (modelId && modelId.startsWith('rsx-')) {
    const baseModelId = modelId.slice('rsx-'.length) as keyof typeof RSX_CONFIG.models;
    return {
      apiKey: RSX_CONFIG.models[baseModelId] || '',
      baseUrl: RSX_CONFIG.baseUrl,
    };
  }

  // 如果是 AIXJ 模型
  if (modelId === 'gpt-5.4') {
    return {
      apiKey: AIXJ_CONFIG.apiKey,
      baseUrl: AIXJ_CONFIG.baseUrl,
    };
  }

  // 否则使用用户配置或默认配置
  const finalApiKey = apiKey?.trim() || import.meta.env.VITE_API_KEY;
  if (!finalApiKey) {
    throw new Error('未检测到 API Key。请在界面输入或配置环境变量。');
  }

  return {
    apiKey: finalApiKey,
    baseUrl: baseUrl?.trim() || DEFAULT_API_CONFIG.baseUrl,
  };
};

/**
 * 格式化 Base URL
 * 确保 URL 以 /chat/completions 结尾
 */
const formatBaseUrl = (baseUrl: string): string => {
  let url = baseUrl.trim();

  // 移除末尾的斜杠
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  // 如果已经包含 chat/completions，直接返回
  if (url.includes('chat/completions')) {
    return url;
  }

  // 否则添加 /chat/completions
  return `${url}/chat/completions`;
};

/**
 * 格式化错误消息
 */
const formatErrorMessage = (status: number, message: string): string => {
  // 429 配额错误
  if (status === 429 || message.includes('Quota') || message.includes('RESOURCE_EXHAUSTED')) {
    return 'API 配额已耗尽 (Quota Exceeded)。请检查您的计费状态或稍后重试。';
  }

  // 404 错误
  if (status === 404 || message.includes('Not Found')) {
    return 'API 请求 404 错误。请检查：1. Base URL 是否填写正确？2. 模型名称是否正确？';
  }

  // 401/403 鉴权错误
  if (status === 401 || status === 403 || message.includes('Permission denied') || message.includes('PERMISSION_DENIED')) {
    return 'API 鉴权失败 (401/403)。请检查您的 API Key 是否正确，或者该 Key 是否有权访问此模型。';
  }

  // 400 参数错误
  if (status === 400 || message.includes('INVALID_ARGUMENT')) {
    return `API 请求无效 (400)。请检查配置是否完整。详细信息: ${message}`;
  }

  // 500 服务器错误
  if (status >= 500) {
    return `API 服务器错误 (${status})。请稍后重试。`;
  }

  return message;
};

// ==================== 核心 API 调用 ====================

/**
 * 判断错误是否可重试
 */
const isRetryableError = (error: any, status?: number): boolean => {
  // 500 系列服务器错误
  if (status && status >= 500) return true;

  // 流量过载错误
  if (error.message?.includes('CAPACITY') ||
      error.message?.includes('high traffic') ||
      error.message?.includes('overloaded')) {
    return true;
  }

  // 429 限流错误
  if (status === 429 || error.message?.includes('rate limit')) return true;

  // 网络超时
  if (error.name === 'AbortError') return true;

  return false;
};

/**
 * 判断是否为流量过载错误（需要提示用户切换模型）
 */
export const isCapacityError = (error: any): boolean => {
  return error.message?.includes('CAPACITY') ||
         error.message?.includes('high traffic') ||
         error.message?.includes('experiencing high traffic') ||
         error.message?.includes('overloaded');
};

/**
 * 延迟函数（用于重试间隔）
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const shouldUseClaudeExtendedBackoff = (
  modelName: string,
  status?: number,
  message?: string
): boolean => {
  if (!modelName.toLowerCase().includes('claude')) return false;

  const normalizedMessage = (message || '').toLowerCase();
  return Boolean(
    status === 429 ||
    (status !== undefined && status >= 500) ||
    normalizedMessage.includes('auth_unavailable') ||
    normalizedMessage.includes('no auth available') ||
    normalizedMessage.includes('usage limit') ||
    normalizedMessage.includes('usage_limit_has_been_reached')
  );
};

const getRetryDelayMs = (
  attempt: number,
  modelName: string,
  retryContext?: { status?: number; message?: string } | null
): number => {
  if (shouldUseClaudeExtendedBackoff(modelName, retryContext?.status, retryContext?.message)) {
    const schedule = [3000, 8000, 15000, 30000];
    const baseDelay = schedule[Math.min(attempt - 1, schedule.length - 1)];
    const jitter = Math.floor(Math.random() * 600);
    return baseDelay + jitter;
  }

  return Math.min(1000 * Math.pow(2, attempt - 1), 5000);
};

/**
 * 统一的 API 调用函数（带自动重试）
 * 使用 fetch 直接调用，支持所有带前缀的模型 ID
 */
export const callUniversalAPI = async (
  config: APIConfig,
  modelName: string,
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: 'json_object' | 'text' };
    timeout?: number;
    maxRetries?: number; // 最大重试次数
    signal?: AbortSignal;
  }
): Promise<APIResponse> => {
  const url = formatBaseUrl(config.baseUrl);
  const timeout = options?.timeout || DEFAULT_API_CONFIG.timeout;
  const maxRetries = options?.maxRetries ?? 2; // 默认重试 2 次

  // 构建请求体
  // 剥离 rsx- 前缀，因为 RSX API 不认识这个前缀
  const actualModelName = modelName.startsWith('rsx-')
    ? modelName.slice('rsx-'.length)
    : modelName;
  const requestBody: any = {
    model: actualModelName,
    messages: messages,
    temperature: options?.temperature ?? 0.7,
  };

  // GPT-5.4 特殊参数：reasoning_effort
  if (modelName === 'gpt-5.4') {
    requestBody.reasoning_effort = "high";
  }

  // 添加可选参数
  if (options?.maxTokens) {
    requestBody.max_tokens = options.maxTokens;
  }

  // Claude 模型不支持 response_format 参数（OpenAI/Gemini 才支持）
  // 传给 Claude 会触发 500 错误，Claude 通过 prompt 里的指令来保证 JSON 格式输出
  const isClaudeModel = modelName.toLowerCase().includes('claude');
  if (options?.responseFormat && !isClaudeModel) {
    requestBody.response_format = options.responseFormat;
  }

  // 若调用方未传 maxTokens，补充一个合理默认值 (8192)，防止大批次生成时半路截断
  if (!options?.maxTokens) {
    requestBody.max_tokens = 8192;
  }

  // 明确禁用流式输出，避免代理网关产生歧义
  requestBody.stream = false;

  // 重试逻辑
  let lastError: any = null;
  let lastRetryContext: { status?: number; message?: string } | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    // 如果用户主动取消，则直接中断
    if (options?.signal?.aborted) {
      clearTimeout(timeoutId);
      throw new Error('AbortError: 用户已取消生成');
    }
    
    const onSignalAbort = () => controller.abort();
    if (options?.signal) {
      options.signal.addEventListener('abort', onSignalAbort);
    }

    try {
      // 如果不是第一次尝试，添加延迟（指数退避 / Claude 长退避）
      if (attempt > 0) {
        const delayMs = getRetryDelayMs(attempt, modelName, lastRetryContext);
        console.log(`⏳ 第 ${attempt} 次重试，等待 ${delayMs}ms...`);
        await delay(delayMs);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 处理错误响应
      if (!response.ok) {
        const errorText = await response.text();
        // 打印原始错误供调试用
        console.error(`🔴 MixAI/API raw error (HTTP ${response.status}):`, errorText.substring(0, 800));
        let errorMessage = `API Error ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorText;
        } catch {
          errorMessage = errorText;
        }

        const formattedError = new Error(formatErrorMessage(response.status, errorMessage));

        // 判断是否可重试
        if (isRetryableError(formattedError, response.status) && attempt < maxRetries) {
          lastError = formattedError;
          lastRetryContext = { status: response.status, message: errorMessage };
          console.warn(`⚠️ 可重试错误 (尝试 ${attempt + 1}/${maxRetries + 1}):`, errorMessage);
          continue; // 继续重试
        }

        // 不可重试的错误或已达最大重试次数，直接抛出
        throw formattedError;
      }

      // 解析响应
      const data = await response.json();
      
      if (options?.signal) {
        options.signal.removeEventListener('abort', onSignalAbort);
      }

      return {
        text: data.choices?.[0]?.message?.content || '',
        usage: data.usage,
      };

    } catch (error: any) {
      clearTimeout(timeoutId);
      if (options?.signal) {
        options.signal.removeEventListener('abort', onSignalAbort);
      }
      lastError = error;

      console.error('🔴 API Call Failed:', {
        url,
        modelName,
        attempt: attempt + 1,
        errorName: error.name,
        errorMessage: error.message,
      });

      // 处理超时或主动取消错误
      if (error.name === 'AbortError' || error.message?.includes('AbortError')) {
        if (options?.signal?.aborted) {
          throw new Error('生成已被取消');
        }
        if (attempt < maxRetries) {
          lastRetryContext = { message: error.message };
          console.warn(`⏱️ 请求超时，准备重试 (${attempt + 1}/${maxRetries + 1})...`);
          continue;
        }
        throw new Error(`请求超时（${timeout / 1000}秒）。已重试 ${maxRetries} 次，请检查网络连接或稍后重试。`);
      }

      // 处理网络错误
      if (error.message?.includes('fetch failed') || error.message?.includes('NetworkError') || error.message?.includes('Failed to fetch')) {
        if (attempt < maxRetries) {
          lastRetryContext = { message: error.message };
          console.warn(`🌐 网络错误，准备重试 (${attempt + 1}/${maxRetries + 1})...`);
          continue;
        }
        throw new Error(`请求时网络连接异常或超时。可能原因：1. CORS 跨域限制 2. 网络连接问题 3. API 服务器不可达。原始错误: ${error.message}`);
      }

      // 判断是否可重试
      if (isRetryableError(error) && attempt < maxRetries) {
        lastRetryContext = { message: error.message };
        console.warn(`⚠️ 可重试错误，准备重试 (${attempt + 1}/${maxRetries + 1})...`);
        continue;
      }

      // 不可重试或已达最大重试次数
      break;
    }
  }

  // 抛出最后的错误
  throw lastError || new Error('未知错误');
};

// ==================== 便捷调用函数 ====================

/**
 * 简化的文本生成调用
 */
export const generateText = async (
  apiKey: string,
  prompt: string,
  options: {
    baseUrl?: string;
    model?: string;
    temperature?: number;
    jsonMode?: boolean;
    systemPrompt?: string;
    maxTokens?: number;
  } = {}
): Promise<string> => {
  const modelId = options.model || DEFAULT_API_CONFIG.defaultModel;
  const config = getAPIConfig(apiKey, options.baseUrl, modelId);

  const messages: ChatMessage[] = [];

  // 添加系统提示
  if (options.systemPrompt) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }

  // 添加用户消息
  messages.push({ role: 'user', content: prompt });

  const response = await callUniversalAPI(config, modelId, messages, {
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    responseFormat: options.jsonMode ? { type: 'json_object' } : undefined,
  });

  return response.text;
};

/**
 * 测试 API 连接
 */
export const testAPIConnection = async (
  apiKey: string,
  baseUrl?: string,
  modelId?: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const testModel = modelId || '[次]gemini-3-flash-preview';
    const config = getAPIConfig(apiKey, baseUrl, testModel);

    await callUniversalAPI(
      config,
      testModel,
      [{ role: 'user', content: 'Hi' }],
      { maxTokens: 10, timeout: 30000 }
    );

    return {
      success: true,
      message: '验证成功！您的配置可以正常连接 API。',
    };
  } catch (error: any) {
    console.error('Connection Test Failed:', error);
    return {
      success: false,
      message: `连接失败: ${error.message}`,
    };
  }
};

// ==================== 辅助函数 ====================

/**
 * 获取模型的降级选项
 */
export const getFallbackModel = (modelId: string): string | null => {
  const model = AVAILABLE_MODELS.find(m => m.id === modelId);
  return model?.fallback || null;
};

export const getRecommendedModel = (taskType: 'analysis' | 'generation' | 'audit' | 'fallback'): string => {
  switch (taskType) {
    case 'analysis':
      return DEFAULT_API_CONFIG.analysisModel;
    case 'audit':
      return DEFAULT_API_CONFIG.auditModel;
    case 'fallback':
      return DEFAULT_API_CONFIG.fallbackModel;
    case 'generation':
    default:
      return DEFAULT_API_CONFIG.generationModel;
  }
};
