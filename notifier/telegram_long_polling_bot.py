# https://github.com/eternnoir/pyTelegramBotAPI
import datetime

from telebot.async_telebot import AsyncTeleBot
from middlewares.chat_id_middleware import RestrictChatMiddleware
from telebot.types import (
    Message,
    BotCommand,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton
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

CMD_LAST_EVENT = BotCommand("lastevent", "See how many days passed since the last event")
CMD_STATUS = BotCommand("status", "Check the system status")
CMD_STATUS_MENU = BotCommand("menu", "Show a menu")

bot = AsyncTeleBot(ConfigVariables.TELEGRAM_TOKEN)

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

@bot.message_handler(commands=[CMD_LAST_EVENT.command])
async def send_last_schiss(message: telebot.types.Message):
    message_to_send = get_last_schiss_message()
    await bot.send_message(message.chat.id, message_to_send, parse_mode="MarkdownV2")

@bot.message_handler(commands=[CMD_STATUS_MENU.command])
async def show_menu(message: Message):
    markup = InlineKeyboardMarkup()

    markup.add(InlineKeyboardButton(text="Last Event", callback_data="cmd_lastevent"))
    markup.add(InlineKeyboardButton(text="Status", callback_data="cmd_status"))

    await bot.send_message(message.chat.id, "Select an option", reply_markup=markup)

@bot.callback_query_handler(func=lambda call: True)
async def handle_buttons(call: CallbackQuery):
    response_text = "Unknown command"

    if call.data == "cmd_lastevent":
        response_text = get_last_schiss_message()
    elif call.data == "cmd_status":
        response_text = "Status"

    await bot.answer_callback_query(
        callback_query_id=call.id,
        text=response_text,
        show_alert=True
    )

async def set_commands_list():
    all_commands = [
        CMD_LAST_EVENT,
        CMD_STATUS,
        CMD_STATUS_MENU
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
