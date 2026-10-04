import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/forma/theme.css'
import '@fullcalendar/react/themes/forma/palettes/blue.css'
import {ConfirmProvider} from "./MicrolaxConfirmProvider.tsx";
import Kackkalender from "./Kackkalender.tsx";

export default function App() {
  return (
      <div>
        <ConfirmProvider>
          <Kackkalender />
        </ConfirmProvider>
      </div>
  )
}