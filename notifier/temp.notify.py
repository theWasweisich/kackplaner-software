#!/usr/bin/env python3
import sys
import subprocess
from telegram_client import send_webhook_message, WebhookResult, escape_markdown_v2

def millidegrees_to_degrees(milli_degrees: float) -> float:
    return milli_degrees / 1_000

def get_temp():
    output = subprocess.check_output(["cat", "/sys/class/thermal/thermal_zone0/temp"], encoding="utf-8")
    milli_degrees = float(output)
    return millidegrees_to_degrees(milli_degrees)

def alert_threshold_reached(temperature: float):
    print("Threshold reached. Sending event")

    escaped_temperature = escape_markdown_v2(f"{temperature:.1f}")
    message_to_send = f"*Achtung*: Die Temperatur des PI ist {escaped_temperature}°C"

    result = send_webhook_message(message_to_send)

    if result == WebhookResult.CONFIG_MISSING:
        sys.exit(1)

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        print("Running in test mode. Forcing webhook execution")
        alert_threshold_reached(99.9)
        return

    temperature = get_temp()

    print(f"Temperature reached {temperature}°C")

    if temperature > 75.0:
        alert_threshold_reached(temperature)

if __name__ == "__main__":
    main()