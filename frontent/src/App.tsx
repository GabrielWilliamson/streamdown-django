import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';

type Role = 'user' | 'assistant';

type Message = {
  id: string;
  role: Role;
  content: string;
};

function parseSseLine(
  line: string,
  onDelta: (delta: string) => void,
  onError: (message: string) => void,
) {
  if (!line.startsWith('data: ')) return;

  const data = line.slice(6).trim();
  if (data === '[DONE]') return;

  try {
    const payload = JSON.parse(data) as { delta?: string; error?: string };
    if (payload.error) {
      onError(payload.error);
      return;
    }
    if (payload.delta) {
      onDelta(payload.delta);
    }
  } catch {
    // ignore malformed chunks
  }
}

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1 px-0.5">
      <span className="typing-dot size-1.5 rounded-full bg-zinc-400" />
      <span className="typing-dot size-1.5 rounded-full bg-zinc-400" />
      <span className="typing-dot size-1.5 rounded-full bg-zinc-400" />
    </span>
  );
}

function AssistantAvatar() {
  return (
    <div
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-semibold text-white shadow-lg shadow-violet-900/30"
      aria-hidden
    >
      AI
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };
    const assistantId = crypto.randomUUID();

    setInput('');
    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', content: '' },
    ]);

    try {
      const response = await fetch('/api/chat/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(
          (errBody as { error?: string } | null)?.error ??
            `Request failed (${response.status})`,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      const applySseLine = (line: string) => {
        parseSseLine(
          line,
          (delta) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + delta }
                  : message,
              ),
            );
          },
          (errorMessage) => {
            throw new Error(errorMessage);
          },
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            applySseLine(line);
          }
        }
        if (done) {
          if (buffer.trim()) {
            applySseLine(buffer);
          }
          break;
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Something went wrong';
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantId ? { ...item, content: `**Error:** ${message}` } : item,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  const lastMessage = messages.at(-1);
  const isStreamingAssistant =
    isLoading && lastMessage?.role === 'assistant' && !lastMessage.content;

  return (
    <div className="flex h-full min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="shrink-0 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-900/25">
            <svg
              className="size-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-50">Chat</h1>
            <p className="text-xs text-zinc-500">Respuestas en streaming con markdown</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 shadow-xl shadow-black/20">
                <p className="text-lg font-medium text-zinc-200">¿En qué puedo ayudarte?</p>
                <p className="mt-2 max-w-sm text-sm text-zinc-500">
                  Escribe un mensaje abajo. Las respuestas del asistente se renderizan con
                  markdown mientras llegan.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {['Explícame qué es Streamdown', 'Escribe un haiku sobre código'].map(
                  (suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={isLoading}
                      onClick={() => setInput(suggestion)}
                      className="rounded-full border border-zinc-700/80 bg-zinc-900/60 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800/80 hover:text-zinc-100 disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : (
            <ul className="space-y-6">
              {messages.map((message) => {
                const isUser = message.role === 'user';
                const isEmptyAssistant =
                  !isUser && !message.content && isLoading;
                const isError = !isUser && message.content.startsWith('**Error:**');

                return (
                  <li
                    key={message.id}
                    className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {!isUser && <AssistantAvatar />}

                    <div
                      className={`min-w-0 max-w-[85%] sm:max-w-[75%] ${
                        isUser ? 'items-end' : 'items-start'
                      } flex flex-col gap-1`}
                    >
                      <span
                        className={`px-1 text-[11px] font-medium uppercase tracking-wider ${
                          isUser ? 'text-right text-zinc-500' : 'text-zinc-500'
                        }`}
                      >
                        {isUser ? 'Tú' : 'Asistente'}
                      </span>

                      <div
                        className={
                          isUser
                            ? 'rounded-2xl rounded-tr-md bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-2.5 text-white shadow-lg shadow-indigo-950/40'
                            : `rounded-2xl rounded-tl-md border px-4 py-3 shadow-sm ${
                                isError
                                  ? 'border-red-900/50 bg-red-950/30 text-red-200'
                                  : 'border-zinc-800/80 bg-zinc-900/70 text-zinc-100'
                              }`
                        }
                      >
                        {isUser ? (
                          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                            {message.content}
                          </p>
                        ) : (
                          <div className="chat-markdown">
                            {isEmptyAssistant ? (
                              <TypingIndicator />
                            ) : (
                              <Streamdown
                                isAnimating={
                                  isLoading &&
                                  message.role === 'assistant' &&
                                  message.id === lastMessage?.id
                                }
                              >
                                {message.content}
                              </Streamdown>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div ref={scrollAnchorRef} className="h-px shrink-0" aria-hidden />
        </div>
      </main>

      <footer className="shrink-0 border-t border-zinc-800/80 bg-zinc-950/90 p-4 backdrop-blur-md">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-2 shadow-lg shadow-black/20 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/30"
        >
          <label htmlFor="chat-input" className="sr-only">
            Mensaje
          </label>
          <textarea
            id="chat-input"
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Escribe un mensaje…"
            disabled={isLoading}
            className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-zinc-100 placeholder:text-zinc-500 outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white transition hover:from-indigo-400 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={isLoading ? 'Enviando' : 'Enviar'}
          >
            {isLoading ? (
              <svg
                className="size-5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <svg
                className="size-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-zinc-600">
          Enter para enviar · Shift+Enter para nueva línea
          {isStreamingAssistant && (
            <span className="text-zinc-500"> · El asistente está escribiendo…</span>
          )}
        </p>
      </footer>
    </div>
  );
}
