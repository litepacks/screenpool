import { createMcpServer as createMcponceServer, type McpApp } from 'mcponce';
import { ScreenPool } from '../ScreenPool.js';
import { resolveMcpConfig, type ScreenpoolMcpConfig } from './config.js';
import { McpLogger } from './logger.js';
import { registerMcpTools, type ScreenpoolMcpContext } from './tools.js';
import { handleCapabilities } from './handlers.js';
import { VERSION } from '../version.js';

export interface ScreenpoolMcpServerOptions {
  config?: Partial<ScreenpoolMcpConfig>;
  configFilePath?: string;
  screenPool?: ScreenPool;
  host?: string;
  port?: number;
  coerceInputs?: boolean;
}

const SCREENPOOL_AGENT_GUIDE = `# Screenpool Agent Guide & Tool Reference

Screenpool is a high-performance Chromium browser pool and stateful automation manager for AI agents.

## 1. Action Targeting Specification (\`Target\` Syntax)
All interactive actions (\`click\`, \`fill\`, \`hover\`, etc.) require a \`target\` descriptor:
- \`{"by": "css", "value": "#submit-btn"}\` (Standard CSS selector)
- \`{"by": "text", "value": "Sign in"}\` (Visible text)
- \`{"by": "role", "role": "button", "name": "Save"}\` (ARIA role)
- \`{"by": "label", "value": "Username"}\` (Associated label)
- \`{"by": "test-id", "value": "login-submit"}\` (data-testid)
- \`{"by": "element-id", "value": "e_3"}\` (Interactive ID from observe)
- \`{"by": "point", "x": 350, "y": 420}\` (Viewport coordinates)

⚠️ Critical Rule: "by": "id" is NOT supported! Use CSS selector: {"by": "css", "value": "#my-id"}.

## 2. Core Actions
- **fill**: Automatically focuses element, updates React/Vue/Svelte form value trackers, dispatches bubbling change/input events.
- **click**: Click, double-click, right-click, popup handling with expect.page.
- **type & press**: Character typing and key presses (Enter, Escape, Tab, etc.).
- **wait**: Milliseconds duration or selector condition.
- **select**: Native HTML <select> dropdowns.
- **scroll**: Viewport coordinate and delta scrolling.

## 3. Stateful Multi-Step Workflows
1. \`screenpool_session_create\` -> Returns \`sessionId\`.
2. \`screenpool_observe\` -> Inspect page elements (\`e_1\`, \`e_2\`) and layout.
3. \`screenpool_act\` -> Execute sequential actions on session.
4. \`screenpool_session_close\` -> Clean up isolated session pages.
`;

export class ScreenpoolMcpServer {
  private readonly config: ScreenpoolMcpConfig & ReturnType<typeof resolveMcpConfig>;
  private readonly logger: McpLogger;
  private readonly mcpApp: McpApp<ScreenpoolMcpContext>;
  private pool: ScreenPool;
  private isOwnPool = false;
  private isStarted = false;
  private isClosing = false;
  private removeSignalListeners?: () => void;
  private poolStartPromise: Promise<void> | null = null;

  constructor(options: ScreenpoolMcpServerOptions = {}) {
    const opts = options || {};
    this.config = resolveMcpConfig(opts.config, opts.configFilePath);
    this.logger = new McpLogger(this.config.logLevel);

    if (opts.screenPool) {
      this.pool = opts.screenPool;
      this.isOwnPool = false;
    } else {
      this.pool = new ScreenPool({
        browser: this.config.browser as any,
        executablePath: this.config.executablePath,
        poolSize: this.config.poolSize,
        minWorkers: this.config.minWorkers,
        maxQueueSize: this.config.maxQueueSize,
        jobTimeout: this.config.timeout,
        outputDir: this.config.artifactsDir,
        allowLocalhost: this.config.security.allowPrivateNetwork,
        allowPrivateNetworks: this.config.security.allowPrivateNetwork,
        shared: this.config.shared !== false,
        idleTimeout: this.config.idleTimeout,
        userDataDir: this.config.userDataDir,
        stealth: this.config.stealth,
      });
      this.isOwnPool = true;
    }

    const ctx: ScreenpoolMcpContext = {
      pool: this.pool,
      config: this.config,
      logger: this.logger,
      ensureStarted: () => this.ensurePoolStarted(),
    };

    this.mcpApp = createMcponceServer<ScreenpoolMcpContext>({
      name: 'screenpool',
      version: VERSION,
      host: opts.host || '127.0.0.1',
      port: opts.port || 0,
      context: () => ctx,
      coerceInputs: opts.coerceInputs ?? true,
      toolTimeoutMs: this.config.timeout || 60000,
    });
  }

  async ensurePoolStarted(): Promise<void> {
    if (!this.isOwnPool) return;
    if (!this.poolStartPromise) {
      const start = Date.now();
      this.logger.info(`Initializing ScreenPool engine (poolSize=${this.config.poolSize}, shared=${this.config.shared !== false})...`);
      this.poolStartPromise = this.pool
        .start()
        .then(() => {
          this.logger.info(`ScreenPool engine ready in ${Date.now() - start}ms.`);
        })
        .catch((err) => {
          this.poolStartPromise = null;
          throw err;
        });
    }
    await this.poolStartPromise;
  }

