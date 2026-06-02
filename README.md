# J.A.R.V.I.S. Voice Assistant

A voice-driven Iron Man assistant. Speak to it in the browser; it transcribes your
voice with Whisper, answers in character through Claude, speaks the reply back with
ElevenLabs, and triggers Iron Man sound effects. A FastAPI backend powers everything
and also serves the web frontend.

## Setup & Run

1. **Install dependencies** (from `backend/`):

   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate        # Windows
   # source venv/bin/activate   # macOS/Linux
   pip install -r requirements.txt
   ```

2. **Add API keys.** Create `backend/.env`:

   ```env
   # Required — the brain
   ANTHROPIC_API_KEY=sk-ant-...
   MODEL=claude-haiku-4-5

   # Optional — the voice (text-only still works without it)
   ELEVENLABS_API_KEY=sk_...
   ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
   ```

   - Get an Anthropic key at https://console.anthropic.com/settings/keys
   - Get an ElevenLabs key at https://elevenlabs.io/app/settings/api-keys

3. **Run the server** (from `backend/`):

   ```bash
   uvicorn main:app --reload
   ```

   The first launch downloads the Whisper model (~145 MB); watch the terminal for
   `[whisper] model ready`.

4. **Open the app** at http://localhost:8000, press the mic, and talk to Jarvis.
