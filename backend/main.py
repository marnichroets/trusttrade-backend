from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"status": "ok", "service": "trusttrade-backend"}

@app.get("/ping")
def ping():
    return {"status": "ok"}
