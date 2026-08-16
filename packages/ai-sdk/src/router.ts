import { LocalRuleProvider } from './local';
import { OpenAIClient, type OpenAIClientOptions } from './openai';
import type { AIProvider, AiRequest, AiResponse, AITaskKind } from './types';

interface Registration {
  provider: AIProvider;
  tiers: Set<AITaskKind>;
  weight: number;
  label?: string;
}

const ALL_TIERS: AITaskKind[] = ['fast', 'reasoning', 'vision', 'image'];

export class ModelRouter {
  private registry = new Map<string, Registration>();

  register(provider: AIProvider, tiers: AITaskKind[], opts: { weight?: number; label?: string } = {}): void {
    this.registry.set(provider.id, {
      provider,
      tiers: new Set(tiers),
      weight: opts.weight ?? 1,
      label: opts.label,
    });
  }

  unregister(providerId: string): void {
    this.registry.delete(providerId);
  }

  /** Pick the highest-weight provider for `task`, honouring the fallback chain. */
  route(task: AITaskKind): AIProvider {
    const direct = this.pickForTier(task);
    if (direct) return direct;

    switch (task) {
      case 'reasoning': {
        const fast = this.pickForTier('fast');
        if (fast) return fast;
        break;
      }
      case 'vision':
      case 'image': {
        const reasoning = this.pickForTier('reasoning');
        if (reasoning) return reasoning;
        const fast = this.pickForTier('fast');
        if (fast) return fast;
        break;
      }
      case 'fast':
        break;
    }

    const any = this.firstAny();
    if (any) return any;
    throw new Error(`没有可用于任务 ${task} 的 provider`);
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    return this.route(request.task).complete(request);
  }

  providerCount(): number {
    return this.registry.size;
  }

  private pickForTier(task: AITaskKind): AIProvider | undefined {
    let best: Registration | undefined;
    for (const reg of this.registry.values()) {
      if (!reg.tiers.has(task)) continue;
      if (!best || reg.weight > best.weight) best = reg;
    }
    return best?.provider;
  }

  private firstAny(): AIProvider | undefined {
    for (const reg of this.registry.values()) return reg.provider;
    return undefined;
  }
}

/**
 * Default router: LocalRuleProvider covers all tiers (weight 1) as the offline
 * fallback; an OpenAIClient (weight 2) is preferred for reasoning/fast when
 * configured.
 */
export function createDefaultRouter(opts: { openai?: OpenAIClientOptions } = {}): ModelRouter {
  const router = new ModelRouter();
  router.register(new LocalRuleProvider(), ALL_TIERS, { weight: 1, label: 'local-rules' });
  if (opts.openai) {
    router.register(new OpenAIClient(opts.openai), ['reasoning', 'fast'], {
      weight: 2,
      label: 'openai',
    });
  }
  return router;
}
