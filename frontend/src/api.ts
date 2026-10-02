export interface CalendarEvent {
  id?: string;
  title: string;
  start: string;
  allDay: boolean;
  display: "background" | undefined;
}

const baseUrl: string = "http://192.168.178.100:8090";

export async function fetchEvents(startStr: string, endStr: string): Promise<CalendarEvent[]> {
  try {
    console.log(`[API] Fetching events from: /get?start=${startStr}&end=${endStr}`);
    const res = await fetch(baseUrl + `/kackevent?start=${startStr}&end=${endStr}`);
    if (!res.ok) {
      console.error(`Server error: ${res.status} (${res.statusText})`);
      return [];

    }
    const data: { events: CalendarEvent[] } = await res.json();
    return data.events;
  } catch (error) {
    console.error("[API] Failed to fetch events", error);
    return [];
  }
}

export async function createEvents(events: CalendarEvent[]): Promise<CalendarEvent[]> {
  try {
    console.log("[API] Sending buffered creations to /create:", events);
    const res = await fetch(baseUrl + "/kackevent", {
      method: "PUT",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) {
      console.error(`Server error: ${res.status} (${res.statusText})`);
      return [];
    }
    const data: { events: CalendarEvent[] } = await res.json();
    return data.events;
  } catch (error) {
    console.error("[API] Failed to push new events to backend", error);
    return [];
  }
}

export async function deleteEvent(event: CalendarEvent): Promise<boolean> {

  try {
    const res = await fetch(baseUrl + `/kackevent?date=${event.start}`, {
      method: "DELETE"
    });
    if (!res.ok) {
      console.error(`Server error: ${res.status} (${res.statusText})`);
    }
  } catch (e) {
    console.error("[API] Failed to delete events from backend", e);
    return false;
  }

  return true;
}