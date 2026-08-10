import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/services/lib/auth/auth";
import { getAIService } from "@/services/lib/ai/service";
import { getAIConfig } from "@/services/lib/ai/config";
import { getToolsForUser } from "@/services/lib/ai/tool-registry";
import { toAIUserContext } from "@/services/lib/ai/context";
import { prisma } from "@/services/lib/prisma";
import { AIChatMessage } from "@/services/lib/ai/types";

const chatBodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["system", "user", "assistant", "function"]),
      content: z.string(),
      name: z.string().optional(),
      function_call: z
        .object({ name: z.string(), arguments: z.string() })
        .optional(),
    }),
  ),
  sessionId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = chatBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body: messages array required" },
        { status: 400 },
      );
    }
    const { messages, sessionId } = parsed.data;

    // Rate Limiting: 50 requests per hour per user
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentUsage = await prisma.aIUsage.count({
      where: {
        userId: session.userId,
        createdAt: { gt: oneHourAgo },
      },
    });

    if (recentUsage > 50) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 },
      );
    }

    const userContext = toAIUserContext(session);
    const tools = getToolsForUser(userContext);

    const aiConfig = await getAIConfig(session.userId);
    const aiService = getAIService(
      aiConfig.apiKey,
      aiConfig.provider,
      aiConfig.customEndpoint,
    );

    // Register role-aware tools for provider fallback path
    tools.forEach((tool) => aiService.registerTool(tool));

    // Get or create session
    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const newSession = await prisma.aISession.create({
        data: {
          userId: session.userId,
          title: messages[0].content.slice(0, 50) + "...",
        },
      });
      currentSessionId = newSession.id;
    } else {
      await prisma.aISession.update({
        where: { id: currentSessionId },
        data: { updatedAt: new Date() },
      });
    }

    // Save user message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === "user") {
      await prisma.aIMessage.create({
        data: {
          sessionId: currentSessionId,
          role: "user",
          content: lastMessage.content,
        },
      });
    }

    // Generate response using role-aware LangChain agent
    const response = await aiService.generateResponse(
      {
        messages: messages as AIChatMessage[],
        config: aiConfig,
        tools,
      },
      userContext,
    );

    const content = response.content || "";

    await prisma.aIMessage.create({
      data: {
        sessionId: currentSessionId,
        role: "assistant",
        content,
      },
    });

    await prisma.aIUsage.create({
      data: {
        userId: session.userId,
        model: aiConfig.model,
        tokensPrompt: 0,
        tokensCompletion: Math.ceil(content.length / 4),
        tokensTotal: Math.ceil(content.length / 4),
      },
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(content));
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Session-Id": currentSessionId,
      },
    });
  } catch (error: any) {
    console.error("Chat API Error:", error);
    const message =
      error?.message ||
      (typeof error === "string" ? error : "Internal Server Error");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
