import {useRef, useState} from "react";
import {type CalendarEvent, createEvents, deleteEvent, fetchEvents, shutdownKiosk} from "./api.ts";
import {useConfirm} from "./MicrolaxConfirmProvider.tsx";
import FullCalendar, {type DateClickInfo, type DatesSetInfo} from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import formaThemePlugin from "@fullcalendar/react/themes/forma";
import './Kackkalendar.css';

const BATCH_DELAY_MS = 1000;
const EVENT_COLOR = "#0000b1";
const EVENT_MICROLAX_COLOR = "#c54f4f";
const EVENT_ICON = "💩";

function Kackkalender() {
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
        const eventToRemove = events[index];

        const pendingIndex = pendingCreates.current.findIndex(
            (pendingEvent) => pendingEvent.start == eventToRemove.start
        );

        if (pendingIndex !== -1) {
            pendingCreates.current.splice(pendingIndex, 1);

            setEvents(prevEvents => prevEvents.filter((_, i) => i !== index));
            return;
        }

        const newEvents = [...events];
        const deletedEvent = newEvents.splice(index, 1)[0];
        const success = await deleteEvent(deletedEvent);
        if (success) {
            setEvents(newEvents);
        }
    }

    const handleDateClick = async (arg: DateClickInfo) => {
        const clickedDateStr = arg.dateStr;

        const eventIndex: number = events.findIndex((event: CalendarEvent) => {
            const eventDate = new Date(event.start);
            const eventDateStr = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
            return eventDateStr === clickedDateStr;
        });

        if (eventIndex !== -1) {
            await removeEventAtIndex(eventIndex);
            return;
        }

        const microlax: boolean = await confirm({
            title: 'Microlaxabfrage',
            message: 'Wurde mit Microlax gehauft?',
            confirmText: 'Ja',
            cancelText: 'Nein'
        });

        addEvent(arg.date, microlax);
    }

    const addEvent = (startDate: Date, microlax: boolean) => {
        const newEvent: CalendarEvent = {
            title: EVENT_ICON,
            start: startDate.toISOString(),
            allDay: true,
            microlax: microlax,
            color: microlax ? EVENT_MICROLAX_COLOR : EVENT_COLOR,
            display: "background"
        }

        setEvents(prevState => [...prevState, newEvent]);

        pendingCreates.current.push(newEvent);

        if (createTimeout.current) {
            clearTimeout(createTimeout.current);
        }

        createTimeout.current = window.setTimeout(async () => {
            await createPendingEvents();
        }, BATCH_DELAY_MS)
    }

    const createPendingEvents = async () => {
        const eventsToSend = [...pendingCreates.current];
        pendingCreates.current = [];

        await createEvents(eventsToSend);
    }

    const triggerShutdown = async () => {
        if (!(await confirm({
            title: "Shutdown",
            message: "Wirklich runterfahren?",
            confirmText: "Ja, runterfahren!",
            cancelText: "Nein, bitte nicht"
        }))) {
            return;
        }

        if (createTimeout.current !== null && pendingCreates.current.length > 0) {
            console.log(`${pendingCreates.current.length} events need to be created before shutdown`);
            createTimeout.current = null;
            await createPendingEvents();
        }

        if (await shutdownKiosk()) {
            alert("Shutdown in progress.");
        }
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
                backgroundEventColor={EVENT_COLOR}
                firstDay={1}
            />
            <div className="control-buttons">
                <button className="shutdown-button" onClick={triggerShutdown}>Shutdown</button>
            </div>
        </div>
    )
}

export default Kackkalender;