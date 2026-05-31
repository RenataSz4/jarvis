from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from jarvis import ask_jarvis

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    text: str

@app.post("/ask")
async def ask(request: AskRequest):
    response = ask_jarvis(request.text)
    return {"response": response}