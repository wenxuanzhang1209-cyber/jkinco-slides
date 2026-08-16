import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button, Progress, toast } from '@jkinco/design-system';
import { GenerationPipeline, askClarifyingQuestions, type GenerationEvent, type Storyboard } from '@jkinco/ai-planner';
import { getEngine } from '../state/appState';
import { StoryboardView } from './StoryboardView';
import type { HomePageProps } from './HomePage';

export interface GenerationFlowProps {
  prompt: string;
  onBack: () => void;
  onEnterEditor: () => void;
}

interface Answers {
  [key: string]: string;
}

/**
 * §26 new-deck flow: prompt → (max 2–3 clarifying questions) → storyboard
 * → progressive build with §8.3 stage UX ("Designing 6/12").
 */
export const GenerationFlow = memo(function GenerationFlow({ prompt, onBack, onEnterEditor }: GenerationFlowProps) {
  const engine = getEngine();
  const [phase, setPhase] = useState<'questions' | 'building' | 'storyboard'>('building');
  const [answers, setAnswers] = useState<Answers>({});
  const [stage, setStage] = useState<{ name: string; message: string; done: boolean }[]>([]);
  const [designProgress, setDesignProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [checkProgress, setCheckProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [questions] = useState(() => askClarifyingQuestions(prompt));
  const cancelRef = useRef(false);

  useEffect(() => {
    if (questions.length === 0) {
      setPhase('building');
      void build();
    } else {
      setPhase('questions');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const build = useCallback(async () => {
    cancelRef.current = false;
    setPhase('building');
    setStoryboard(null);
    setStage([]);
    // Fold clarifying answers back into the prompt (audience/duration are
    // parsed by the planner from plain text).
    const augmented = [prompt, answers.audience ? `听众：${answers.audience}` : '', answers.duration ? `时长：${answers.duration}` : '']
      .filter(Boolean)
      .join('。');
    const pipeline = new GenerationPipeline({});
    try {
      for await (const event of pipeline.run(augmented)) {
        if (event.type === 'storyboard') {
          // §26.4: pause for user confirmation before generating visuals.
          setStoryboard(event.storyboard);
          setPhase('storyboard');
          pipeline.cancel();
          return;
        }
        handleEvent(event);
      }
    } catch (err) {
      toast('生成失败', { description: String((err as Error)?.message ?? err), tone: 'danger' });
      setPhase('storyboard');
    }
  }, [prompt, answers]);

  const handleEvent = (event: GenerationEvent) => {
    switch (event.type) {
      case 'stage':
        setStage((s) => [...s, { name: event.stage, message: event.message, done: false }]);
        break;
      case 'storyboard':
        setStoryboard(event.storyboard);
        break;
      case 'slideReady':
        setDesignProgress({ done: event.index + 1, total: event.total });
        break;
      case 'qaResult':
        setCheckProgress({ done: event.index + 1, total: event.total });
        break;
      case 'done': {
        // Install the generated deck into the engine.
        engine.executor.setDeck(event.deck);
        void engine.saveNow();
        const recent = [{ id: event.deck.id, title: event.deck.title, at: new Date().toISOString() }];
        localStorage.setItem('jkinco:recent', JSON.stringify(recent));
        onEnterEditor();
        break;
      }
    }
  };

  // ------------------------------------------- clarifying questions (§26.2)

  if (phase === 'questions') {
    return (
      <div data-testid="generation-questions" className="flex h-full items-center justify-center bg-[#F8FAFC]">
        <div className="w-[520px] max-w-[92vw] rounded-xl border border-[#E2E8F0] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">两个小问题，让结果更贴切</h2>
          <div className="mt-4 space-y-4">
            {questions.map((q) => (
              <div key={q.id}>
                <div className="text-[13px] font-medium text-[#475569]">{q.question}</div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {q.options.map((opt) => (
                    <button
                      key={opt}
                      data-testid={`question-${q.id}-${opt}`}
                      className={`rounded-md border px-3 py-1.5 text-[13px] ${answers[q.id] === opt ? 'border-[#1E56A0] bg-[#E8F0FA] text-[#1E56A0]' : 'border-[#CBD5E1] text-[#475569] hover:border-[#94A3B8]'}`}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onBack}>返回</Button>
            <Button data-testid="questions-confirm" disabled={Object.keys(answers).length < questions.length} onClick={() => { setPhase('building'); void build(); }}>
              开始生成
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------- building progress

  if (phase === 'building') {
    return (
      <div data-testid="generation-building" className="flex h-full items-center justify-center bg-[#F8FAFC]">
        <div className="w-[420px] max-w-[92vw]">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F0FA]">
              <Loader2 className="h-6 w-6 animate-spin text-[#1E56A0]" />
            </div>
            <h2 className="mt-3 text-lg font-semibold">Building your deck</h2>
            <p className="mt-1 text-xs text-[#94A3B8]">已生成的页面可立刻编辑，后台继续生成剩余页面（§8.3）</p>
          </div>
          <div className="mt-6 space-y-2" data-testid="generation-stages">
            <div className="flex items-center gap-2 text-[13px] text-[#475569]">
              <Check className="h-4 w-4 text-[#1F9D55]" /> Researching <span className="text-[11px] text-[#94A3B8]">✓</span>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[#475569]">
              <Check className="h-4 w-4 text-[#1F9D55]" /> Building story <span className="text-[11px] text-[#94A3B8]">✓</span>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[#475569]">
              {designProgress.done < designProgress.total ? <Loader2 className="h-4 w-4 animate-spin text-[#1E56A0]" /> : <Check className="h-4 w-4 text-[#1F9D55]" />}
              Designing {designProgress.done} / {designProgress.total || '…'}
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[#475569]">
              {checkProgress.done < checkProgress.total ? <Loader2 className="h-4 w-4 animate-spin text-[#1E56A0]" /> : <Check className="h-4 w-4 text-[#1F9D55]" />}
              Checking {checkProgress.done} / {checkProgress.total || '…'}
            </div>
          </div>
          <Progress className="mt-4" value={designProgress.total > 0 ? (designProgress.done / designProgress.total) * 100 : 5} />
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- storyboard

  if (phase === 'storyboard' && storyboard) {
    return (
      <StoryboardView
        storyboard={storyboard}
        onBack={onBack}
        onBuild={(board) => {
          setStoryboard(board);
          setPhase('building');
          void buildWithBoard(board);
        }}
      />
    );
  }

  return null;

  async function buildWithBoard(board: Storyboard) {
    cancelRef.current = false;
    setPhase('building');
    setStage([]);
    const pipeline = new GenerationPipeline({});
    try {
      for await (const event of pipeline.run(prompt, { storyboard: board })) {
        handleEvent(event);
      }
    } catch (err) {
      toast('生成失败', { description: String((err as Error)?.message ?? err), tone: 'danger' });
      setPhase('storyboard');
    }
  }
});
