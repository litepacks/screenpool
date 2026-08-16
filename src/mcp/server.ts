import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ScreenPool } from '../ScreenPool.js';
import { resolveMcpConfig, type ScreenpoolMcpConfig } from './config.js';
import { McpLogger } from './logger.js';
import { registerMcpTools } from './tools.js';
import { VERSION } from '../version.js';

export interface ScreenpoolMcpServerOptions {
  config?: Partial<ScreenpoolMcpConfig>;
  configFilePath?: string;
  screenPool?: ScreenPool;
}

export class ScreenpoolMcpServer {
  private readonly config: ScreenpoolMcpConfig & ReturnType<typeof resolveMcpConfig>;
  private readonly logger: McpLogger;
  private readonly mcpServer: McpServer;
  private pool: ScreenPool;
  private isOwnPool = false;
  private isStarted = false;
  private isClosing = false;
  private transport: StdioServerTransport | null = null;
  private removeSignalListeners?: () => void;
  private poolStartPromise: Promise<void> | null = null;

  constructor(options: ScreenpoolMcpServerOptions = {}) {
    this.config = resolveMcpConfig(options.config, options.configFilePath);
    this.logger = new McpLogger(this.config.logLevel);

    if (options.screenPool) {
      this.pool = options.screenPool;
      this.isOwnPool = false;
    } else {
      this.pool = new ScreenPool({
        browser: this.config.browser as any,
        executablePath: this.config.executablePath,
        poolSize: this.config.poolSize,
        maxQueueSize: this.config.maxQueueSize,
        jobTimeout: this.config.timeout,
        outputDir: this.config.artifactsDir,
        allowLocalhost: this.config.security.allowPrivateNetwork,
        allowPrivateNetworks: this.config.security.allowPrivateNetwork,
        shared: this.config.shared !== false,
        idleTimeout: this.config.idleTimeout,
      });
      this.isOwnPool = true;
    }

    this.mcpServer = new McpServer({
      name: 'screenpool',
      version: VERSION,
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

  /** Initialize ScreenPool (if owned) and register MCP tools. */
  async init(): Promise<void> {
    if (this.isStarted) return;
    registerMcpTools(this.mcpServer, this.pool, this.config, this.logger, () => this.ensurePoolStarted());
    this.isStarted = true;
  }

  /** Connect stdio transport and start serving MCP requests. */
  async startStdio(): Promise<void> {
    await this.init();

    this.logger.info('Starting Screenpool MCP Server via Stdio transport...');
    this.transport = new StdioServerTransport();

    this.setupSignalHandlers();

    await this.mcpServer.connect(this.transport);
    this.logger.info('Screenpool MCP Server is ready and listening on stdio.');
    // Pool is started lazily on the first tool invocation to conserve CPU/RAM.
  }

  /** Graceful shutdown. Safely closes server and browser pool. */
  async close(): Promise<void> {
    if (this.isClosing) return;
    this.isClosing = true;

    this.logger.info('Shutting down Screenpool MCP Server...');

    if (this.removeSignalListeners) {
      this.removeSignalListeners();
      this.removeSignalListeners = undefined;
    }

    try {
      await this.mcpServer.close();
    } catch (err: any) {
      this.logger.debug(`Error closing MCP server: ${err?.message || err}`);
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

  get poolInstance(): ScreenPool {
    return this.pool;
  }

  get currentConfig(): ScreenpoolMcpConfig {
    return this.config;
  }
}

/** Programmatic factory function. */
export async function createScreenpoolMcpServer(
  options: ScreenpoolMcpServerOptions = {},
): Promise<ScreenpoolMcpServer> {
  const server = new ScreenpoolMcpServer(options);
  await server.init();
  return server;
}
