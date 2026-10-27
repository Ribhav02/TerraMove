import json
from fastapi import APIRouter, HTTPException
from backend.app.config import settings

router = APIRouter()

@router.get("/reports/summary")
async def get_reports_summary():
    report_json_path = settings.REPORTS_DIR / "validation_report.json"
    if not report_json_path.exists():
        raise HTTPException(status_code=404, detail="Validation report has not been generated.")

    with open(report_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return {
        "status": "success",
        "pilot_area": "Sector 17, Chandigarh, India",
        "validation_summary": data
    }

