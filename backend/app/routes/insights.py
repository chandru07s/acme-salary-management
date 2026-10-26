from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import insights as svc

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.get("")
def overview(db: Session = Depends(get_db)):
    """Everything the dashboard needs in one round-trip (one DB scan)."""
    return svc.overview(db)
