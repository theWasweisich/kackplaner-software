import os
import json
import re
import urllib.request
import urllib.error
from enum import Enum, auto

class WebhookResult(Enum):
    SUCCESS = auto()
    CONFIG_MISSING = auto()
    HTTP_ERROR = auto()
    ERROR = auto()

def escape_markdown_v2(text: str) -> str:
    """Escapes strings for Telegram's strict MarkdownV2 formatting."""
    return re.sub(r'([_*\[\]()~`>#+\-=|{}.!])', r'\\\1', str(text))

def print_missing_config(config: str):
    print(f"Missing configuration in environment variables: {config}")

def send_webhook_message(message: str) -> WebhookResult:
    webhook_url = os.environ.get("WEBHOOK_URL")
    webhook_token = os.environ.get("TELEGRAM_TOKEN")
    chat_id = os.environ.get("CHAT_ID")

    if webhook_url is None:
        print_missing_config("webhook_url")
        return WebhookResult.CONFIG_MISSING

    if webhook_token is None:
        print_missing_config("webhook_token")
        return WebhookResult.CONFIG_MISSING

    if chat_id is None:
        print_missing_config("chat_id")
        return WebhookResult.CONFIG_MISSING

    payload = json.dumps({
        "chat_id": chat_id,
        "parse_mode": "MarkdownV2",
        "text": message
    }).encode("utf-8")

    req = urllib.request.Request(
        url=webhook_url + webhook_token + "/sendMessage",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Kackplaner-Bot/1.0",
        }
    )

    try:
        urllib.request.urlopen(req, timeout=5)
        print("Webhook sent")
        return WebhookResult.SUCCESS
    except urllib.error.HTTPError as e:
        error_details = e.read().decode("utf-8")
        print(f"Telegram API Error: {e.code}: {error_details}")
        return WebhookResult.HTTP_ERROR
    except Exception as e:
        print(f"Network Error: {e}")
    return WebhookResult.ERROR