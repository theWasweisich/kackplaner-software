import { useState, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import formaThemePlugin from '@fullcalendar/react/themes/forma'
import type { DatesSetInfo, DateClickInfo } from '@fullcalendar/react'
import { fetchEvents, createEvents, deleteEvent, type CalendarEvent } from './api'

import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/forma/theme.css'
import '@fullcalendar/react/themes/forma/palettes/blue.css'

function App() {
  const [events, setEvents] = useState<CalendarEvent[]>([])

  const pendingCreates = useRef<any[]>([])
  const createTimeout = useRef<number | null>(null)

  const handleDatesSet = async (dateInfo: DatesSetInfo) => {
    const fetchedEvents = await fetchEvents(dateInfo.startStr, dateInfo.endStr)
    if (fetchedEvents && fetchedEvents.length > 0) {
      setEvents(fetchedEvents)
    }
  }

  const removeEventAtIndex = async (index: number) => {
    const newEvents = [...events];
    const deltedEvent = newEvents.splice(index, 1)[0];
    const success = await deleteEvent(deltedEvent);
    if (success) {
      setEvents(newEvents);
    }
  }

  const handleDateClick = (arg: DateClickInfo) => {
    const clickedDateStr = arg.dateStr;

    const eventIndex = events.findIndex(event => {
      const eventDate = new Date(event.start);
      const eventDateStr = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
      return eventDateStr === clickedDateStr;
    });

    if (eventIndex !== -1) {
      removeEventAtIndex(eventIndex);
      return;
    }

    const newEvent: CalendarEvent = {
      display: "background",
      title: '💩',
      start: arg.dateStr,
      allDay: true
    }

    setEvents(prev => [...prev, newEvent]);

    pendingCreates.current.push(newEvent);

    if (createTimeout.current) {
      clearTimeout(createTimeout.current);
    }

    createTimeout.current = window.setTimeout(async () => {
      const eventsToSend = [...pendingCreates.current];
      pendingCreates.current = [];

      await createEvents(eventsToSend);
    }, 1000);
  }

  return (
    <div>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, formaThemePlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: ''
        }}
        events={events}
        dateClick={handleDateClick}
        datesSet={handleDatesSet}
        height="80vh"
        backgroundEventColor="brown"
        firstDay={1}
      />
    </div>
  )
}

export default App
