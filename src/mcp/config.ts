import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LogLevel } from './logger.js';
import type { BrowserShorthand } from '../types.js';

export interface SecurityConfig {
  allowPrivateNetwork?: boolean;
  allowedDomains?: string[];
  deniedDomains?: string[];
}

export interface ArtifactsConfig {
  dir?: string;
  ttlMinutes?: number;
  cleanupOnExit?: boolean;
}

export interface McpConfigSection {
  enabledTools?: string[];
}

export interface ScreenpoolMcpConfig {
  configFilePath?: string;
  browser?: BrowserShorthand | string;
  executablePath?: string;
  poolSize?: number;
  maxQueueSize?: number;
  timeout?: number;
  headless?: boolean;
  artifactsDir?: string;
  logLevel?: LogLevel;
  security?: SecurityConfig;
  artifacts?: ArtifactsConfig;
  mcp?: McpConfigSection;
}

export const DEFAULT_MCP_CONFIG: Required<Omit<ScreenpoolMcpConfig, 'configFilePath' | 'browser' | 'executablePath'>> & {
  configFilePath?: string;
  browser: string;
  executablePath?: string;
} = {
  configFilePath: undefined,
  browser: 'chromium',
  executablePath: undefined,
  poolSize: 3,
  maxQueueSize: 100,
  timeout: 30_000,
  headless: true,
  artifactsDir: '.screenpool/artifacts',
  logLevel: 'info',
  security: {
    allowPrivateNetwork: false,
    allowedDomains: [],
    deniedDomains: [],
  },
  artifacts: {
    dir: '.screenpool/artifacts',
    ttlMinutes: 60,
    cleanupOnExit: false,
  },
  mcp: {
    enabledTools: [
      'screenpool_screenshot',
      'screenpool_pdf',
      'screenpool_html',
      'screenpool_metadata',
      'screenpool_health',
      'screenpool_capabilities',
    ],
  },
};

/**
 * Searches and parses config file if present.
 */
export function loadConfigFile(configPath?: string): Partial<ScreenpoolMcpConfig> {
  let targetFile: string | null = null;

  if (configPath) {
    const resolved = resolve(process.cwd(), configPath);
    if (existsSync(resolved)) {
      targetFile = resolved;
    }
  } else {
    const candidates = ['screenpool.config.json', '.screenpoolrc', '.screenpoolrc.json'];
    for (const cand of candidates) {
      const p = resolve(process.cwd(), cand);
      if (existsSync(p)) {
        targetFile = p;
        break;
      }
    }
  }

  if (!targetFile) return {};

  try {
    const raw = readFileSync(targetFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Resolve final configuration using: CLI args > Environment variables > Config file > Default values.
 */
export function resolveMcpConfig(
  cliOptions: Partial<ScreenpoolMcpConfig> = {},
  configFilePath?: string,
): ScreenpoolMcpConfig & typeof DEFAULT_MCP_CONFIG {
  const fileConfig = loadConfigFile(configFilePath || cliOptions.configFilePath as any);

  // Environment variable overrides
  const envBrowser = process.env.SCREENPOOL_BROWSER;
  const envPoolSize = process.env.SCREENPOOL_POOL_SIZE ? parseInt(process.env.SCREENPOOL_POOL_SIZE, 10) : undefined;
  const envTimeout = process.env.SCREENPOOL_TIMEOUT ? parseInt(process.env.SCREENPOOL_TIMEOUT, 10) : undefined;
  const envHeadless = process.env.SCREENPOOL_HEADLESS ? process.env.SCREENPOOL_HEADLESS === 'true' : undefined;
  const envArtifactsDir = process.env.SCREENPOOL_ARTIFACTS_DIR;
  const envAllowPrivate = process.env.SCREENPOOL_ALLOW_PRIVATE_NETWORK
    ? process.env.SCREENPOOL_ALLOW_PRIVATE_NETWORK === 'true'
    : undefined;
  const envLogLevel = process.env.SCREENPOOL_LOG_LEVEL as LogLevel | undefined;

  const resolvedBrowser = cliOptions.browser ?? envBrowser ?? fileConfig.browser ?? DEFAULT_MCP_CONFIG.browser;
  const resolvedExecutablePath = cliOptions.executablePath ?? fileConfig.executablePath ?? DEFAULT_MCP_CONFIG.executablePath;
  const resolvedPoolSize = cliOptions.poolSize ?? envPoolSize ?? fileConfig.poolSize ?? DEFAULT_MCP_CONFIG.poolSize;
  const resolvedMaxQueueSize = cliOptions.maxQueueSize ?? fileConfig.maxQueueSize ?? DEFAULT_MCP_CONFIG.maxQueueSize;
  const resolvedTimeout = cliOptions.timeout ?? envTimeout ?? fileConfig.timeout ?? DEFAULT_MCP_CONFIG.timeout;
  const resolvedHeadless = cliOptions.headless ?? envHeadless ?? fileConfig.headless ?? DEFAULT_MCP_CONFIG.headless;
  const resolvedArtifactsDir = cliOptions.artifactsDir ?? envArtifactsDir ?? fileConfig.artifactsDir ?? fileConfig.artifacts?.dir ?? DEFAULT_MCP_CONFIG.artifactsDir;
  const resolvedLogLevel = cliOptions.logLevel ?? envLogLevel ?? fileConfig.logLevel ?? DEFAULT_MCP_CONFIG.logLevel;

  const allowPrivateNetwork =
    cliOptions.security?.allowPrivateNetwork ??
    (cliOptions as any).allowPrivateNetwork ??
    envAllowPrivate ??
    fileConfig.security?.allowPrivateNetwork ??
    DEFAULT_MCP_CONFIG.security.allowPrivateNetwork;

  const allowedDomains = cliOptions.security?.allowedDomains ?? fileConfig.security?.allowedDomains ?? DEFAULT_MCP_CONFIG.security.allowedDomains;
  const deniedDomains = cliOptions.security?.deniedDomains ?? fileConfig.security?.deniedDomains ?? DEFAULT_MCP_CONFIG.security.deniedDomains;

  const enabledTools = fileConfig.mcp?.enabledTools ?? DEFAULT_MCP_CONFIG.mcp.enabledTools;

  return {
    browser: resolvedBrowser as any,
    executablePath: resolvedExecutablePath,
    poolSize: resolvedPoolSize,
    maxQueueSize: resolvedMaxQueueSize,
    timeout: resolvedTimeout,
    headless: resolvedHeadless,
    artifactsDir: resolvedArtifactsDir,
    logLevel: resolvedLogLevel,
    security: {
      allowPrivateNetwork,
      allowedDomains,
      deniedDomains,
    },
    artifacts: {
      dir: resolvedArtifactsDir,
      ttlMinutes: fileConfig.artifacts?.ttlMinutes ?? DEFAULT_MCP_CONFIG.artifacts.ttlMinutes,
      cleanupOnExit: fileConfig.artifacts?.cleanupOnExit ?? DEFAULT_MCP_CONFIG.artifacts.cleanupOnExit,
    },
    mcp: {
      enabledTools,
    },
  };
}
