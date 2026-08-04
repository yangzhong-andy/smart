"use client";

import { useState, useCallback } from "react";

export interface UseActionOptions<T> {
  onSuccess?: (data: T) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
  successMessage?: string;
  errorMessage?: string | ((error: Error) => string);
}

export interface UseActionReturn<T> {
  execute: (action: () => Promise<T>) => Promise<T | undefined>;
  loading: boolean;
  error: Error | null;
  success: boolean;
  reset: () => void;
}

/**
 * 全局操作状态管理 Hook
 * 统一管理所有提交动作的 loading, error, success 状态
 */
export function useAction<T = void>(
  options: UseActionOptions<T> = {}
): UseActionReturn<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [success, setSuccess] = useState(false);

  const execute = useCallback(
    async (action: () => Promise<T>): Promise<T | undefined> => {
      setLoading(true);
      setError(null);
      setSuccess(false);

      try {
        const result = await action();
        setSuccess(true);
        setError(null);

        if (options.onSuccess) {
          await options.onSuccess(result);
        }

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setSuccess(false);

        if (options.onError) {
          await options.onError(error);
        }

        throw error;
      } finally {
        setLoading(false);
      }
    },
    [options]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setSuccess(false);
  }, []);

  return {
    execute,
    loading,
    error,
    success,
    reset,
  };
}
