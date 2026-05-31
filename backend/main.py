import os
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from jarvis import ask_jarvis

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ELEVEN_KEY = os.getenv("ELEVENLABS_API_KEY")
VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
ELEVEN_URL = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"

class AskRequest(BaseModel):
    text: str

class TTSRequest(BaseModel):
    text: str

@app.post("/ask")
async def ask(request: AskRequest):
    response = ask_jarvis(request.text)
    return {"response": response}

@app.post("/tts")
async def tts(request: TTSRequest):
    if not ELEVEN_KEY:
        raise HTTPException(500, "ELEVENLABS_API_KEY not set in the backend")
    if not request.text.strip():
        raise HTTPException(400, "Empty text")

    payload = {
        "text": request.text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.4, "similarity_boost": 0.8},
    }
    headers = {
        "xi-api-key": ELEVEN_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(ELEVEN_URL, json=payload, headers=headers)

    if resp.status_code != 200:
        raise HTTPException(resp.status_code, f"ElevenLabs error: {resp.text}")

    return Response(content=resp.content, media_type="audio/mpeg")