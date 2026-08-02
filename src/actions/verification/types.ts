import type { Target } from '../targets/types.js';

export type VerificationCondition =
  | { type: 'url'; matches: string }
  | { type: 'title'; matches: string }
  | { type: 'element-visible'; target: Target }
  | { type: 'element-hidden'; target: Target }
  | { type: 'text-present'; text: string };

export interface VerificationResult {
  condition: VerificationCondition;
  success: boolean;
  message?: string;
}
