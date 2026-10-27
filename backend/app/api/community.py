import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Header, UploadFile, File, status
from fastapi.responses import JSONResponse

from backend.app.schemas.community import (
    ReportCreateRequest,
    ReportModerateRequest,
    ReportResponse,
    ReportListResponse,
    HazardMarkerItem,
    PhotoUploadResponse
)
from backend.app.services.community_service import CommunityService
from backend.app.services.supabase_service import (
    DatabaseOperationException,
    DatabaseTableMissingException
)

logger = logging.getLogger("terramove.api.community")
router = APIRouter()
_community_service: Optional[CommunityService] = None


def get_community_service() -> CommunityService:
    global _community_service
    if _community_service is None:
        _community_service = CommunityService()
    return _community_service


@router.post("/community/upload-photo", response_model=PhotoUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_report_photo(file: UploadFile = File(...)):
    """
    Validates and securely uploads an image attachment to Supabase Storage.
    Enforces server-side MIME type and 5 MB size checks.
    """
    service = get_community_service()
    try:
        content = await file.read()
        res = service.validate_and_upload_photo(
            file_bytes=content,
            filename=file.filename or "attachment.jpg",
            content_type=file.content_type or "image/jpeg"
        )
        return PhotoUploadResponse(
            photo_url=res["photo_url"],
            filename=res["filename"],
            size_bytes=res["size_bytes"],
            content_type=res["content_type"]
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except DatabaseOperationException as doe:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Storage error: {str(doe)}")
    except Exception as e:
        logger.error(f"Unexpected error during photo upload: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process image: {str(e)}")


@router.post("/community/reports", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def submit_citizen_report(payload: ReportCreateRequest):
    """
    Submits a new citizen issue report for Sector 17, Chandigarh.
    Persists report in Supabase with status='submitted'.
    Ordinary users cannot mark reports as verified or resolved.
    """
    service = get_community_service()
    try:
        record = service.submit_report(payload)
        return record
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except DatabaseTableMissingException as dtme:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Database setup required: {str(dtme)}")
    except DatabaseOperationException as doe:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Database error: {str(doe)}")
    except Exception as e:
        logger.error(f"Unexpected error submitting report: {e}")
        raise HTTPException(status_code=500, detail=f"Submission error: {str(e)}")


@router.get("/community/reports", response_model=ReportListResponse)
async def list_citizen_reports(
    status: Optional[str] = Query(None, description="Filter by status ('submitted', 'under_review', 'verified', 'resolved', 'all')"),
    category: Optional[str] = Query(None, description="Filter by issue category"),
    verified_only: bool = Query(False, description="Quick toggle for verified hazards only"),
    limit: int = Query(50, ge=1, le=100, description="Pagination page size"),
    offset: int = Query(0, ge=0, description="Pagination offset")
):
    """
    Retrieves citizen reports with filtering and pagination.
    Protects privacy by masking internal session IDs in public listings.
    """
    service = get_community_service()
    try:
        reports, total = service.list_reports(
            status=status,
            category=category,
            verified_only=verified_only,
            limit=limit,
            offset=offset
        )
        verified_count = sum(1 for r in reports if r.get("status") == "verified")
        return ReportListResponse(
            count=len(reports),
            total=total,
            reports=reports,
            verified_hazards_count=verified_count
        )
    except DatabaseOperationException as doe:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Database query error: {str(doe)}")
    except Exception as e:
        logger.error(f"Error listing reports: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch reports: {str(e)}")


@router.get("/community/hazards", response_model=List[HazardMarkerItem])
async def get_active_hazards():
    """
    Retrieves active community hazards for map visualization overlay.
    Excludes rejected and resolved reports.
    """
    service = get_community_service()
    try:
        hazards = service.get_hazard_markers()
        return [
            HazardMarkerItem(
                id=h["id"],
                category=h["category"],
                category_display=h["category_display"],
                title=h["title"],
                severity=h["severity"],
                status=h["status"],
                latitude=h["latitude"],
                longitude=h["longitude"],
                photo_url=h.get("photo_url"),
                created_at=h["created_at"],
                is_active_hazard=h["status"] == "verified"
            )
            for h in hazards
        ]
    except Exception as e:
        logger.error(f"Error fetching hazards: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch active hazards: {str(e)}")


@router.get("/community/reports/{report_id}", response_model=ReportResponse)
async def get_citizen_report(report_id: str):
    """Retrieves full details for a single citizen report."""
    service = get_community_service()
    record = service.get_report_by_id(report_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Citizen report '{report_id}' not found.")
    return record


@router.post("/community/reports/{report_id}/moderate", response_model=ReportResponse)
async def moderate_citizen_report(
    report_id: str,
    payload: ReportModerateRequest,
    x_moderator_token: Optional[str] = Header(None, alias="X-Moderator-Token")
):
    """
    Moderation endpoint for authorized personnel to verify, resolve, or reject reports.
    Protected by server-side moderator secret.
    """
    service = get_community_service()
    try:
        updated = service.moderate_report(
            report_id=report_id,
            new_status=payload.status,
            moderator_notes=payload.moderator_notes,
            auth_token=x_moderator_token
        )
        return updated
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except DatabaseOperationException as doe:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Database error: {str(doe)}")
    except Exception as e:
        logger.error(f"Error moderating report {report_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Moderation error: {str(e)}")

