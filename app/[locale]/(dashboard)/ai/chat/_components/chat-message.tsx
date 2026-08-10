import { cn } from "@/services/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { User, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatChart, isChartLanguage } from "./chat-chart";

interface ChatMessageProps {
  role: "user" | "assistant" | "system" | "function";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex w-full gap-3 p-4",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <Avatar className={cn("h-8 w-8", isUser ? "bg-primary" : "bg-muted")}>
        {isUser ? (
          <AvatarFallback className="bg-primary text-primary-foreground">
            <User className="h-4 w-4" />
          </AvatarFallback>
        ) : (
          <AvatarFallback className="bg-muted-foreground/10 text-primary">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        )}
      </Avatar>
      <Card
        className={cn(
          "max-w-[80%] px-4 py-3 text-sm transition-all duration-200",
          isUser
            ? "bg-primary text-primary-foreground shadow-md"
            : "bg-muted/50 text-foreground shadow-sm border-muted-foreground/10 hover:bg-muted/70",
          // Charts need more width for readability
          !isUser && "min-w-0 sm:max-w-[min(100%,42rem)]",
        )}
      >
        <div
          className={cn(
            "prose prose-sm dark:prose-invert break-words max-w-none",
            "prose-p:leading-relaxed prose-pre:p-0",
            isUser &&
              "text-primary-foreground prose-headings:text-primary-foreground prose-p:text-primary-foreground prose-strong:text-primary-foreground prose-code:text-primary-foreground prose-a:text-primary-foreground prose-ul:text-primary-foreground prose-ol:text-primary-foreground",
          )}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-xl font-bold mb-4 mt-2">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-lg font-bold mb-3 mt-2">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-base font-bold mb-2 mt-1">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>
              ),
              li: ({ children }) => <li className="mb-1">{children}</li>,
              a: ({ children, href }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "font-medium underline underline-offset-4 transition-colors hover:opacity-80",
                    isUser
                      ? "text-primary-foreground decoration-primary-foreground/40"
                      : "text-primary decoration-primary/40",
                  )}
                >
                  {children}
                </a>
              ),
              // Unwrap <pre> when it only wraps a chart code block so we don't get double chrome
              pre: ({ children }) => <>{children}</>,
              code: ({ className, children, ...props }: any) => {
                const match = /language-(\w+)/.exec(className || "");
                const language = match?.[1];
                const raw = String(children ?? "").replace(/\n$/, "");
                const isBlock =
                  !!match || (children && children.toString().includes("\n"));

                if (isBlock && isChartLanguage(language)) {
                  return <ChatChart source={raw} />;
                }

                return isBlock ? (
                  <div className="relative my-4 rounded-lg bg-zinc-950 shadow-lg group">
                    {match && (
                      <div className="absolute right-3 top-2 text-[10px] font-mono text-zinc-500 uppercase tracking-wider select-none">
                        {match[1]}
                      </div>
                    )}
                    <pre className="overflow-x-auto p-4 scrollbar-thin scrollbar-thumb-zinc-700">
                      <code
                        className={cn(
                          "text-zinc-50 text-xs font-mono leading-normal",
                          className,
                        )}
                        {...props}
                      >
                        {children}
                      </code>
                    </pre>
                  </div>
                ) : (
                  <code
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-mono text-[0.85em] font-medium",
                      isUser
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted-foreground/15 text-foreground",
                      className,
                    )}
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
              table: ({ children }) => (
                <div className="my-4 w-full overflow-x-auto rounded-lg border border-muted-foreground/20 shadow-sm">
                  <table className="w-full border-collapse text-xs text-left">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => (
                <thead className="bg-muted/80 font-semibold">{children}</thead>
              ),
              th: ({ children }) => (
                <th className="border-b border-muted-foreground/20 px-4 py-2.5">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border-b border-muted-foreground/10 px-4 py-2 text-muted-foreground">
                  {children}
                </td>
              ),
              blockquote: ({ children }) => (
                <blockquote
                  className={cn(
                    "my-4 border-l-4 pl-4 italic",
                    isUser
                      ? "border-primary-foreground/40 text-primary-foreground/90"
                      : "border-primary/40 text-muted-foreground",
                  )}
                >
                  {children}
                </blockquote>
              ),
              hr: () => <hr className="my-6 border-muted-foreground/10" />,
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </Card>
    </div>
  );
}
