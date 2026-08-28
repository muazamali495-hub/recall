"use client";

import { useEffect, useRef, useState } from "react";
import { askAction, type Turn } from "./actions";
import { Working } from "../working";
import { demath } from "@/lib/demath";

/**
 * Renders the model's markdown-ish reply without pulling in a parser.
 *
 * Free models emit **bold**, `code`, bullets and numbered lists and little
 * else, so handling those four covers nearly everything and keeps the page
 * light. Anything unrecognised falls through as plain text rather than
 * showing raw asterisks.
 */
function Rendered({ text }: { text: string }) {
  const inline = (s: string) =>
    s
      .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
      .filter(Boolean)
      .map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-ink">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[0.85em] text-mint">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      });

  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;

  // Fenced code blocks. Without this a worked example arrives with literal
  // ``` lines above and below it, which is what "explain eigenvalues" does
  // every time.
  let fenced: string[] | null = null;

  const flushCode = () => {
    if (fenced === null) return;
    const code = fenced.join("\n");
    fenced = null;
    if (!code.trim()) return;
    blocks.push(
      <pre
        key={blocks.length}
        className="overflow-x-auto rounded-lg border border-line bg-white/[0.04] p-3 font-mono text-[0.8rem] leading-relaxed text-ink"
      >
        <code>{code}</code>
      </pre>,
    );
  };

  const flush = () => {
    if (list.length === 0) return;
    const items = list.map((item, i) => (
      <li key={i} className="pl-1">
        {inline(item)}
      </li>
    ));
    blocks.push(
      ordered ? (
        <ol key={blocks.length} className="ml-5 flex list-decimal flex-col gap-1.5">
          {items}
        </ol>
      ) : (
        <ul key={blocks.length} className="ml-5 flex list-disc flex-col gap-1.5 marker:text-faint">
          {items}
        </ul>
      ),
    );
    list = [];
  };

  for (const raw of demath(text).split("\n")) {
    const line = raw.trimEnd();

    // A fence toggles code mode; everything between goes through untouched.
    if (/^\s*```/.test(line)) {
      if (fenced === null) {
        flush();
        fenced = [];
      } else {
        flushCode();
      }
      continue;
    }

    if (fenced !== null) {
      fenced.push(raw);
      continue;
    }

    // Models reach for headings and horizontal rules unprompted; without
    // these, replies show a literal "### " and "---" in the text.
    const heading = line.match(/^\s*#{1,4}\s+(.*)$/);
    const rule = /^\s*([-*_])\1{2,}\s*$/.test(line);

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);

    if (rule) {
      flush();
      blocks.push(<hr key={blocks.length} className="border-line" />);
    } else if (heading) {
      flush();
      blocks.push(
        <p key={blocks.length} className="text-sm font-semibold tracking-tight text-ink">
          {inline(heading[1])}
        </p>,
      );
    } else if (bullet) {
      if (ordered) flush();
      ordered = false;
      list.push(bullet[1]);
    } else if (numbered) {
      if (!ordered) flush();
      ordered = true;
      list.push(numbered[1]);
    } else if (line.trim() === "") {
      flush();
    } else {
      flush();
      blocks.push(
        <p key={blocks.length} className="leading-relaxed">
          {inline(line)}
        </p>,
      );
    }
  }
  flush();
  // An unterminated fence is common when a reply is cut short — show what
  // arrived rather than dropping it.
  flushCode();

  return <div className="flex flex-col gap-3 text-sm text-muted">{blocks}</div>;
}

const STARTERS = [
  "What should I focus on tonight?",
  "Explain the topic I have a quiz on next",
  "Make me 5 practice questions",
  "I have 2 hours free — what's the best use of it?",
];

export function AskChat({ hasContext }: { hasContext: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  async function send(text: string) {
    const asked = text.trim();
    if (!asked || pending) return;

    setError(null);
    setQuestion("");
    setPending(true);

    // Show the question straight away; the answer follows.
    const history = turns;
    setTurns([...history, { role: "user", content: asked }]);

    const result = await askAction(history, asked);

    if (result?.answer) {
      setTurns((prev) => [...prev, { role: "assistant", content: result.answer! }]);
    } else {
      setError(result?.error ?? "Could not get an answer.");
      // Put the question back so it isn't lost to a failed request.
      setTurns(history);
      setQuestion(asked);
    }

    setPending(false);
  }

  return (
    <div className="flex flex-col gap-5">
      {turns.length === 0 && !pending && (
        <div className="flex flex-col gap-2.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">Try asking</p>
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-xl border border-line bg-white/[0.02] px-4 py-3 text-left text-sm text-muted transition hover:border-mint/40 hover:bg-mint/[0.04] hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {turns.map((turn, i) =>
        turn.role === "user" ? (
          <div key={i} className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-mint/[0.12] px-4 py-2.5 text-sm font-medium text-ink ring-1 ring-inset ring-mint/20">
              {turn.content}
            </p>
          </div>
        ) : (
          <div
            key={i}
            className="rounded-2xl border border-line p-4"
            style={{ background: "linear-gradient(165deg, rgba(26,33,56,.7), rgba(16,20,34,.82))" }}
          >
            <Rendered text={turn.content} />
          </div>
        ),
      )}

      {pending && (
        <Working
          stages={[
            "Reading your deadlines and timetable…",
            "Working out the answer…",
            "Still going — free models queue behind other students.",
          ]}
        />
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-amber/25 bg-amber/5 p-3 text-sm text-amber">
          {error}
        </p>
      )}

      <div ref={endRef} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(question);
        }}
        className="sticky bottom-4 flex items-end gap-2 rounded-2xl border border-line-2 bg-surface p-2 shadow-[0_20px_50px_-30px_rgba(0,0,0,.9)] backdrop-blur"
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(question);
            }
          }}
          rows={1}
          placeholder={hasContext ? "Ask anything about your courses…" : "Ask anything…"}
          className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={pending || !question.trim()}
          aria-label="Send"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-mint text-[#04231d] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4 16L16 10L4 4v5l7 1-7 1z" fill="currentColor" />
          </svg>
        </button>
      </form>

      {turns.length > 0 && (
        <button
          onClick={() => {
            setTurns([]);
            setError(null);
          }}
          className="self-center text-xs text-faint transition hover:text-mint"
        >
          Start a new conversation
        </button>
      )}
    </div>
  );
}
