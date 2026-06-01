import os
import re
import tempfile
import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
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

SFX_NAMES = {"powerup", "shutdown", "repulsor", "suit_land", "beeping"}
SFX_TAG = re.compile(r"\[sfx:(\w+)(?::(\d+))?\]", re.IGNORECASE)

def split_sfx(text):
    """Pull every [sfx:name] / [sfx:name:ms] cue out of the reply.

    Returns (spoken_text, cues) where cues is a list of {"name", "delay"} in
    order (delay in ms, default 0). ALL tags are stripped (valid or not) so
    none are ever sent to text-to-speech.
    """
    cues = []
    for m in SFX_TAG.finditer(text):
        name = m.group(1).lower()
        if name in SFX_NAMES:
            cues.append({"name": name, "delay": int(m.group(2)) if m.group(2) else 0})
    spoken = SFX_TAG.sub("", text)               # remove every tag
    spoken = re.sub(r"\s{2,}", " ", spoken).strip()  # tidy gaps the tags left
    return spoken, cues

@app.post("/ask")
async def ask(request: AskRequest):
    response = ask_jarvis(request.text)
    spoken, sfx = split_sfx(response)
    return {"response": spoken, "sfx": sfx}

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


WHISPER_SIZE = "base"
WHISPER_LANG = "en"
_whisper = None
def get_whisper():
    """Load the model once, then reuse it."""
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel
        _whisper = WhisperModel(WHISPER_SIZE, device="cpu", compute_type="int8")
    return _whisper

@app.on_event("startup")
def warm_whisper():
    """Load Whisper at boot so the first /transcribe is already warm.
    The first ever startup downloads the model (~145 MB for 'base'); after
    that it loads from cache. Watch this step in the uvicorn terminal."""
    print(f"[whisper] loading model '{WHISPER_SIZE}' ...")
    get_whisper()
    print("[whisper] model ready")

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    audio = await file.read()
    if not audio:
        raise HTTPException(400, "Empty audio")

    # faster-whisper reads from a path, so buffer the upload to a temp file.
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(audio)
        path = tmp.name

    try:
        # vad_filter trims silence/noise before transcribing -> cleaner text.
        segments, _ = get_whisper().transcribe(path, language=WHISPER_LANG, vad_filter=True)
        text = "".join(seg.text for seg in segments).strip()
    finally:
        os.remove(path)

    return {"text": text}


SFX_DIR = os.path.join(os.path.dirname(__file__), "sfx")
app.mount("/sfx", StaticFiles(directory=SFX_DIR), name="sfx")

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")