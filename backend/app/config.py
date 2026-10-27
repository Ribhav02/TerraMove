from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "TerraMove"
    API_V1_STR: str = "/api/v1"
    
    # Data Paths
    PROCESSED_DATA_DIR: Path = PROJECT_ROOT / "data" / "processed"
    SECTOR17_BOUNDARY_PATH: Path = PROCESSED_DATA_DIR / "sector17_boundary.geojson"
    PEDESTRIAN_NETWORK_PATH: Path = PROCESSED_DATA_DIR / "sector17_pedestrian_network.geojson"
    BUILDINGS_PATH: Path = PROCESSED_DATA_DIR / "sector17_buildings.geojson"
    PARKING_PATH: Path = PROCESSED_DATA_DIR / "parking_sector17_validated.json"
    REPORTS_DIR: Path = PROJECT_ROOT / "data" / "reports"

    # Supabase (Optional env vars)
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    DATABASE_URL: str = ""

    # Smart Parking & Community Security (Backend only)
    OPERATOR_SECRET_KEY: str = ""
    IOT_SECRET_KEY: str = ""
    MODERATOR_SECRET_KEY: str = ""

    # Defaults
    DEFAULT_SECTOR_LAT: float = 30.7410
    DEFAULT_SECTOR_LON: float = 76.7820

settings = Settings()
