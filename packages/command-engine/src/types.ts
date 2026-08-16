import type { Deck } from '@jkinco/scene-schema';

export type CommandActor = 'user' | 'ai' | 'system';

export interface SerializedCommand {
  id: string;
  kind: string;
  label: string;
  actor: CommandActor;
  aiNote?: string;
  payload: unknown;
}

/**
 * Every mutation of the document — by user, by AI, or by collaboration —
 * goes through a Command (§7.2, §38): validate → execute → inverse, plus
 * audit metadata. Immutability of the deck makes snapshot undo O(1).
 */
export interface Command {
  id: string;
  kind: string;
  label: string;
  actor: CommandActor;
  aiNote?: string;
  /** Validate against the deck this command would apply to. Returns an error message or null. */
  validate(deck: Deck): string | null;
  /** Apply the command; returns the new deck. Must not mutate the input. */
  applyTo(deck: Deck): Deck;
  /** Compute the inverse command from the state before execution. */
  invertFrom(before: Deck, after: Deck): Command;
  serialize(): SerializedCommand;
}

export interface CommandOptions {
  id?: string;
  label?: string;
  actor?: CommandActor;
  aiNote?: string;
}
