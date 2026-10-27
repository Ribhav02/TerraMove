from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.api.health import router as health_router
from backend.app.api.sectors import router as sectors_router
from backend.app.api.parking import router as parking_router
from backend.app.api.weather import router as weather_router
from backend.app.api.routes import router as routes_router
from backend.app.api.reports import router as reports_router
from backend.app.api.destinations import router as destinations_router
from backend.app.api.community import router as community_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Smart & Sustainable Mobility Platform for Sector 17, Chandigarh",
    version="1.0.0",
    docs_url="/docs",
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register versioned API routers
app.include_router(health_router, prefix=settings.API_V1_STR, tags=["Health"])
app.include_router(sectors_router, prefix=settings.API_V1_STR, tags=["Sectors"])
app.include_router(parking_router, prefix=settings.API_V1_STR, tags=["Parking"])
app.include_router(weather_router, prefix=settings.API_V1_STR, tags=["Weather"])
app.include_router(routes_router, prefix=settings.API_V1_STR, tags=["Routes"])
app.include_router(reports_router, prefix=settings.API_V1_STR, tags=["Reports"])
app.include_router(destinations_router, prefix=settings.API_V1_STR, tags=["Destinations"])
app.include_router(community_router, prefix=settings.API_V1_STR, tags=["Community"])

@app.get("/")
async def root():
    return {
        "app": "TerraMove AI Mobility Engine",
        "pilot_area": "Sector 17, Chandigarh, India",
        "api_v1_docs": "/docs",
        "status": "online"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)

