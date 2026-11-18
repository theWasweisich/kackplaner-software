import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/forma/theme.css'
import '@fullcalendar/react/themes/forma/palettes/blue.css'
import {ConfirmProvider} from "./MicrolaxConfirmProvider.tsx";
import Kackkalender from "./Kackkalender.tsx";
import './App.css';
import {type ReactNode, useEffect} from "react";
import {BrowserRouter, Route, Routes, useNavigate, useNavigation} from "react-router-dom";
import { sessionResetEventType } from './api/api.ts';
import WelcomeScreen from "./WelcomeScreen.tsx";

function GlobalAuthHandler({ children }: { children: ReactNode }) {
    const navigate = useNavigate();

    useEffect(() => {
        const handleSessionResetEvent = () => {
            navigate('/', { replace: true });
        }

        window.addEventListener(sessionResetEventType, handleSessionResetEvent);
        return () => window.removeEventListener(sessionResetEventType, handleSessionResetEvent);
    }, [navigate])

    return <>{ children }</>
}

export default function App() {
    return (
        <BrowserRouter>
            <GlobalAuthHandler>
                <ConfirmProvider>
                    <Routes>
                        <Route path="/" element={<WelcomeScreen />} />
                        <Route path="/calendar" element={<Kackkalender />} />
                    </Routes>
                </ConfirmProvider>
            </GlobalAuthHandler>
        </BrowserRouter>
)
}
