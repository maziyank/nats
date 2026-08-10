"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  Trash2,
  Plus,
  MessageSquare,
  History,
  MoreVertical,
  Pencil,
  Trash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatMessage } from "./chat-message";
import { ThinkingProcess } from "./thinking-process";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  getChatSessions,
  getChatMessages,
  deleteChatSession,
  renameChatSession,
} from "../actions";
import { cn } from "@/services/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Message {
  role: "user" | "assistant" | "system" | "function";
  content: string;
}

interface Session {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    messages: number;
  };
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const data = await getChatSessions();
      setSessions(data as Session[]);
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSelectSession = async (id: string) => {
    if (id === sessionId) {
      setIsHistoryOpen(false);
      return;
    }

    setIsLoading(true);
    setSessionId(id);
    setIsHistoryOpen(false);
    try {
      const msgs = await getChatMessages(id);
      setMessages(
        msgs.map((m) => ({
          role: m.role as any,
          content: m.content || "",
        })),
      );
    } catch (error) {
      console.error("Failed to fetch messages:", error);
      toast({
        title: "Error",
        description: "Failed to load chat history.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setSessionId(null);
    setIsHistoryOpen(false);
  };

  const handleDeleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteChatSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (sessionId === id) {
        handleNewChat();
      }
      toast({
        title: "Success",
        description: "Chat session deleted.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete chat session.",
        variant: "destructive",
      });
    }
  };

  const handleRenameSession = async (id: string, title: string) => {
    try {
      await renameChatSession(id, title);
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title } : s)),
      );
      toast({
        title: "Success",
        description: "Chat session renamed.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to rename chat session.",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          sessionId,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to send message";
        try {
          const errBody = await response.json();
          if (errBody?.error) errorMessage = errBody.error;
        } catch {
          // ignore non-JSON error bodies
        }
        throw new Error(errorMessage);
      }

      const newSessionId = response.headers.get("X-Session-Id");
      if (newSessionId && !sessionId) {
        setSessionId(newSessionId);
        fetchSessions(); // Refresh sessions list to show new session
      }

      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let receivedContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        if (!text) continue;

        if (!receivedContent) {
          receivedContent = true;
          setIsGenerating(false);
          // First chunk: create assistant message
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: text },
          ]);
        } else {
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg?.role === "assistant") {
              newMessages[newMessages.length - 1] = {
                ...lastMsg,
                content: lastMsg.content + text,
              };
            }
            return newMessages;
          });
        }
      }
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to get response from AI service.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-10rem)] gap-4">
      {/* Main Chat Area */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle>
              {sessionId
                ? sessions.find((s) => s.id === sessionId)?.title ||
                  "AI Business Assistant"
                : "AI Business Assistant"}
            </CardTitle>
          </div>
          <div className="flex gap-2">
            <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  History
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Chat History</DialogTitle>
                  <DialogDescription>
                    Select a previous chat to continue the conversation
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                  <Button
                    onClick={handleNewChat}
                    className="w-full justify-start gap-2"
                    variant="outline"
                  >
                    <Plus className="h-4 w-4" />
                    New Chat
                  </Button>
                  <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                    {isHistoryLoading ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Loading history...
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No recent chats
                      </div>
                    ) : (
                      sessions.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => handleSelectSession(s.id)}
                          className={cn(
                            "group relative flex items-center gap-2 px-3 py-3 text-sm rounded-md cursor-pointer transition-colors",
                            sessionId === s.id
                              ? "bg-secondary text-secondary-foreground"
                              : "hover:bg-muted text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <MessageSquare className="h-4 w-4 shrink-0" />
                          <span className="truncate flex-1 pr-6">
                            {s.title || "Untitled Chat"}
                          </span>

                          <div className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                asChild
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                >
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newTitle = prompt(
                                      "Enter new title:",
                                      s.title || "",
                                    );
                                    if (newTitle && newTitle !== s.title) {
                                      handleRenameSession(s.id, newTitle);
                                    }
                                  }}
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => handleDeleteSession(e, s.id)}
                                  className="text-destructive"
                                >
                                  <Trash className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {sessionId && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNewChat}
                title="New Chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
              <Bot className="h-12 w-12 mb-4 opacity-20" />
              <h3 className="text-lg font-medium">How can I help you today?</h3>
              <p className="text-sm max-w-md mt-2">
                Ask about financial reports, inventory status, or sales trends.
                Request charts for visual analysis — for example monthly sales
                or expense breakdown.
              </p>
              <div className="mt-6 grid w-full max-w-lg gap-2 text-left sm:grid-cols-2">
                {[
                  "Chart monthly sales for this year",
                  "Show expense breakdown as a pie chart",
                  "Visualize cash flow by month",
                  "Bar chart of top inventory by value",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-4">
              {messages.map((msg, index) => (
                <ChatMessage
                  key={index}
                  role={msg.role}
                  content={msg.content}
                />
              ))}
              {isGenerating && <ThinkingProcess />}
            </div>
          )}
        </CardContent>
        <div className="p-4 border-t bg-background">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
