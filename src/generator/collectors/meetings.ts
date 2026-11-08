import { graph, msStatus } from "../../connectors/microsoft.js";
import { prepLine, icsMeetings } from "./ics.js";
import { NotConfigured, type Collector } from "../types.js";

interface GEvent { id: string; subject?: string; start: { dateTime: string }; isAllDay?: boolean; isOnlineMeeting?: boolean; location?: { displayName?: string }; attendees?: unknown[]; isCancelled?: boolean }

export const meetings: Collector = async ({ now }) => {
  if (msStatus().status === "connected") {
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    const q = `startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}&$orderby=start/dateTime&$top=50&$select=id,subject,start,isAllDay,isOnlineMeeting,location,attendees,isCancelled`;
    const { value } = await graph<{ value: GEvent[] }>(`/me/calendarView?${q}`);
    return {
      items: value.filter((e) => !e.isCancelled).map((e) => ({
        id: e.id, title: e.subject || "(no title)", start: e.isAllDay ? undefined : `${e.start.dateTime.replace(/Z?$/, "Z")}`,
        summary: e.isAllDay ? "All day" : prepLine({ attendees: e.attendees?.length ?? 0, online: !!e.isOnlineMeeting, location: e.location?.displayName ?? "" }),
      })),
    };
  }
  const ics = process.env.KIP_ICS_URL;
  if (ics) return { items: await icsMeetings(ics, now) };
  throw new NotConfigured("Connect Microsoft in the header, or set KIP_ICS_URL in .env (an ICS calendar link).");
};
