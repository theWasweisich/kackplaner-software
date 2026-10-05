export interface NetworkEvent {
  id?: string;
  title: string;
  start: string;
  microlax?: boolean;
}

export interface CalendarEvent {
  id?: string;
  title: string;
  start: string;
  allDay: boolean;
  display: "background" | undefined;
  microlax?: boolean;
  color?: string;
}

const baseUrl: string = `http://localhost:${import.meta.env.VITE_BACKEND_PORT || 8090}`;

export async function fetchEvents(startStr: string, endStr: string): Promise<NetworkEvent[]> {
  let events: NetworkEvent[] = [];
  try {
    console.log(`[API] Fetching events from: /get?start=${startStr}&end=${endStr}`);
    const res: Response = await fetch(baseUrl + `/kackevent?start=${startStr}&end=${endStr}`);
    if (!res.ok) {
      console.error(`Server error: ${res.status} (${res.statusText})`);
      return events;
    }
    const data: { events: NetworkEvent[] } = await res.json();
    events = data.events;
  } catch (error) {
    console.error("[API] Failed to fetch events", error);
  }
  return events;
}

export async function createEvents(events: NetworkEvent[]): Promise<NetworkEvent[]> {
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

export async function deleteEvent(event: NetworkEvent): Promise<boolean> {

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

export async function shutdownKiosk(): Promise<boolean> {
  try {
    const res = await fetch(baseUrl + "/shutdown", {
      method: 'POST'
    });
    if (res.ok) return true;
  } catch (e) {
    console.error(`Failed to reach backend for shutdown: ${e}`)
  }
  return false;
}