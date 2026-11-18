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

export const sessionResetEventType = "session-reset";
export const unauthorizedEventType = "unauthorized-request";

export class UnauthorizedEvent extends Event {
  #url?: string;
  #text?: string;

  constructor(url?: string, text?: string) {
    super(unauthorizedEventType);
    this.#url = url;
    this.#text = text;
  }

  get url() { return this.#url }
  get descriptionText() { return this.#text }
}

class SessionResetEvent extends Event {
  #reason: SessionResetReason

  constructor(reason: SessionResetReason) {
    super(sessionResetEventType);
    this.#reason = reason;
  }

  get reason() { return this.#reason }
}
export type SessionResetReason = "unauthorized" | "logout";

const baseUrl: string = `/api/frontend`;

async function handle401Error(res: Response) {
  const text = await res.text();

  window.dispatchEvent(new UnauthorizedEvent(
      res.url,
      text
  ));

  window.dispatchEvent(new SessionResetEvent("unauthorized"));
}

async function handleRequestError(res: Response) {
  console.log(`Server error: ${res.status} (${res.statusText})`)

  if (res.status === 401) {
    await handle401Error(res);
  }

  return false;
}

export async function endSession(): Promise<boolean> {
  try {
    const res = await fetch(baseUrl + "/end-session", { method: "POST" });

    if (res.ok) {
      window.dispatchEvent(new SessionResetEvent("logout"));
      return true;
    }
  } catch (e) {
    console.error(`Failed to end session`, e);
  }
  return false;
}

export async function logout(username: string) {
  try {
    const res = await fetch(baseUrl + "/logout", {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });

    if (res.ok) {
      window.dispatchEvent(new SessionResetEvent("logout"));
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
    return (await res.json()).username;
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
    const res = await fetch(baseUrl + "/system/shutdown", {
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
    const res = await fetch(baseUrl + "/system/reboot", {
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
    const res = await fetch(baseUrl + `/system/display/brightness?brightness=${brightness}`, {
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