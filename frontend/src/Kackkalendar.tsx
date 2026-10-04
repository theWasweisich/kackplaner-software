import {useRef, useState} from "react";
import {type CalendarEvent, createEvents, deleteEvent, fetchEvents} from "./api.ts";
import {useConfirm} from "./MicrolaxConfirmProvider.tsx";
import FullCalendar, {type DateClickInfo, type DatesSetInfo} from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import formaThemePlugin from "@fullcalendar/react/themes/forma";

function Kackkalendar() {
    const [events, setEvents] = useState<CalendarEvent[]>([])
    const confirm = useConfirm();

    const pendingCreates = useRef<CalendarEvent[]>([])
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

    const handleDateClick = async (arg: DateClickInfo) => {
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

        let microlax = await confirm({
            title: 'Microlaxabfrage',
            message: 'Wurde mit Microlax gehauft?',
            confirmText: 'Ja',
            cancelText: 'Nein'
        });

        const newEvent: CalendarEvent = {
            display: "background",
            title: '💩',
            start: arg.dateStr,
            allDay: true,
            microlax: microlax
        }

        setEvents(previousEvents => [...previousEvents, newEvent]);

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

export default Kackkalendar;