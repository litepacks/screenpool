import type {
  ActRequest,
  Action,
  ActionRunResult,
  ActionStepResult,
  ClickAction,
  FillAction,
  PageActivateAction,
  PageCloseAction,
  PageWaitAction,
  PressAction,
  ScreenshotAction,
  ScrollAction,
  SelectAction,
  WaitAction,
} from './types.js';
import type { PageRegistry } from '../pages/registry.js';
import type { PagePolicy, ManagedPage } from '../pages/types.js';
import type { ActionPolicy } from './policy/types.js';
import type { SessionEventBus } from '../sessions/event-bus.js';
import type { ObservationStore } from '../observations/store.js';
import { actionSchema } from './schemas.js';
import { validateActionPolicy } from './policy/validate.js';
import { resolveTarget } from './targets/resolver.js';
import { verifyConditions } from './verification/verify.js';
import { ActionError } from './errors.js';
import { createJobId } from '../utils/uuid.js';
import { handleClick } from './handlers/click.js';
import { handleFill } from './handlers/fill.js';
import { handlePress } from './handlers/press.js';
import { handleSelect } from './handlers/select.js';
import { handleScroll } from './handlers/scroll.js';
import { handleWait } from './handlers/wait.js';
import { handleScreenshot } from './handlers/screenshot.js';
import { handlePageActivate } from './handlers/page-activate.js';
import { handlePageClose } from './handlers/page-close.js';
import { handlePageWait } from './handlers/page-wait.js';
import { toPageSummary } from '../pages/types.js';

export class ActionOrchestrator {
  constructor(
    private readonly sessionId: string,
    private readonly registry: PageRegistry,
    private readonly observationStore: ObservationStore,
    private readonly pagePolicy: PagePolicy,
    private readonly actionPolicy: ActionPolicy,
    private readonly eventBus: SessionEventBus,
  ) {}

  async run(request: ActRequest): Promise<ActionRunResult> {
    const runId = `run_${createJobId()}`;
    const startTime = Date.now();

    const initialPage = this.registry.getActive() ?? this.registry.getMain();
    const steps: ActionStepResult[] = [];
    let isOverallSuccess = true;

    // Check max actions per run
    if (request.actions.length > this.actionPolicy.maxActionsPerRun) {
      throw new ActionError(
        'ACTION_LIMIT_EXCEEDED',
        `Action run length (${request.actions.length}) exceeds max limit (${this.actionPolicy.maxActionsPerRun}).`,
      );
    }

    // Validate observation if provided
    if (request.observationId) {
      const obs = this.observationStore.get(request.observationId);
      if (!obs) {
        throw new ActionError(
          'OBSERVATION_NOT_FOUND',
          `Observation ${request.observationId} was not found.`,
        );
      }
      if (obs.sessionId !== this.sessionId) {
        throw new ActionError(
          'OBSERVATION_PAGE_MISMATCH',
          `Observation belongs to session ${obs.sessionId}, expected ${this.sessionId}.`,
        );
      }
    }

    for (let i = 0; i < request.actions.length; i++) {
      const action = request.actions[i];
      if (!action) continue;

      const stepResult = await this.executeStep(i, action, request);
      steps.push(stepResult);

      if (stepResult.status === 'failed' || stepResult.status === 'verification-failed') {
        isOverallSuccess = false;
        if (action.onFailure !== 'continue') {
          // Fill remaining skipped steps
          for (let j = i + 1; j < request.actions.length; j++) {
            const skippedAction = request.actions[j];
            if (skippedAction) {
              steps.push({
                index: j,
                id: skippedAction.id ?? `act_${j + 1}`,
                type: skippedAction.type,
                status: 'skipped',
                startedAt: new Date().toISOString(),
                durationMs: 0,
              });
            }
          }
          break;
        }
      }
    }

    const finalActivePage = this.registry.getActive();

    const result: ActionRunResult = {
      id: runId,
      sessionId: this.sessionId,
      success: isOverallSuccess,
      startedAt: new Date(startTime).toISOString(),
      durationMs: Date.now() - startTime,
      initialPageId: initialPage?.id,
      finalActivePageId: finalActivePage?.id,
      pages: this.registry.list().map(toPageSummary),
      steps,
    };

    return result;
  }

  private async executeStep(
    index: number,
    action: Action,
    request: ActRequest,
  ): Promise<ActionStepResult> {
    const stepId = action.id ?? `act_${index + 1}`;
    const start = Date.now();

    this.eventBus.emit('action.started', {
      actionId: stepId,
      data: { actionType: action.type, index },
    });

    let page: ManagedPage | undefined;

    try {
      // 1. Schema Validation
      actionSchema.parse(action);

      // 2. Policy Validation
      validateActionPolicy(this.actionPolicy, action);

      // 3. Resolve Target Page
      const pageRef = action.page ?? request.defaultPage ?? { by: 'active' };
      page = this.registry.resolve(pageRef);
      if (!page) {
        throw new ActionError('PAGE_NOT_FOUND', 'Target page not found.');
      }

      if (page.state === 'closed') {
        throw new ActionError('PAGE_CLOSED', `Target page ${page.id} is closed.`);
      }

      // 4. Observation Validation against page
      if (request.observationId) {
        const obs = this.observationStore.get(request.observationId);
        if (obs && obs.pageId !== page.id) {
          throw new ActionError(
            'OBSERVATION_PAGE_MISMATCH',
            `Observation page ${obs.pageId} does not match target page ${page.id}.`,
          );
        }
      }

      // 5. Page Context Stabilization (if previous step triggered navigation)
      try {
        await page!.rawPage.evaluate(() => true).catch(async () => {
          await page!.rawPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5_000 }).catch(() => undefined);
        });
      } catch {
        // ignore
      }

