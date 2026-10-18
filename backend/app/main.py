from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.routes import dashboard, uploads
from app.utils.config import settings

app = FastAPI(title="Refraksi REST API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        v.strip() for v in settings().allowed_origins.split(",") if v.strip()
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    length = request.headers.get("content-length")
    if length:
        try:
            if int(length) > settings().max_upload_bytes + 1024 * 1024:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "File terlalu besar, maksimal 15 MB."},
                )
        except ValueError:
            return JSONResponse(
                status_code=400, content={"detail": "Ukuran permintaan tidak valid."}
            )
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(RequestValidationError)
async def input_error(request, exc):
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Input tidak valid. Periksa tanggal, rentang filter, field wajib, dan nilai uang (maksimal dua desimal).",
            "fields": [".".join(map(str, error["loc"])) for error in exc.errors()],
        },
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "database_configured": bool(
            settings().supabase_url and settings().supabase_publishable_key
        ),
    }


app.include_router(dashboard.router)
app.include_router(uploads.router)
