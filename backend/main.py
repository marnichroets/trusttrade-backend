import logging
from fastapi import FastAPI

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/ping")
def ping():
    return {"status": "ok"}

@app.get("/ping-clean")
def ping_clean():
    return {"status": "clean"}
