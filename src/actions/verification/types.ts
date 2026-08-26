import type { Target } from '../targets/types.js';

export type VerificationCondition =
  | { type: 'url'; matches: string; timeoutMs?: number }
  | { type: 'title'; matches: string; timeoutMs?: number }
  | { type: 'element-visible'; target: Target; timeoutMs?: number }
  | { type: 'element-hidden'; target: Target; timeoutMs?: number }
  | { type: 'text-present'; text: string; timeoutMs?: number };

export interface VerificationResult {
  condition: VerificationCondition;
  success: boolean;
  message?: string;
}
