"use server";

import { prisma } from "@/services/lib/prisma";
import { verifySession } from "@/services/lib/auth/auth";
import { revalidatePath } from "next/cache";

export async function getChatSessions() {
  const session = await verifySession();
  
  const sessions = await prisma.aISession.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: { messages: true }
      }
    }
  });
  
  return sessions;
}

export async function getChatMessages(sessionId: string) {
  const session = await verifySession();
  
  // Verify session belongs to user
  const aiSession = await prisma.aISession.findUnique({
    where: { 
      id: sessionId,
      userId: session.userId 
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" }
      }
    }
  });
  
  if (!aiSession) {
    throw new Error("Session not found or unauthorized");
  }
  
  return aiSession.messages;
}

export async function deleteChatSession(sessionId: string) {
  const session = await verifySession();
  
  await prisma.aISession.delete({
    where: { 
      id: sessionId,
      userId: session.userId 
    }
  });
  
  revalidatePath("/ai/chat");
  return { success: true };
}

export async function renameChatSession(sessionId: string, title: string) {
  const session = await verifySession();
  
  await prisma.aISession.update({
    where: { 
      id: sessionId,
      userId: session.userId 
    },
    data: { title }
  });
  
  revalidatePath("/ai/chat");
  return { success: true };
}
