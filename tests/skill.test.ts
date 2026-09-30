import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getSkillSourcePath,
  getSkillContent,
  resolveSkillTargets,
} from '../src/utils/skillManager.js';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

describe('Skill Manager Unit Tests', () => {
  it('locates local repository skills/screenpool/SKILL.md source path', () => {
    const p = getSkillSourcePath();
    expect(p).toBeDefined();
    expect(p.endsWith('SKILL.md')).toBe(true);
  });

  it('reads skill markdown content with frontmatter and sections', async () => {
    const content = await getSkillContent();
    expect(content).toContain('name: screenpool');
    expect(content).toContain('Screenpool: Definitive Runbook & Agent Skill Guide');
    expect(content).toContain('screenpool_pagespeed');
    expect(content).toContain('Core Web Vitals');
  });

  it('resolves targets for global install flag', () => {
    const targets = resolveSkillTargets({ global: true });
    expect(targets.length).toBe(1);
    expect(targets[0].name).toContain('Global');
    expect(targets[0].path).toBe(join(homedir(), '.gemini/config/skills/screenpool/SKILL.md'));
  });

  it('resolves targets for workspace install flag', () => {
    const targets = resolveSkillTargets({ workspace: true });
    expect(targets.length).toBe(1);
    expect(targets[0].name).toContain('Workspace');
    expect(targets[0].path).toBe(resolve(process.cwd(), '.agents/skills/screenpool/SKILL.md'));
  });

  it('resolves both workspace and global when no flags specified', () => {
    const targets = resolveSkillTargets({});
    expect(targets.length).toBe(2);
    expect(targets.some((t) => t.name.includes('Workspace'))).toBe(true);
    expect(targets.some((t) => t.name.includes('Global'))).toBe(true);
  });

  it('resolves all targets when all flag is passed', () => {
    const targets = resolveSkillTargets({ all: true });
    expect(targets.length).toBe(4);
    expect(targets.some((t) => t.name.includes('Workspace'))).toBe(true);
    expect(targets.some((t) => t.name.includes('Global'))).toBe(true);
    expect(targets.some((t) => t.name.includes('Cursor'))).toBe(true);
    expect(targets.some((t) => t.name.includes('Claude'))).toBe(true);
  });

  it('resolves custom target path if specified', () => {
    const targets = resolveSkillTargets({ target: '/tmp/custom-skill' });
    expect(targets.length).toBe(1);
    expect(targets[0].path).toBe('/tmp/custom-skill/skills/screenpool/SKILL.md');
  });
});
