import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select

from app.auth import current_user, seed_demo_users
from app.database import SessionLocal, engine
from app.db_setup import init_db
from app.models import Employee
from app.routes import agent, employees, insights, pages, payroll
from app.routes import auth as auth_routes
from app.services.employees import DuplicateEmailError, NotFoundError
from app.services.payroll import PayrollError

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(engine)
    with SessionLocal() as db:
        seed_demo_users(db)
    # Convenience for ephemeral deploys: seed an empty DB on boot when AUTO_SEED=1.
    if os.getenv("AUTO_SEED") == "1":
        with SessionLocal() as db:
            if not db.scalar(select(func.count(Employee.id))):
                from app.seed import seed

                seed(db, count=int(os.getenv("SEED_COUNT", "10000")))
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="ACME Salary Management", version="1.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(NotFoundError)
    async def _not_found(_: Request, exc: NotFoundError):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(DuplicateEmailError)
    async def _duplicate(_: Request, exc: DuplicateEmailError):
        return JSONResponse(status_code=409, content={"detail": f"Email already in use: {exc}"})

    @app.exception_handler(PayrollError)
    async def _payroll(_: Request, exc: PayrollError):
        return JSONResponse(status_code=exc.status, content={"detail": str(exc)})

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    # Everything except health and login needs a signed-in user; write endpoints add a role check.
    signed_in = [Depends(current_user)]
    app.include_router(auth_routes.router)
    app.include_router(employees.router, dependencies=signed_in)
    app.include_router(insights.router, dependencies=signed_in)
    app.include_router(pages.router, dependencies=signed_in)
    app.include_router(payroll.router, dependencies=signed_in)
    app.include_router(agent.router, dependencies=signed_in)

    # Single-service deploy: serve the built React app from the same origin.
    if FRONTEND_DIST.is_dir():
        app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

    return app


app = create_app()
