import logging

import telebot
from telebot.asyncio_handler_backends import BaseMiddleware, CancelUpdate


class RestrictChatMiddleware(BaseMiddleware):
    def __init__(self, allowed_ids: list[int]):
        super().__init__()
        self.allowed_ids: list[int] = allowed_ids
        self.update_types = ['message', 'callback_query']

    async def pre_process(self, message, data):
        if isinstance(message, telebot.types.Message):
            incoming_chat_id = message.chat.id
        elif isinstance(message, telebot.types.CallbackQuery):
            incoming_chat_id = message.message.chat.id
        else:
            logging.warning("Unknown message type: %s")
            return CancelUpdate()

        if incoming_chat_id not in self.allowed_ids:
            logging.warning("Unauthorized message from chat id %s", incoming_chat_id)
            return CancelUpdate()
        return None

    async def post_process(self, message, data, exception):
        pass