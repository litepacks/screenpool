import type { ElementHandle } from 'puppeteer-core';

export interface ElementIdTarget {
  by: 'element-id';
  value: string;
  observationId: string;
}

export interface RoleTarget {
  by: 'role';
  role:
    | 'button'
    | 'link'
    | 'textbox'
    | 'checkbox'
    | 'radio'
    | 'combobox'
    | 'option'
    | 'menuitem'
    | 'tab';
  name?: string;
  exact?: boolean;
}

export interface LabelTarget {
  by: 'label';
  value: string;
  exact?: boolean;
}

export interface TextTarget {
  by: 'text';
  value: string;
  exact?: boolean;
}

export interface TestIdTarget {
  by: 'test-id';
  value: string;
}

export interface CssTarget {
  by: 'css';
  value: string;
}

export interface PointTarget {
  by: 'point';
  x: number;
  y: number;
}

export type Target =
  | ElementIdTarget
  | RoleTarget
  | LabelTarget
  | TextTarget
  | TestIdTarget
  | CssTarget
  | PointTarget;

export type FocusableTarget = Target;
export type EditableTarget = Target;
export type ClickTarget = Target;

export interface TargetCandidate {
  tag: string;
  role?: string;
  text?: string;
  label?: string;
  id?: string;
}

export interface ResolvedTarget {
  target: Target;
  elementId?: string;
  elementHandle?: ElementHandle;
  point?: { x: number; y: number };
  matchCount: number;
}
