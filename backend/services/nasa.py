import httpx
import logging
from datetime import date, datetime
from typing import Optional
from config import settings

logger = logging.getLogger(__name__)


class NASAService:
   
    BASE_URL = settings.NASA_API_BASE

    async def get_ghi(
        self,
        lat: float,
        lng: float,
        target_date: date,
    ) -> Optional[float]:
       
        date_str = target_date.strftime("%Y%m%d")
        params = {
            "parameters": settings.NASA_PARAMETER,
            "community": settings.NASA_COMMUNITY,
            "longitude": round(lng, 4),
            "latitude": round(lat, 4),
            "start": date_str,
            "end": date_str,
            "format": "JSON",
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(self.BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()

            ghi_data = (
                data
                .get("properties", {})
                .get("parameter", {})
                .get(settings.NASA_PARAMETER, {})
            )

            value = ghi_data.get(date_str)

            # NASA returns -999 for missing/fill values
            if value is None or float(value) < 0:
                logger.warning(f"NASA GHI missing for ({lat}, {lng}) on {date_str}")
                return None

            return round(float(value), 4)

        except httpx.HTTPStatusError as e:
            logger.error(f"NASA API HTTP error: {e.response.status_code} — {e}")
            return None
        except Exception as e:
            logger.error(f"NASA API unexpected error: {e}")
            return None

    async def get_ghi_range(
        self,
        lat: float,
        lng: float,
        start: date,
        end: date,
    ) -> dict[str, Optional[float]]:
       
        params = {
            "parameters": settings.NASA_PARAMETER,
            "community": settings.NASA_COMMUNITY,
            "longitude": round(lng, 4),
            "latitude": round(lat, 4),
            "start": start.strftime("%Y%m%d"),
            "end": end.strftime("%Y%m%d"),
            "format": "JSON",
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(self.BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()

            raw = (
                data
                .get("properties", {})
                .get("parameter", {})
                .get(settings.NASA_PARAMETER, {})
            )

            return {
                k: round(float(v), 4) if float(v) > 0 else None
                for k, v in raw.items()
            }

        except Exception as e:
            logger.error(f"NASA API range error: {e}")
            return {}


nasa_service = NASAService()
