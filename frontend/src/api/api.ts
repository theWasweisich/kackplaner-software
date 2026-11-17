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


const baseUrl: string = `/api`;

export async function fetchEvents(start: Date, end: Date): Promise<NetworkEvent[]> {
  let events: NetworkEvent[] = [];
  try {
    console.log(`[API] Fetching events from: /get?start=${start.toISOString()}&end=${end.toISOString()}`);
    const res: Response = await fetch(baseUrl + `/kackevent?start=${start.toISOString()}&end=${end.toISOString()}`);
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
      method: "POST",
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
    console.error(`Failed to reach backend for shutdown:`, e)
  }
  return false;
}

export async function rebootKiosk(): Promise<boolean> {
  try {
    const res = await fetch(baseUrl + "/reboot", {
      method: 'POST'
    });
    if (res.ok) return true;
  } catch (e) {
    console.error(`Failed to reach backend for reboot:`, e)
  }
  return false;
}

export async function setScreenBrightness(brightness: number): Promise<boolean> {
  try {
    const res = await fetch(baseUrl + `/display/brightness?brightness=${brightness}`, {
      method: 'POST'
    });
    if (res.ok) return true;
  } catch (e) {
    console.error("Failed to reach backend for setting brightness:", e);
  }
  return false;
}