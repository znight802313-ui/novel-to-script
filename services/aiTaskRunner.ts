export interface AiTaskProgress {
  current: number;
  total: number;
  message: string;
}

export interface AiTaskLog {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

export interface AiTaskContext {
  signal: AbortSignal;
  log: (message: string, level?: AiTaskLog['level']) => void;
  setProgress: (progress: AiTaskProgress | null) => void;
}

export interface AiTaskOptions<T> {
  fallbackTask?: (error: unknown, context: AiTaskContext) => Promise<T>;
  retryDelayMs?: number;
  retries?: number;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const runAiTask = async <T>(
  task: (context: AiTaskContext) => Promise<T>,
  options: AiTaskOptions<T>,
  hooks: {
    onLog?: (log: AiTaskLog) => void;
    onProgress?: (progress: AiTaskProgress | null) => void;
  },
  controller: AbortController,
): Promise<T> => {
  const createLog = (message: string, level: AiTaskLog['level'] = 'info') => {
    hooks.onLog?.({ level, message, timestamp: Date.now() });
  };

  const context: AiTaskContext = {
    signal: controller.signal,
    log: createLog,
    setProgress: (progress) => hooks.onProgress?.(progress),
  };

  const retries = options.retries ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 600;

  let attempt = 0;
  while (attempt <= retries) {
    try {
      attempt += 1;
      if (attempt > 1) {
        createLog(`第 ${attempt} 次执行任务`, 'warn');
      }
      const result = await task(context);
      hooks.onProgress?.(null);
      return result;
    } catch (error) {
      if (controller.signal.aborted) {
        createLog('任务已取消', 'warn');
        throw error;
      }

      if (attempt <= retries) {
        createLog(`任务失败，准备重试（${attempt}/${retries}）`, 'warn');
        await delay(retryDelayMs);
        continue;
      }

      if (options.fallbackTask) {
        createLog('主任务失败，执行降级任务', 'warn');
        const result = await options.fallbackTask(error, context);
        hooks.onProgress?.(null);
        return result;
      }

      createLog(error instanceof Error ? error.message : '任务执行失败', 'error');
      throw error;
    }
  }

  throw new Error('任务执行失败');
};
