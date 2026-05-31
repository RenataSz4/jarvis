import os
from dotenv import load_dotenv
from anthropic import Anthropic

load_dotenv()

KEY = os.getenv("ANTHROPIC_API_KEY")
MODEL = os.getenv("MODEL")

if not KEY:
    raise ValueError("The ANTHROPIC_API_KEY environment variable is not set.")

if not MODEL:
    raise ValueError("The MODEL environment variable is not set.")

client = Anthropic(api_key=KEY)

SYSTEM_PROMPT = "You are J.A.R.V.I.S., a helpful assistant that helps answer questions and solve problems. You need to talk formally and be concise. You should only answer the question that is asked and not provide any additional information. If you don't know the answer to a question, you should say that you don't know the answer. You should call the user 'sir'."

messages = []

def add_user_message(messages, text):
    user_message = {'role': 'user', 'content': text}
    messages.append(user_message)

def add_assistant_message(messages, text):
    assistant_message = {'role': 'assistant', 'content': text}
    messages.append(assistant_message)

def chat(messages):
    response = client.messages.create(
        model=MODEL,
        max_tokens=1000,
        messages=messages,
        system=SYSTEM_PROMPT
    )
    return response.content[0].text

def ask_jarvis(text):
    add_user_message(messages, text)
    response = chat(messages)
    add_assistant_message(messages, response)

    return response