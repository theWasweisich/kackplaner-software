#!/usr/bin/env python3
import os
import sqlite3
import urllib.request
import json

ENV_FILE = "/opt/kackplaner.env" if os.path.exists("/opt/kackplaner.env") else ".env"

def load_env(path: str | None = None):
    if path is None:
        path = ENV_FILE

    if not os.path.exists(path):
        return

    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ[key] = value

def alert_threshold_reached(webhook_url: str, days_since: int):
    print("Threshold reached. Sending webhook event...")

    payload = json.dumps({
        "content": f"Achtung: Das letzte Kackevent war bereits {days_since} Tag{"e" if days_since == 1 else ""} her."
    }).encode("utf-8")

    req = urllib.request.Request(
        url=webhook_url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Kackplaner-Bot/1.0"
        }
    )

    urllib.request.urlopen(req, timeout=5)

def main():
    load_env()
    db_path = os.environ.get("DB_PATH", "./database.db")
    webhook_url = os.environ.get("WEBHOOK_URL")

    if not webhook_url:
        print("ERROR: WEBHOOK_URL not set")
        return

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
        return

    if not row:
        print("No past events were found.")
        return

    days_since = row[0]
    print(f"Last event was {days_since} days ago")