  /** Initialize ScreenPool (if owned) and register MCP tools and resources. */
  async init(): Promise<void> {
    if (this.isStarted) return;
    registerMcpTools(this.mcpApp, this.pool, this.config, this.logger, () => this.ensurePoolStarted());
    this.registerResources();
    this.isStarted = true;
  }

  private registerResources(): void {
    this.mcpApp.resource({
      uri: 'screenpool://guide',
      name: 'Screenpool Agent Guide & Tool Reference',
      mimeType: 'text/markdown',
      description: 'Comprehensive guide for AI agents executing browser automation, targeting selectors, actions, DevTools, and state persistence with Screenpool.',
      handler: () => SCREENPOOL_AGENT_GUIDE,
    });

    this.mcpApp.resource({
      uri: 'screenpool://capabilities',
      name: 'Screenpool Capabilities & Features',
      mimeType: 'application/json',
      description: 'Supported features, formats, and available tool names for this Screenpool MCP server version.',
      handler: async () => {
        const caps = await handleCapabilities(this.config);
        return JSON.stringify(caps, null, 2);
      },
    });
  }

  /** Connect stdio transport and start serving MCP requests. */
  async startStdio(): Promise<void> {
    await this.init();
    this.logger.info('Starting Screenpool MCP Server via mcponce stdio bridge...');
    this.setupSignalHandlers();
    await this.mcpApp.run();
  }

  /** Run executable entrypoint (CLI commands or stdio bridge). */
  async run(): Promise<void> {
    await this.init();
    await this.mcpApp.run();
  }

  /** Start HTTP/SSE server programmatically. */
  async start(options?: any): Promise<any> {
    await this.init();
    return await this.mcpApp.start(options);
  }

  /** Stop server programmatically. */
  async stop(options?: any): Promise<void> {
    await this.mcpApp.stop(options);
  }

  /** Programmatic tool invocation. */
  async callTool(name: string, args: Record<string, any> = {}, options?: any): Promise<any> {
    await this.init();
    return await this.mcpApp.callTool(name, args, options);
  }

  /** Graceful shutdown. Safely closes mcponce server and browser pool. */
  async close(): Promise<void> {
    if (this.isClosing) return;
    this.isClosing = true;

    this.logger.info('Shutting down Screenpool MCP Server...');

    if (this.removeSignalListeners) {
      this.removeSignalListeners();
      this.removeSignalListeners = undefined;
    }

    try {
      await this.mcpApp.stop();
    } catch (err: any) {
      this.logger.debug(`Error stopping mcponce server: ${err?.message || err}`);
    }

    if (this.isOwnPool) {
      try {
        await this.pool.stop();
        this.logger.info('ScreenPool engine stopped.');
      } catch (err: any) {
        this.logger.error(`Error stopping ScreenPool engine: ${err?.message || err}`);
      }
    }

    this.isStarted = false;
    this.logger.info('Shutdown complete.');
  }

  private setupSignalHandlers(): void {
    const handleShutdown = async (signal: string) => {
      this.logger.info(`Received signal ${signal}. Initiating graceful shutdown...`);
      await this.close();
      process.exit(0);
    };

    const sigintListener = () => { void handleShutdown('SIGINT'); };
    const sigtermListener = () => { void handleShutdown('SIGTERM'); };
    const sighupListener = () => { void handleShutdown('SIGHUP'); };
    const stdinEndListener = () => { void handleShutdown('STDIN_END'); };
    const stdinCloseListener = () => { void handleShutdown('STDIN_CLOSE'); };
    const uncaughtListener = (err: any) => {
      this.logger.error(`Uncaught exception: ${err?.stack || err?.message || err}`);
    };
    const unhandledRejectionListener = (reason: any) => {
      this.logger.error(`Unhandled rejection: ${reason?.stack || reason?.message || reason}`);
    };

    process.on('SIGINT', sigintListener);
    process.on('SIGTERM', sigtermListener);
    process.on('SIGHUP', sighupListener);
    process.stdin.on('end', stdinEndListener);
    process.stdin.on('close', stdinCloseListener);
    process.on('uncaughtException', uncaughtListener);
    process.on('unhandledRejection', unhandledRejectionListener);

    this.removeSignalListeners = () => {
      process.removeListener('SIGINT', sigintListener);
      process.removeListener('SIGTERM', sigtermListener);
      process.removeListener('SIGHUP', sighupListener);
      process.stdin.removeListener('end', stdinEndListener);
      process.stdin.removeListener('close', stdinCloseListener);
      process.removeListener('uncaughtException', uncaughtListener);
      process.removeListener('unhandledRejection', unhandledRejectionListener);
    };
  }

  get app(): McpApp<ScreenpoolMcpContext> {
    return this.mcpApp;
  }

  get poolInstance(): ScreenPool {
    return this.pool;
  }

  get currentConfig(): ScreenpoolMcpConfig {
    return this.config;
  }
}

/** Programmatic factory function. */
export async function createScreenpoolMcpServer(
  options?: ScreenpoolMcpServerOptions | null,
): Promise<ScreenpoolMcpServer> {
  const opts = options || {};
  const server = new ScreenpoolMcpServer(opts);
  await server.init();
  return server;
}
