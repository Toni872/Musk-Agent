// ONE outbound message per turn: the single lead-facing text a turn produces,
// composed from the reply and the qualification question when both exist.
//
// Reported from the demo: a single lead message produced TWO agent bubbles — the
// answer, then, immediately after, the qualification question. Callers (the UI
// view-model and the CLI simulator) pushed them on two separate lines. On a
// messaging channel that is what an assistant reads like: two consecutive
// outbound messages, the second of which the lead never asked for. It also
// duplicated the invitation, because the catalog answer already asked the lead to
// say what they wanted and the qualification question asked exactly that again.
//
// This module is the ONLY place that decides how the two pieces travel, so
// ui/chat.ts and src/simulator.ts cannot drift apart (same functional parity the
// rest of those two files already keep: banner, per-turn line, /state, reset).
//
// It changes nothing in the agent: MuskAgent.nextQualificationQuestion() still
// arms the ask exactly as before, so the lead's next message is still RECEIVED
// as the answer to that question. What changes is only how the outgoing text is
// rendered.

import type { QualificationQuestion } from './content';
import { guardReply } from './rules';

export interface OutboundTurn {
  // The ONE lead-facing message of the turn. Empty when the turn sends nothing:
  // a received answer with no reaction of its own and no question left.
  text: string;
  // True when the reply and the question travelled as ONE message. Operator/test
  // facing only; the lead just sees the text.
  merged: boolean;
}

// The lead receives ONE message per turn.
//
//   reply + question -> "<reply> <question>"   (the answer, then the ask)
//   reply only       -> the reply, untouched
//   question only    -> the question (the turn had no reply of its own)
//
// The question is APPENDED unless the reply already asks something: one question
// at a time, never two stacked. That is the same rule the engine already applies
// to the rule-5 doubt path, where awaitingDoubtAnswer defers the qualification
// question because the doubt reply itself asks the lead something — here the defer
// is a rendering decision, so the ask is armed either way and the lead's next
// message is still captured.
//
// A composition that would fail guardReply is NOT sent merged: both halves are
// individually guarded by the agent, but joining them is a new string, so it is
// re-checked (defense in depth, same spirit as the guard at the tail of
// runTurn). Falling back to the two-message behaviour is always safe, because
// then each piece keeps the verdict it already had.
export function composeTurnOutbound(
  reply: string,
  question: QualificationQuestion | null,
): OutboundTurn {
  if (question === null) return { text: reply, merged: false };
  const ask = question.text.trim();
  // The turn sends nothing of its own (a received answer with no reaction): the
  // question IS the agent's message for that turn.
  if (reply.trim() === '') return { text: ask, merged: false };
  // The reply already asks something: it keeps its own question and the ask
  // travels as its own message. Two questions in a row leave the lead unable to
  // answer either. Treat "?" at the end as "already asks something" even if
  // guard is satisfied - the test expects the reply to remain alone and the
  // armed question to go out separately.
  if (reply.trimEnd().includes('?')) return { text: reply, merged: false };
  const composed = `${reply.trimEnd()} ${ask}`;
  if (!guardReply(composed).ok) return { text: reply, merged: false };
  return { text: composed, merged: true };
}