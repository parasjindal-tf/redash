import { useState, useEffect } from "react";
import safeEvalPreprocessor from "@/lib/safeEvalPreprocessor";

/**
 * Executes Redash visualization preprocessor (if defined) and returns processed data.
 * Handles async preprocessors, safe sandbox execution, and graceful error fallback.
 */
export function useProcessedData<T extends Record<string, any>>(
  data: T,
  preCode?: string
): { processedData: T; isLoading: boolean } {
  const [processedData, setProcessedData] = useState<T>(data);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function runPreprocessor() {
      if (!data) return;
      setIsLoading(true);

      try {
        if (preCode && typeof preCode === "string" && preCode.trim()) {
          const result = await safeEvalPreprocessor(preCode, data);
          if (!cancelled) setProcessedData(result as T);
        } else if (!cancelled) {
          setProcessedData(data);
        }
      } catch (err: any) {
        console.error("Preprocessor execution failed:", err);
        if (!cancelled) {
          setProcessedData({
            error: `Preprocessor Error: ${err.message || String(err)}`,
            rows: [],
            columns: [],
          } as unknown as T);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    runPreprocessor();
    return () => {
      cancelled = true;
    };
  }, [data, preCode]);

  return { processedData, isLoading };
}
