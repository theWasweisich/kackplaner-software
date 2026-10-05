#!/usr/bin/env python3
import os
import sqlite3
import urllib.request
import urllib.error
import json
import sys

def alert_threshold_reached(webhook_url: str, days_since: int):
    webhook_token = os.environ.get("TELEGRAM_TOKEN")
    chat_id = os.environ.get("CHAT_ID")

    if not webhook_token:
        print("No webhook token provided!")
        return

    if not chat_id:
        print("No chat id provided")
        return

    print("Threshold reached. Sending webhook event...")

    payload = json.dumps({
        "chat_id": chat_id,
        "text": f"Achtung: Das letzte Kackevent war bereits {days_since} Tag{"" if days_since == 1 else "e"} her.",
        "parse_mode": "html"
    }).encode("utf-8")

    req = urllib.request.Request(
        url=webhook_url + webhook_token + "/sendMessage",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Kackplaner-Bot/1.0"
        }
    )

    try:
        urllib.request.urlopen(req, timeout=5)
        print("Webhook sent successfully")
    except urllib.error.HTTPError as e:
        error_details = e.read().decode("utf-8")
        print(f"Telegram API Error ({e.code})")
        print(error_details)
    except Exception as e:
        print(f"Network Error: {e}")


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

def main():
    db_path = os.environ.get("DB_PATH", "./database.db")
    webhook_url = os.environ.get("WEBHOOK_URL")

    if not webhook_url:
        print("ERROR: WEBHOOK_URL not set")
        return

    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        print("Running in test mode. Forcing webhook execution")
        alert_threshold_reached(webhook_url, 99)
        return

    days_since = get_days_since_last_event(db_path=db_path)

    if days_since is None:
        return

    print(f"Last event was {days_since} days ago")

    if days_since > 3:
        alert_threshold_reached(webhook_url=webhook_url, days_since=days_since)

if __name__ == "__main__":
    main()