      // 6. Target Resolution
      let resolvedTarget;
      if ('target' in action && action.target) {
        resolvedTarget = await resolveTarget(
          page.rawPage,
          action.target,
          this.actionPolicy.targets,
          this.observationStore,
        );

        this.eventBus.emit('target.resolved', {
          actionId: stepId,
          pageId: page.id,
          data: {
            elementId: resolvedTarget.elementId,
            matchCount: resolvedTarget.matchCount,
          },
        });
      }

      // 6. Execute Handler
      let handlerOutput: { openedPages?: unknown[]; closedPages?: unknown[]; buffer?: Buffer } = {};

      switch (action.type) {
        case 'click':
          handlerOutput = await handleClick({
            page,
            action: action as ClickAction,
            target: resolvedTarget,
            registry: this.registry,
            eventBus: this.eventBus,
          });
          break;
        case 'fill':
          await handleFill({
            page,
            action: action as FillAction,
            target: resolvedTarget,
          });
          break;
        case 'press':
          await handlePress({
            page,
            action: action as PressAction,
            target: resolvedTarget,
          });
          break;
        case 'select':
          await handleSelect({
            page,
            action: action as SelectAction,
            target: resolvedTarget,
          });
          break;
        case 'scroll':
          await handleScroll({
            page,
            action: action as ScrollAction,
            target: resolvedTarget,
          });
          break;
        case 'wait':
          await handleWait({
            page,
            action: action as WaitAction,
            policy: this.actionPolicy.targets,
            observationStore: this.observationStore,
          });
          break;
        case 'screenshot':
          handlerOutput = await handleScreenshot({
            page,
            action: action as ScreenshotAction,
          });
          break;
        case 'page.activate':
          await handlePageActivate({
            action: action as PageActivateAction,
            registry: this.registry,
          });
          break;
        case 'page.close':
          handlerOutput = await handlePageClose({
            action: action as PageCloseAction,
            currentPage: page,
            registry: this.registry,
          });
          break;
        case 'page.wait':
          await handlePageWait({
            action: action as PageWaitAction,
            registry: this.registry,
          });
          break;
      }

      this.eventBus.emit('action.executed', {
        actionId: stepId,
        pageId: page.id,
      });

      // 7. Verify Conditions
      let verificationResult;
      if (action.verify && action.verify.length > 0) {
        verificationResult = await verifyConditions(
          page,
          action.verify,
          this.actionPolicy.targets,
          this.observationStore,
        );

        this.eventBus.emit('verification.completed', {
          actionId: stepId,
          pageId: page.id,
          data: { success: verificationResult.success },
        });
      }

      const isSuccess = !verificationResult || verificationResult.success;
      const durationMs = Date.now() - start;

      const stepResult: ActionStepResult = {
        index,
        id: stepId,
        type: action.type,
        pageId: page.id,
        status: isSuccess ? 'success' : 'verification-failed',
        startedAt: new Date(start).toISOString(),
        durationMs,
        resolution: resolvedTarget
          ? { elementId: resolvedTarget.elementId, matchCount: resolvedTarget.matchCount }
          : undefined,
        openedPages: handlerOutput.openedPages
          ? (handlerOutput.openedPages as any[]).map(toPageSummary)
          : undefined,
        closedPages: handlerOutput.closedPages
          ? (handlerOutput.closedPages as any[]).map(toPageSummary)
          : undefined,
        verification: verificationResult,
      };

      this.eventBus.emit('action.completed', {
        actionId: stepId,
        pageId: page.id,
        data: { status: stepResult.status },
      });

      if (isSuccess && ['click', 'fill', 'press', 'select', 'scroll'].includes(action.type)) {
        const settleMs = (request as any)?.recording?.visualSettleMs ?? 150;
        if (settleMs > 0) {
          await new Promise((r) => setTimeout(r, settleMs));
        }
      }

      return stepResult;
    } catch (error) {
      const err = error instanceof ActionError
        ? error
        : new ActionError('INVALID_ACTION', error instanceof Error ? error.message : String(error));

      const durationMs = Date.now() - start;

      this.eventBus.emit('action.failed', {
        actionId: stepId,
        pageId: page?.id,
        data: { code: err.code, message: err.message },
      });

      return {
        index,
        id: stepId,
        type: action.type,
        status: 'failed',
        startedAt: new Date(start).toISOString(),
        durationMs,
        error: {
          code: err.code,
          message: err.message,
          retryable: err.retryable,
          suggestedAction: err.suggestedAction,
        },
      };
    }
  }
}
