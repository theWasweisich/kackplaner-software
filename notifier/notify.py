import logging
import os
import sqlite3
import sys
from pathlib import Path
from typing import Optional

import pydantic
from pydantic import BaseModel
from telegram_client import send_webhook_message, WebhookResult, escape_markdown_v2

class Configuration(BaseModel):
    shittingcycle: int = 2
    reminder_message: str = "*Hinweis*: Heute ist Kacktag! (Das letzte Kackevent war vor {} Tag(en))\\."
    alert_message: str = "*Achtung*: Das letzte Kackevent war bereits {} Tag(e) her\\."

CONFIG: Optional[Configuration] = None

def alert_threshold_reached(days_since: int):
    print("Threshold reached. Sending webhook event...")

    escaped_days_since = escape_markdown_v2(str(days_since))

    message_to_send = f"*Achtung*: Das letzte Kackevent war bereits {escaped_days_since} Tag{"" if days_since == 1 else "e"} her\\."

    result = send_webhook_message(message_to_send)

    if result == WebhookResult.CONFIG_MISSING:
        sys.exit(1)


def get_days_since_last_event(db_path: str) -> int | None:
    query = """
SELECT
    CAST(julianday('now') - julianday(date(events.start)) AS INTEGER) AS days_ago
FROM
    events
WHERE start <= datetime('now', 'localtime')
ORDER BY start DESC
LIMIT 1;
"""
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(query)
        row = cursor.fetchone()
        conn.close()
    except sqlite3.Error as e:
        print(f"Database error: {e}")
        return None

    if not row:
        print("No past events were found.")
        return None
    days_since = int(row[0])
    return days_since

def get_config_path(config_directory: Path) -> Path:
    return config_directory / "notifier.settings.json"

def load_config(config_directory: Path):
    global CONFIG
    config_file = get_config_path(config_directory)
    try:
        CONFIG = Configuration.model_validate_json(config_file.read_text())
    except pydantic.ValidationError as e:
        logging.error("Failed to parse config!", e)

def main():
    db_path = os.environ.get("DB_PATH", "./database.db")
    config_path = os.environ.get("CONFIG_DIR", ".")

    if os.path.exists(config_path) and os.path.isdir(config_path):
        load_config(Path(config_path))

    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        print("Running in test mode. Forcing webhook execution")
        alert_threshold_reached(99)
        return

    days_since = get_days_since_last_event(db_path=db_path)

    if days_since is None:
        return

    print(f"Last event was {days_since} days ago")

    if days_since > 3:
        alert_threshold_reached(days_since=days_since)

if __name__ == "__main__":
    main()