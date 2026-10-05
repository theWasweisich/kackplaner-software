import {useConfirm} from "./MicrolaxConfirmProvider.tsx";
import {setScreenBrightness, shutdownKiosk} from "./api.ts";
import './ControlButtons.css';
import {useState} from "react";

interface ControlButtonsProps {
    onBeforeShutdown: () => Promise<void>;
}

export default function ControlButtons({ onBeforeShutdown }: ControlButtonsProps) {
    const [isAsleep, setIsAsleep] = useState<boolean>(false);
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

    const sleepScreen = async () => {
        setIsAsleep(true);
        await triggerSetBrightness(0);
    }

    const wakeScreen = async () => {
        setIsAsleep(false);
        await triggerSetBrightness(255);
    }

    return (
        <>
            <div className="control-buttons">
                <button className="shutdown-button" onClick={triggerShutdown}>Shutdown</button>
                <button className="brightness-dim-button" onClick={() => triggerSetBrightness(25)} >Dim</button>
                <button className="brightness-bright-button" onClick={() => triggerSetBrightness(255)} >Bright</button>

                <button className="sleep-screen-button" onClick={sleepScreen}>Sleep</button>
            </div>

            {isAsleep && (
                <div
                    onClick={wakeScreen}
                    className="wakeup-shield"
                    />
            )}
        </>
    )
}