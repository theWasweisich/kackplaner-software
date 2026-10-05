import {useConfirm} from "./MicrolaxConfirmProvider.tsx";
import {setScreenBrightness, shutdownKiosk} from "./api.ts";
import './ControlButtons.css';

interface ControlButtonsProps {
    onBeforeShutdown: () => Promise<void>;
}

export default function ControlButtons({ onBeforeShutdown }: ControlButtonsProps) {
    const confirm = useConfirm();

    const triggerShutdown = async () => {
        if (!(await confirm({
            title: "Shutdown",
            message: "Wirklich runterfahren?",
            confirmText: "Ja, runterfahren",
            cancelText: "Nein, bitte nicht!"
        }))) {
            return;
        }

        await onBeforeShutdown();

        if (await shutdownKiosk()) {
            alert("Shutdown in progress.");
        }
    }

    const triggerSetBrightness = async (brightness: number) => {
        brightness = parseInt(brightness.toString());
        await setScreenBrightness(brightness);
    }

    return (
        <div className="control-buttons">
            <button className="shutdown-button" onClick={triggerShutdown}>Shutdown</button>
            <button className="brightness-dim-button" onClick={() => triggerSetBrightness(25)} >25%</button>
            <button className="brightness-bright-button" onClick={() => triggerSetBrightness(255)} >100%</button>
        </div>
    )
}