import logging
import os
import sqlite3
import sys
import json
from notifier_config import load_config
from telegram_client import send_webhook_message, WebhookResult, escape_markdown_v2

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "level": record.levelname.lower(),
            "message": record.getMessage(),
        }

        if record.exc_info:
            log_record["stack"] = self.formatException(record.exc_info)

        return json.dumps(log_record)

def alert_threshold_reached(days_since: int, message_template: str):
    logging.info("Threshold reached. Sending webhook event...")

    escaped_days_since = escape_markdown_v2(str(days_since))
    message_to_send = message_template.format(days=escaped_days_since)

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
        logging.error(f"Database error: {e}")
        return None

    if not row:
        logging.warning("No past events were found.")
        return None
    days_since = int(row[0])
    return days_since

def setup_logging():
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)

    if logger.hasHandlers():
        logger.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    logger.addHandler(handler)

def main():
    setup_logging()
    db_path = os.environ.get("DB_PATH", "./database.db")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.environ.get("ALERTS_CONFIG_PATH", os.path.join(script_dir, "alerts.json"))

    config = load_config(config_path)
    if not config:
        logging.error("Exiting due to invalid or missing configuration")
        return

    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        logging.info("Running in test mode. Forcing webhook execution")
        template = config.rules[0].message if config.rules else "Test: {days} Tage her\\."
        alert_threshold_reached(99, template)
        return

    days_since = get_days_since_last_event(db_path=db_path)
    if days_since is None:
        return

    logging.info(f"Last event was {days_since} days ago")

    for rule in config.rules:
        if rule.matches(days_since):
            alert_threshold_reached(days_since=days_since, message_template=rule.message)

if __name__ == "__main__":
    main()