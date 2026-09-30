import { describe, it, expect, afterAll } from 'vitest';
import { ScreenpoolMcpServer, createScreenpoolMcpServer } from '../src/mcp/index.js';

describe('mcponce MCP Server integration', () => {
  let server: ScreenpoolMcpServer;

  it('initializes mcponce server and exposes all 21 screenpool tools', async () => {
    server = await createScreenpoolMcpServer();
    expect(server.app).toBeDefined();

    const tools = server.app.toolRegistry.getAll();
    expect(tools.length).toBe(21);

    // Verify key tool names
    expect(server.app.toolRegistry.has('screenpool_screenshot')).toBe(true);
    expect(server.app.toolRegistry.has('screenpool_pdf')).toBe(true);
    expect(server.app.toolRegistry.has('screenpool_html')).toBe(true);
    expect(server.app.toolRegistry.has('screenpool_session_create')).toBe(true);
    expect(server.app.toolRegistry.has('screenpool_act')).toBe(true);
    expect(server.app.toolRegistry.has('screenpool_observe')).toBe(true);
    expect(server.app.toolRegistry.has('screenpool_run')).toBe(true);
    expect(server.app.toolRegistry.has('screenpool_cdp_send')).toBe(true);
    expect(server.app.toolRegistry.has('screenpool_mode_switch')).toBe(true);
    expect(server.app.toolRegistry.has('screenpool_state_export')).toBe(true);
    expect(server.app.toolRegistry.has('screenpool_state_import')).toBe(true);
    expect(server.app.toolRegistry.has('screenpool_pagespeed')).toBe(true);
  });

  it('exposes screenpool resources via mcponce', async () => {
    const resources = server.app.resourceRegistry.getAll();
    expect(resources.length).toBeGreaterThanOrEqual(2);
    expect(server.app.resourceRegistry.get('screenpool://guide')).toBeDefined();
    expect(server.app.resourceRegistry.get('screenpool://capabilities')).toBeDefined();

    const guide = await server.app.readResource('screenpool://guide');
    expect(guide.contents[0].text).toContain('Screenpool');
  });

  it('calls tool via mcponce dispatch with validation error on missing required args', async () => {
    await expect(server.callTool('screenpool_screenshot', {})).rejects.toThrow(
      /Validation failed for tool "screenpool_screenshot"/,
    );
  });

  it('successfully invokes capabilities tool without parameters', async () => {
    const result = await server.callTool('screenpool_capabilities', {});
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tools).toBeDefined();
    expect(parsed.tools.length).toBe(21);
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });
});
