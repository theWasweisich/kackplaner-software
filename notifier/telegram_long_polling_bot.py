# https://github.com/eternnoir/pyTelegramBotAPI
import datetime

from telebot.async_telebot import AsyncTeleBot
from middlewares.chat_id_middleware import RestrictChatMiddleware
from telebot.types import (
    BotCommand
)
import telebot.types
import logging
import asyncio
import re
import notify
import os
import os.path

class IncompleteConfiguration(Exception): pass

class ConfigVariables:
    TELEGRAM_TOKEN: str
    CHAT_ID: int
    ALLOWED_CHAT_IDS: list[int] = []
    DB_PATH: str

def get_env_variables():
    telegram_token = os.getenv("TELEGRAM_TOKEN")
    ConfigVariables.TELEGRAM_TOKEN = str(telegram_token)
    db_path = os.getenv("DB_PATH")
    ConfigVariables.DB_PATH = str(db_path)
    chat_id = os.getenv("CHAT_ID")
    whitelist_path = os.getenv("CHAT_ID_WHITELIST")

    if not chat_id:
        raise IncompleteConfiguration()

    if not db_path:
        raise IncompleteConfiguration()

    if whitelist_path:
        load_chat_id_whitelist_file(whitelist_path)

    try:
        ConfigVariables.CHAT_ID = int(chat_id)
    except ValueError:
        load_chat_id_whitelist_file(chat_id)
        if ConfigVariables.CHAT_ID is None:
            raise IncompleteConfiguration()


def load_chat_id_whitelist_file(filepath: str) -> None:
    if not os.path.isfile(filepath):
        return None

    whitelisted_ids: list[int] = []

    with open(filepath, "r") as f:
        whitelisted_ids = [int(num) for num in re.findall(r'\d+', f.read())]


    if not ConfigVariables.CHAT_ID:
        ConfigVariables.CHAT_ID = whitelisted_ids[0]

    ConfigVariables.ALLOWED_CHAT_IDS = whitelisted_ids
    return None

get_env_variables()

if ConfigVariables.TELEGRAM_TOKEN is None:
    raise IncompleteConfiguration()

if ConfigVariables.CHAT_ID is None:
    raise IncompleteConfiguration()

if ConfigVariables.DB_PATH is None:
    raise IncompleteConfiguration()

CMD_LAST_EVENT = BotCommand("lastevent", "See how many days passed since the last event", is_ephemeral=True)
CMD_STATUS = BotCommand("status", "Check the system status")

bot = AsyncTeleBot(ConfigVariables.TELEGRAM_TOKEN)

bot.setup_middleware(RestrictChatMiddleware(allowed_ids=[
    ConfigVariables.CHAT_ID,
    *ConfigVariables.ALLOWED_CHAT_IDS
]))


@bot.message_handler(commands=[CMD_LAST_EVENT.command])
async def send_last_schiss(message: telebot.types.Message):
    parameters = telebot.types.EphemeralMessageParameters(
        receiver_user_id=message.chat.id
    )

    days_since_last_event = notify.get_days_since_last_event(ConfigVariables.DB_PATH)

    if days_since_last_event is None:
        await bot.send_message(message.chat.id, "_Failed to get last date_", parse_mode="MarkdownV2")
        return

    assert isinstance(days_since_last_event, int)

    message_to_send = f"Last event was {days_since_last_event} days ago"

    await bot.send_message(message.chat.id, message_to_send, ephemeral_message_parameters=parameters)

async def check_last_schiss():
    while True:
        now = datetime.datetime.now()
        target = now.replace(hour=9, minute=0, second=0, microsecond=0)

        if now >= target:
            target += datetime.timedelta(days=1)

        wait_seconds = (target - now).total_seconds()

        await asyncio.sleep(wait_seconds)

        days_since_events: int | None = notify.get_days_since_last_event(ConfigVariables.DB_PATH)
        if days_since_events is None:
            break

async def set_commands_list():
    all_commands = [
        CMD_LAST_EVENT,
        CMD_STATUS
    ]

    await bot.set_my_commands(
        commands=all_commands,
        scope=telebot.types.BotCommandScopeDefault()
    )

async def main():
    logging.info("Starting polling bot")
    await set_commands_list()
    await bot.polling(non_stop=True)

if __name__ == "__main__":
    asyncio.run(main())
