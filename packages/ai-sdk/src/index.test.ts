import { describe, expect, it } from 'vitest';
import {
  AiError,
  createDefaultRouter,
  LocalRuleProvider,
  ModelRouter,
  OpenAIClient,
} from './index';
import type { AIProvider, AiRequest } from './index';

describe('LocalRuleProvider', () => {
  const local = new LocalRuleProvider();

  it('is deterministic for identical input', async () => {
    const request: AiRequest = { task: 'reasoning', prompt: '请生成故事线。第一页是背景。第二页是架构。' };
    const a = await local.complete(request);
    const b = await local.complete(request);
    const c = await local.complete(request);
    expect(a.text).toBe(b.text);
    expect(a.text).toBe(c.text);
  });

  it('classifies intent by keyword', async () => {
    const res = await local.complete({ task: 'fast', prompt: '请分类：对比 A 和 B' });
    expect(res.text).toBe('compare');
  });

  it('shortens by removing fillers and truncating', async () => {
    const res = await local.complete({ task: 'fast', prompt: '请缩短这个项目持续深入推进了积极有效的方案' });
    expect(res.text.length).toBeLessThanOrEqual(60);
    expect(res.text).not.toContain('了');
    expect(res.text).not.toContain('持续');
  });
});

describe('ModelRouter', () => {
  it('routes to highest weight and falls back reasoning -> fast', () => {
    const p1: AIProvider = {
      id: 'p1',
      complete: async () => ({ text: '', provider: 'p1', task: 'fast' }),
    };
    const p2: AIProvider = {
      id: 'p2',
      complete: async () => ({ text: '', provider: 'p2', task: 'fast' }),
    };

    const router = new ModelRouter();
    router.register(p1, ['fast'], { weight: 1 });
    router.register(p2, ['fast'], { weight: 2 });
    expect(router.route('fast').id).toBe('p2');
    expect(router.providerCount()).toBe(2);

    // reasoning falls back to fast when no reasoning provider is registered
    const fallback = new ModelRouter();
    fallback.register(p1, ['fast'], { weight: 1 });
    expect(fallback.route('reasoning').id).toBe('p1');
  });

  it('createDefaultRouter prefers openai for reasoning when configured', () => {
    const withOpenai = createDefaultRouter({ openai: { apiKey: 'k' } });
    expect(withOpenai.route('reasoning').id).toBe('openai');

    const localOnly = createDefaultRouter();
    expect(localOnly.route('reasoning').id).toBe('local-rule');
  });

  it('complete() returns the routed provider id', async () => {
    const router = createDefaultRouter();
    const res = await router.complete({ task: 'fast', prompt: 'hello' });
    expect(res.provider).toBe('local-rule');
  });
});

describe('OpenAIClient', () => {
  it('posts to /chat/completions with correct URL/headers/body and returns content', async () => {
    const captured: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '你好' } }] }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const client = new OpenAIClient({ apiKey: 'test-key', fetchImpl });
    const res = await client.complete({
      task: 'fast',
      system: 'sys',
      prompt: '你好',
      maxTokens: 10,
      temperature: 0.5,
    });

    expect(res.text).toBe('你好');
    expect(res.provider).toBe('openai');
    expect(res.task).toBe('fast');

    expect(captured.length).toBe(1);
    expect(captured[0]!.url).toBe('https://api.openai.com/v1/chat/completions');

    const headers = captured[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(captured[0]!.init.body as string) as Record<string, unknown>;
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.max_tokens).toBe(10);
    expect(body.temperature).toBe(0.5);
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: '你好' },
    ]);
  });

  it('throws AiError on non-ok responses', async () => {
    const fetchImpl = (async () =>
      ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    const client = new OpenAIClient({ apiKey: 'k', fetchImpl });
    await expect(client.complete({ task: 'fast', prompt: 'x' })).rejects.toBeInstanceOf(AiError);
  });
});
