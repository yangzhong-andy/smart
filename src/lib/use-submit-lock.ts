import { useState, useRef, useCallback } from 'react';

/**
 * 防重复提交 Hook
 * 用于防止网络延迟导致的重复提交
 */
export function useSubmitLock() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pendingRequestRef = useRef<AbortController | null>(null);
  const requestHashRef = useRef<string | null>(null);

  /**
   * 生成请求的唯一标识（基于请求内容）
   */
  const generateRequestHash = (url: string, method: string, body?: any): string => {
    const bodyStr = body ? JSON.stringify(body) : '';
    return `${method}:${url}:${bodyStr}`;
  };

  /**
   * 执行提交操作（带防重复保护）
   */
  const submit = useCallback(async <T = any>(
    submitFn: (signal?: AbortSignal) => Promise<T>,
    options?: {
      requestKey?: string; // 请求唯一标识，相同标识的请求会被去重
      url?: string;
      method?: string;
      body?: any;
    }
  ): Promise<T | null> => {
    // 如果正在提交，直接返回
    if (isSubmitting) {
      console.warn('提交正在进行中，忽略重复请求');
      return null;
    }

    // 生成请求 hash（用于去重）
    const requestHash = options?.requestKey 
      ? options.requestKey 
      : options?.url && options?.method
      ? generateRequestHash(options.url, options.method, options.body)
      : null;

    // 如果是相同的请求，直接返回
    if (requestHash && requestHashRef.current === requestHash) {
      console.warn('检测到重复请求，已忽略');
      return null;
    }

    // 创建 AbortController 用于取消请求
    const abortController = new AbortController();
    pendingRequestRef.current = abortController;

    // 设置请求 hash
    if (requestHash) {
      requestHashRef.current = requestHash;
    }

    setIsSubmitting(true);

    try {
      const result = await submitFn(abortController.signal);
      
      // 请求成功后清除 hash（允许相同请求再次提交）
      requestHashRef.current = null;
      
      return result;
    } catch (error: any) {
      // 如果是主动取消的请求，不抛出错误
      if (error.name === 'AbortError') {
        console.log('请求已取消');
        return null;
      }
      
      // 请求失败后也清除 hash，允许重试
      requestHashRef.current = null;
      
      throw error;
    } finally {
      setIsSubmitting(false);
      pendingRequestRef.current = null;
    }
  }, [isSubmitting]);

  /**
   * 取消当前正在进行的请求
   */
  const cancel = useCallback(() => {
    if (pendingRequestRef.current) {
      pendingRequestRef.current.abort();
      pendingRequestRef.current = null;
    }
    setIsSubmitting(false);
    requestHashRef.current = null;
  }, []);

  /**
   * 重置状态（用于表单重置等场景）
   */
  const reset = useCallback(() => {
    cancel();
    requestHashRef.current = null;
  }, [cancel]);

  return {
    isSubmitting,
    submit,
    cancel,
    reset
  };
}
