"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_ACTION_TIMEOUT_MS,
  DEFAULT_STUCK_LOADING_MS,
  getErrorMessage,
  withTimeout,
} from "@/lib/safe-async";

type RunOptions = {
  timeoutMs?: number;
  stuckLoadingMs?: number;
  onError?: (message: string) => void;
};

export function useSafeAsync(defaultOptions?: RunOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const run = useCallback(
    async <T>(fn: () => Promise<T>, options?: RunOptions): Promise<T | null> => {
      const merged = { ...defaultOptions, ...options };
      const runId = ++runIdRef.current;
      const timeoutMs = merged.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;
      const stuckLoadingMs = merged.stuckLoadingMs ?? DEFAULT_STUCK_LOADING_MS;

      setLoading(true);
      setError(null);

      const stuckTimer = setTimeout(() => {
        if (runIdRef.current !== runId) return;
        setLoading(false);
        const message = "This action is taking longer than expected. Please try again.";
        setError(message);
        merged.onError?.(message);
      }, stuckLoadingMs);

      try {
        const value = await withTimeout(fn(), timeoutMs);
        if (runIdRef.current !== runId) return null;
        return value;
      } catch (unknownError) {
        if (runIdRef.current !== runId) return null;
        const message = getErrorMessage(unknownError);
        setError(message);
        merged.onError?.(message);
        return null;
      } finally {
        clearTimeout(stuckTimer);
        if (runIdRef.current === runId) {
          setLoading(false);
        }
      }
    },
    [defaultOptions]
  );

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
    };
  }, []);

  return { loading, error, run, clearError, setError };
}
