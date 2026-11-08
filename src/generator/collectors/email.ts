import { graph, msStatus } from "../../connectors/microsoft.js";
import { NotConfigured, type Collector } from "../types.js";

interface Msg { id: string; subject?: string; from?: { emailAddress?: { name?: string } }; receivedDateTime: string; isRead: boolean; importance?: string; flag?: { flagStatus?: string }; conversationId: string; webLink?: string }

/** Read-only. "Awaiting reply" = recent inbox mail (unread, flagged or high importance) with no later sent message in the conversation. */
export const email: Collector = async ({ now }) => {
  if (msStatus().status !== "connected") throw new NotConfigured("Connect Microsoft in the header to see email.");
  const since = new Date(now.getTime() - 3 * 86400000).toISOString();
  const [inbox, sent] = await Promise.all([
    graph<{ value: Msg[] }>(`/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${since}&$select=id,subject,from,receivedDateTime,isRead,importance,flag,conversationId,webLink`),
    graph<{ value: { conversationId: string; sentDateTime: string }[] }>(`/me/mailFolders/sentitems/messages?$top=50&$orderby=sentDateTime desc&$filter=sentDateTime ge ${since}&$select=conversationId,sentDateTime`),
  ]);
  const lastSent = new Map<string, string>();
  for (const s of sent.value) if (!lastSent.has(s.conversationId)) lastSent.set(s.conversationId, s.sentDateTime);
  const items = inbox.value
    .filter((m) => !m.isRead || m.flag?.flagStatus === "flagged" || m.importance === "high")
    .map((m) => {
      const replied = (lastSent.get(m.conversationId) ?? "") > m.receivedDateTime;
      const important = m.flag?.flagStatus === "flagged" || m.importance === "high";
      return { m, replied, important };
    })
    .filter((x) => !x.replied)
    .slice(0, 12)
    .map(({ m, important }) => ({
      id: m.id, title: m.subject || "(no subject)", summary: `From ${m.from?.emailAddress?.name ?? "unknown"}`,
      date: m.receivedDateTime.slice(0, 10), url: m.webLink, tag: important ? "awaiting-reply" : "unread", source: "Outlook",
    }));
  return { items };
};
