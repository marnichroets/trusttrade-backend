from fastapi import FastAPI

app = FastAPI()

@app.get("/ping-clean")
def ping_clean():
    return {"status": "clean"}
