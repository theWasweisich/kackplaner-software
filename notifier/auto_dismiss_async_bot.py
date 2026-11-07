from typing import Union, Optional, List

from telebot import types
from telebot.async_telebot import AsyncTeleBot, REPLY_MARKUP_TYPES
from telebot.types import (
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    CallbackQuery
)

def get_dismiss_keyboard():
    callback_data = "dismiss_msg"
    markup = InlineKeyboardMarkup()
    markup.add(InlineKeyboardButton("Dismiss", callback_data=callback_data))
    return markup

class AutoDismissAsyncTeleBot(AsyncTeleBot):
    async def send_message(
            self, chat_id: Union[int, str], text: str,
            parse_mode: Optional[str]=None,
            entities: Optional[List[types.MessageEntity]]=None,
            disable_web_page_preview: Optional[bool]=None,
            disable_notification: Optional[bool]=None,
            protect_content: Optional[bool]=None,
            reply_to_message_id: Optional[int]=None,
            allow_sending_without_reply: Optional[bool]=None,
            reply_markup: Optional[REPLY_MARKUP_TYPES]=None,
            timeout: Optional[int]=None,
            message_thread_id: Optional[int]=None,
            reply_parameters: Optional[types.ReplyParameters]=None,
            link_preview_options: Optional[types.LinkPreviewOptions]=None,
            business_connection_id: Optional[str]=None,
            message_effect_id: Optional[str]=None,
            allow_paid_broadcast: Optional[bool]=None,
            direct_messages_topic_id: Optional[int]=None,
            suggested_post_parameters: Optional[types.SuggestedPostParameters]=None,
            receiver_user_id: Optional[int]=None,          # deprecated, for backward compatibility
            callback_query_id: Optional[str]=None,        # deprecated, for backward compatibility
            ephemeral_message_parameters: Optional[types.EphemeralMessageParameters]=None,
    ) -> types.Message:

        if reply_markup is None:
            reply_markup = get_dismiss_keyboard()

        return await super().send_message(chat_id, text, parse_mode, entities, disable_web_page_preview, disable_notification, protect_content, reply_to_message_id, allow_sending_without_reply, reply_markup, timeout, message_thread_id, reply_parameters, link_preview_options, business_connection_id, message_effect_id, allow_paid_broadcast, direct_messages_topic_id, suggested_post_parameters, receiver_user_id, callback_query_id, ephemeral_message_parameters)

    async def reply_to(self, message: types.Message, text: str, **kwargs) -> types.Message:
        if kwargs.get("reply_markup") is None:
            kwargs["reply_markup"] = get_dismiss_keyboard()

        return await super().reply_to(message, text, **kwargs)