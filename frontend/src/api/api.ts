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

export const unauthorizedEventType = "unauthorized-request";

export interface UnauthorizedEventData {
  url?: string;
  text?: string;
}

const baseUrl: string = `/api`;

async function handle401Error(res: Response) {
  const text = await res.text();

  const eventData: CustomEventInit<UnauthorizedEventData> = {
    detail: {
      text: text,
      url: res.url
    }
  };

  window.dispatchEvent(new CustomEvent(unauthorizedEventType, eventData));
}

async function handleRequestError(res: Response) {
  console.log(`Server error: ${res.status} (${res.statusText})`)

  if (res.status === 401) {
    await handle401Error(res);
  }

  return false;
}

export async function logut(username: string) {
  try {
    const res = await fetch(baseUrl + "/logout", {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });

    if (res.ok) {
      await handle401Error(res);
    }
  } catch (e) {
    console.error("Failed to log out:", e);
  }
  return false;
}

export async function login(username: string, password: string): Promise<boolean> {
  try {
    const res: Response = await fetch(baseUrl + "/users/login", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify({
        username: username,
        password: password
      }),
      headers: {
        "Content-Type": "application/json"
      }
    });
    if (!res.ok) {
      return await handleRequestError(res);
    }
    return true;
  } catch (e) {
    console.error(`Failed to perform login: ${e}`);
  }

  return false;
}

export async function getMe(): Promise<string | undefined> {
  try {
    const res: Response = await fetch(baseUrl + "/users/me", {
      credentials: "include",
      method: "GET"
    });
    if (!res.ok) {
      if (res.status === 401) await handleRequestError(res);
      return;
    }
    return await res.text();
  } catch (e) {
    console.error(`Failed to get me: ${e}`)
  }
  return;
}

export async function fetchEvents(start: Date, end: Date): Promise<NetworkEvent[]> {
  let events: NetworkEvent[] = [];
  try {
    const urlPath = `/kackevent?start=${start.toISOString()}&end=${end.toISOString()}`;
    console.log(`[API] Fetching events from: ${urlPath}`);
    const res: Response = await fetch(baseUrl + urlPath);
    if (!res.ok) {
      if (res.status === 401) await handleRequestError(res);
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
    const urlPath = "/kackevent"
    console.log(`[API] Sending buffered creations to ${urlPath}:`, events);
    const res = await fetch(baseUrl + urlPath, {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    });
    if (!res.ok) {
      if (res.status === 401) await handleRequestError(res);
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
      if (res.status === 401) return await handleRequestError(res);
      return false;
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
    if (res.status !== 401) return false;
    return await handleRequestError(res);
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
    if (res.status !== 401) return false;
    return await handleRequestError(res);
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
    if (res.status !== 401) return false;
    return await handleRequestError(res);
  } catch (e) {
    console.error("Failed to reach backend for setting brightness:", e);
  }
  return false;
}