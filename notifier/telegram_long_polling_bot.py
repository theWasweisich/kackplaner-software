# https://github.com/eternnoir/pyTelegramBotAPI
import datetime
import subprocess

from auto_dismiss_async_bot import AutoDismissAsyncTeleBot
from middlewares.chat_id_middleware import RestrictChatMiddleware
from telebot.types import (
    Message,
    BotCommand,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton
)
from dataclasses import dataclass
import telebot.types
import logging
import asyncio
import re
import notify
import os
import os.path

class IncompleteConfiguration(Exception): pass

@dataclass(frozen=True)
class MenuButton:
    label: str
    callback_data: str

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

CMD_LAST_EVENT = BotCommand("lastevent", "See how many days passed since the last event")
CMD_STATUS = BotCommand("status", "Check the system status")

bot = AutoDismissAsyncTeleBot(ConfigVariables.TELEGRAM_TOKEN)

bot.setup_middleware(RestrictChatMiddleware(allowed_ids=[
    ConfigVariables.CHAT_ID,
    *ConfigVariables.ALLOWED_CHAT_IDS
]))

def get_last_schiss_message() -> str:
    days_since_last_event = notify.get_days_since_last_event(ConfigVariables.DB_PATH)

    if days_since_last_event is None:
        return "_Failed to get last date_"

    assert isinstance(days_since_last_event, int)

    return f"Last event was *{days_since_last_event}* days ago"

def millidegrees_to_degrees(milli_degrees: float) -> float:
    return milli_degrees / 1_000

def get_temp():
    try:
        output = subprocess.check_output(["cat", "/sys/class/thermal/thermal_zone0/temp"], encoding="utf-8")
        milli_degrees = float(output)
        return millidegrees_to_degrees(milli_degrees)
    except subprocess.CalledProcessError as e:
        logging.error(e)
        return -1

def get_uptime() -> str:
    try:
        output = subprocess.check_output(["uptime", "--pretty"], encoding="utf-8")
        return output
    except subprocess.CalledProcessError as e:
        logging.error(e)
        return ""

def build_status_message() -> str:
    message = "Status\\!"
    message += f"\nTemperature: *{get_temp()}*"
    message += f"\nUptime: *{get_uptime()}*"
    return message

@bot.message_handler(commands=[CMD_LAST_EVENT.command])
async def send_last_schiss(message: telebot.types.Message):
    message_to_send = get_last_schiss_message()
    await bot.send_message(message.chat.id, message_to_send, parse_mode="MarkdownV2")

@bot.message_handler(commands=[CMD_STATUS.command])
async def send_status(message: Message):
    message_to_send = build_status_message()
    await bot.send_message(message.chat.id, message_to_send, parse_mode="MarkdownV2")

def is_dismiss_call(call: CallbackQuery) -> bool:
    return call.data == "dismiss_msg"

@bot.callback_query_handler(func=is_dismiss_call)
async def dismiss_handler(call: CallbackQuery):
    try:
        await bot.delete_message(
            chat_id=call.message.chat.id,
            message_id=call.message.message_id
        )
    except Exception as e:
        logging.error(f"Failed to dismiss message: {e}")
    finally:
        await bot.answer_callback_query(call.id)

async def set_commands_list():
    all_commands = [
        CMD_LAST_EVENT,
        CMD_STATUS,
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
