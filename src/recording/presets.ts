import type { RecordingOptions, RecordingPreset } from './types.js';

export function resolveRecordingOptions(options: RecordingOptions = {}): Required<RecordingOptions> {
  const preset: RecordingPreset = options.preset ?? 'actions';

  let defaults: Required<RecordingOptions>;

  switch (preset) {
    case 'actions':
      defaults = {
        name: options.name ?? '',
        preset: 'actions',
        events: true,
        actions: true,
        pages: true,
        observations: false,
        console: false,
        pageErrors: false,
        network: 'off',
        screenshots: 'off',
        html: 'off',
        video: false,
        visualSettleMs: 0,
        artifactsDir: options.artifactsDir ?? '.screenpool/recordings',
        maxEvents: 5_000,
        maxScreenshots: 50,
        maxHtmlSnapshots: 50,
        redact: {
          headers: ['authorization', 'cookie', 'set-cookie', 'x-api-key'],
          queryParams: ['token', 'key', 'auth', 'secret', 'password'],
          jsonKeys: ['password', 'token', 'secret', 'accessToken', 'refreshToken', 'cvv', 'creditCard'],
        },
      };
      break;

    case 'debug':
      defaults = {
        name: options.name ?? '',
        preset: 'debug',
        events: true,
        actions: true,
        pages: true,
        observations: true,
        console: true,
        pageErrors: true,
        network: 'failed-only',
        screenshots: 'on-error',
        html: 'on-error',
        video: false,
        visualSettleMs: 150,
        artifactsDir: options.artifactsDir ?? '.screenpool/recordings',
        maxEvents: 10_000,
        maxScreenshots: 100,
        maxHtmlSnapshots: 100,
        redact: {
          headers: ['authorization', 'cookie', 'set-cookie', 'x-api-key'],
          queryParams: ['token', 'key', 'auth', 'secret', 'password'],
          jsonKeys: ['password', 'token', 'secret', 'accessToken', 'refreshToken', 'cvv', 'creditCard'],
        },
      };
      break;

    case 'visual':
      defaults = {
        name: options.name ?? '',
        preset: 'visual',
        events: true,
        actions: true,
        pages: true,
        observations: true,
        console: false,
        pageErrors: false,
        network: 'off',
        screenshots: 'each-action',
        html: 'off',
        video: true,
        visualSettleMs: 150,
        artifactsDir: options.artifactsDir ?? '.screenpool/recordings',
        maxEvents: 5_000,
        maxScreenshots: 200,
        maxHtmlSnapshots: 20,
        redact: {
          headers: ['authorization', 'cookie', 'set-cookie', 'x-api-key'],
          queryParams: ['token', 'key', 'auth', 'secret', 'password'],
          jsonKeys: ['password', 'token', 'secret', 'accessToken', 'refreshToken', 'cvv', 'creditCard'],
        },
      };
      break;

    case 'full':
      defaults = {
        name: options.name ?? '',
        preset: 'full',
        events: true,
        actions: true,
        pages: true,
        observations: true,
        console: true,
        pageErrors: true,
        network: 'all',
        screenshots: 'each-action',
        html: 'each-action',
        video: true,
        visualSettleMs: 150,
        artifactsDir: options.artifactsDir ?? '.screenpool/recordings',
        maxEvents: 50_000,
        maxScreenshots: 500,
        maxHtmlSnapshots: 500,
        redact: {
          headers: ['authorization', 'cookie', 'set-cookie', 'x-api-key'],
          queryParams: ['token', 'key', 'auth', 'secret', 'password'],
          jsonKeys: ['password', 'token', 'secret', 'accessToken', 'refreshToken', 'cvv', 'creditCard'],
        },
      };
      break;
  }

  const isVideoEnabled = options.video ?? defaults.video;
  const defaultSettle = isVideoEnabled ? 150 : defaults.visualSettleMs;

  // Explicit option overrides
  return {
    name: options.name ?? defaults.name,
    preset: options.preset ?? defaults.preset,
    events: options.events ?? defaults.events,
    actions: options.actions ?? defaults.actions,
    pages: options.pages ?? defaults.pages,
    observations: options.observations ?? defaults.observations,
    console: options.console ?? defaults.console,
    pageErrors: options.pageErrors ?? defaults.pageErrors,
    network: options.network ?? defaults.network,
    screenshots: options.screenshots ?? defaults.screenshots,
    html: options.html ?? defaults.html,
    video: options.video ?? defaults.video,
    visualSettleMs: options.visualSettleMs ?? defaultSettle,
    artifactsDir: options.artifactsDir ?? defaults.artifactsDir,
    maxEvents: options.maxEvents ?? defaults.maxEvents,
    maxScreenshots: options.maxScreenshots ?? defaults.maxScreenshots,
    maxHtmlSnapshots: options.maxHtmlSnapshots ?? defaults.maxHtmlSnapshots,
    redact: {
      headers: Array.from(new Set([...(defaults.redact.headers ?? []), ...(options.redact?.headers ?? [])])),
      queryParams: Array.from(new Set([...(defaults.redact.queryParams ?? []), ...(options.redact?.queryParams ?? [])])),
      jsonKeys: Array.from(new Set([...(defaults.redact.jsonKeys ?? []), ...(options.redact?.jsonKeys ?? [])])),
    },
  };
}
