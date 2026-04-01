import { useCallback, useRef, useState } from 'react';
import { AiTaskLog, AiTaskOptions, AiTaskProgress, runAiTask } from '../services/aiTaskRunner';

export const useAiTask = (taskName: string) => {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<AiTaskProgress | null>(null);
  const [logs, setLogs] = useState<AiTaskLog[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const lastTaskRef = useRef<(() => Promise<unknown>) | null>(null);

  const appendLog = useCallback((log: AiTaskLog) => {
    setLogs(prev => [...prev.slice(-39), log]);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runTask = useCallback(async <T,>(
    task: Parameters<typeof runAiTask<T>>[0],
    options: AiTaskOptions<T> = {},
  ): Promise<T> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setError(null);
    setProgress(null);
    appendLog({ level: 'info', message: `开始任务：${taskName}`, timestamp: Date.now() });

    const execute = async () => runAiTask(task, options, {
      onLog: appendLog,
      onProgress: setProgress,
    }, controller);

    lastTaskRef.current = execute;

    try {
      const result = await execute();
      appendLog({ level: 'info', message: `完成任务：${taskName}`, timestamp: Date.now() });
      return result;
    } catch (caughtError) {
      const normalizedError = caughtError instanceof Error ? caughtError : new Error(String(caughtError));
      setError(normalizedError);
      throw normalizedError;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsRunning(false);
      setProgress(null);
    }
  }, [appendLog, taskName]);

  const retryLastTask = useCallback(async () => {
    if (!lastTaskRef.current) {
      return null;
    }
    return lastTaskRef.current();
  }, []);

  return {
    cancel,
    error,
    isRunning,
    logs,
    progress,
    retryLastTask,
    runTask,
  };
};
