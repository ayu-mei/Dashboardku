import { useEffect, useState } from "react";
import { SESSION_KEY } from "../services/auth";

function conversation() {
  return {
    id: crypto.randomUUID(),
    title: "Chat baru",
    updatedAt: new Date().toISOString(),
    messages: [],
    draft: "",
  };
}
function readHistory(key) {
  if (key) {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved?.version === 1 && Array.isArray(saved.conversations)) {
        const conversations = saved.conversations.filter(
          (item) =>
            typeof item.id === "string" &&
            typeof item.title === "string" &&
            typeof item.draft === "string" &&
            Array.isArray(item.messages) &&
            item.messages.every(
              (message) =>
                typeof message.answer === "string" &&
                typeof message.question === "string" &&
                message.filters &&
                message.generated_at,
            ),
        );
        if (conversations.length)
          return {
            version: 1,
            conversations,
            activeId: conversations.some((item) => item.id === saved.activeId)
              ? saved.activeId
              : conversations[0].id,
          };
      }
    } catch {
      /* A damaged entry must not prevent opening the dashboard. */
    }
  }
  const first = conversation();
  return { version: 1, conversations: [first], activeId: first.id };
}
export default function useChatHistory(userId) {
  const key = userId ? `${SESSION_KEY}:yuwi-history:${userId}` : null;
  const [state, setState] = useState(() => readHistory(key));
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
      setStorageError("");
    } catch {
      setStorageError(
        "Riwayat belum tersimpan di perangkat ini. Ruang penyimpanan browser mungkin penuh.",
      );
    }
  }, [key, state]);
  const active = state.conversations.find((item) => item.id === state.activeId);
  function update(field, value) {
    setState((previous) => ({
      ...previous,
      conversations: previous.conversations.map((item) => {
        if (item.id !== previous.activeId) return item;
        const next = {
          ...item,
          [field]: typeof value === "function" ? value(item[field]) : value,
          updatedAt: new Date().toISOString(),
        };
        if (!item.customTitle)
          next.title = (next.messages[0]?.question || next.draft || "Chat baru")
            .replace(/\s+/g, " ")
            .slice(0, 80);
        return next;
      }),
    }));
  }
  function newChat() {
    setState((previous) => {
      const empty = previous.conversations.find(
        (item) => !item.messages.length && !item.draft,
      );
      if (empty) return { ...previous, activeId: empty.id };
      const next = conversation();
      return {
        ...previous,
        activeId: next.id,
        conversations: [next, ...previous.conversations],
      };
    });
  }
  function remove(id) {
    setState((previous) => {
      let conversations = previous.conversations.filter(
        (item) => item.id !== id,
      );
      if (!conversations.length) conversations = [conversation()];
      return {
        ...previous,
        conversations,
        activeId:
          previous.activeId === id ? conversations[0].id : previous.activeId,
      };
    });
  }
  return {
    messages: active.messages,
    question: active.draft,
    activeId: state.activeId,
    conversations: [...state.conversations].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    ),
    setMessages: (value) => update("messages", value),
    setQuestion: (value) => update("draft", value),
    rename: (id, title) =>
      setState((previous) => ({
        ...previous,
        conversations: previous.conversations.map((item) =>
          item.id === id
            ? {
                ...item,
                title: title.trim().slice(0, 80) || item.title,
                customTitle: true,
              }
            : item,
        ),
      })),
    newChat,
    remove,
    select: (id) =>
      setState((previous) =>
        previous.conversations.some((item) => item.id === id)
          ? { ...previous, activeId: id }
          : previous,
      ),
    storageError,
  };
}
