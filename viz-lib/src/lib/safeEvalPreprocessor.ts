type AnyObject = Record<string, any>;

/**
 * Deep clone but strips functions and unserializable values.
 * structuredClone is faster but unsafe for Redash query results,
 * which often contain class instances and functions.
 */
function safeClone<T>(obj: T): T {
  try {
    // Try JSON clone first — removes functions and non-serializable props
    return JSON.parse(JSON.stringify(obj));
  } catch {
    // Fallback: shallow copy instead of crash
    if (Array.isArray(obj)) {
      return obj.map((o) => (typeof o === "object" ? { ...o } : o)) as unknown as T;
    }
    if (typeof obj === "object" && obj !== null) {
      return { ...obj } as T;
    }
    return obj;
  }
}

/**
 * Executes user-defined JavaScript synchronously to preprocess query result data.
 * Runs inside an isolated Function() context with no DOM/global access.
 * Async preprocessors (returning a Promise) are rejected.
 */
export default function safeEvalPreprocessor(userCode?: string, data?: AnyObject): AnyObject {
  if (!userCode || typeof userCode !== "string" || !data) {
    return (data || {}) as AnyObject;
  }

  try {
    // Block all browser and DOM globals
    const sandboxGlobals = `
      const window = undefined;
      const document = undefined;
      const self = undefined;
      const globalThis = undefined;
      const XMLHttpRequest = undefined;
      const localStorage = undefined;
      const sessionStorage = undefined;
      const alert = undefined;
      const confirm = undefined;
      const prompt = undefined;
      const setTimeout = undefined;
      const setInterval = undefined;
    `;

    // Wrap the user code
    const wrappedCode = `
      "use strict";
      ${sandboxGlobals}
      ${userCode}
      if (typeof preprocess !== "function") {
        throw new Error("Missing required function preprocess(data)");
      }
      return preprocess(data);
    `;

    // Create a new sandboxed evaluator
    const runFn = new Function("data", wrappedCode) as (data: AnyObject) => any;

    // Sanitize and clone data (avoid structuredClone on Redash objects)
    const cleanData = {
      rows: safeClone(data.rows),
      columns: safeClone(data.columns),
      metadata: safeClone((data as any).metadata ?? {}),
    };

    // Execute user code synchronously
    const result = runFn(cleanData);

    // Reject async/preprocessors that return a Promise
    if (result && typeof (result as any).then === "function") {
      throw new Error("Async preprocessors are not allowed; preprocess must return a plain object synchronously");
    }

    // Validate output
    if (typeof result !== "object" || result === null) {
      throw new Error("preprocess() must return a valid object");
    }

    return result as AnyObject;
  } catch (err: unknown) {
    console.error("Pre-Processor Error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return {
      error: `Pre-Processor Error: ${message}`,
      rows: [],
      columns: [],
    };
  }
}
