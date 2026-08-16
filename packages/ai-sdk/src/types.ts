export type AITaskKind = 'fast' | 'reasoning' | 'vision' | 'image';

export interface AiRequest {
  task: AITaskKind;
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiResponse {
  text: string;
  provider: string;
  task: AITaskKind;
}

export interface AIProvider {
  id: string;
  complete(request: AiRequest): Promise<AiResponse>;
}
