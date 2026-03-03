import httpx
import logging
from datetime import date
from typing import Optional
from config import settings
from redis_client import redis_client

logger = logging.getLogger(__name__)

NASA_GHI_TTL = 86400  # 24 hours — past GHI data never changes


class NASAService:
    """
    Client for the NASA POWER API.
    Returns daily GHI (Global Horizontal Irradiance) in kWh/m²
    for a given GPS coordinate and date range.

    API Docs: https://power.larc.nasa.gov/docs/services/api/
    No API key required. Free and globally available.
    """

    BASE_URL = settings.NASA_API_BASE

    async def get_ghi(
        self,
        lat: float,
        lng: float,
        target_date: date,
        bond_id: str = "unknown",   # Used as part of the cache key
    ) -> Optional[float]:
        """
        Fetch GHI for a single date and coordinate.
        Checks Redis cache first. On miss, fetches from NASA and caches result.
        Returns kWh/m² or None if unavailable.
        """
        date_str = target_date.strftime("%Y%m%d")
        cache_key = f"nasa:ghi:{bond_id}:{date_str}"

        # ── 1. Check cache ────────────────────────────────────────────────────
        try:
            cached = redis_client.get(cache_key)
            if cached is not None:
                logger.debug(f"[NASA cache hit] {cache_key} → {cached}")
                return float(cached)
        except Exception as e:
            # Cache failure should never block a real fetch
            logger.warning(f"[NASA] Redis read failed, falling through to API: {e}")

        # ── 2. Fetch from NASA ────────────────────────────────────────────────
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
                logger.warning(f"[NASA] GHI missing for ({lat}, {lng}) on {date_str}")
                return None

            ghi = round(float(value), 4)

            # ── 3. Write to cache ─────────────────────────────────────────────
            try:
                redis_client.setex(cache_key, NASA_GHI_TTL, ghi)
                logger.debug(f"[NASA] Cached {cache_key} = {ghi}")
            except Exception as e:
                logger.warning(f"[NASA] Redis write failed: {e}")

            return ghi

        except httpx.HTTPStatusError as e:
            logger.error(f"[NASA] HTTP error: {e.response.status_code} — {e}")
            return None
        except Exception as e:
            logger.error(f"[NASA] Unexpected error: {e}")
            return None

    async def get_ghi_range(
        self,
        lat: float,
        lng: float,
        start: date,
        end: date,
        bond_id: str = "unknown",
    ) -> dict[str, Optional[float]]:
        """
        Fetch GHI for a date range. Returns {date_str: ghi_value} dict.
        Checks cache for each date individually before deciding to call NASA.
        """
        from datetime import timedelta

        # Build list of dates in range
        all_dates = []
        current = start
        while current <= end:
            all_dates.append(current)
            current += timedelta(days=1)

        # Check cache for each date
        results = {}
        dates_to_fetch = []

        for d in all_dates:
            date_str = d.strftime("%Y%m%d")
            cache_key = f"nasa:ghi:{bond_id}:{date_str}"
            try:
                cached = redis_client.get(cache_key)
                if cached is not None:
                    results[date_str] = float(cached)
                else:
                    dates_to_fetch.append(d)
            except Exception:
                dates_to_fetch.append(d)

        if not dates_to_fetch:
            return results  # Full cache hit

        # Fetch only the uncached range from NASA
        fetch_start = min(dates_to_fetch)
        fetch_end = max(dates_to_fetch)

        params = {
            "parameters": settings.NASA_PARAMETER,
            "community": settings.NASA_COMMUNITY,
            "longitude": round(lng, 4),
            "latitude": round(lat, 4),
            "start": fetch_start.strftime("%Y%m%d"),
            "end": fetch_end.strftime("%Y%m%d"),
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

            for date_str, val in raw.items():
                ghi = round(float(val), 4) if float(val) > 0 else None
                results[date_str] = ghi
                # Cache each date individually
                if ghi is not None:
                    try:
                        redis_client.setex(
                            f"nasa:ghi:{bond_id}:{date_str}",
                            NASA_GHI_TTL,
                            ghi,
                        )
                    except Exception:
                        pass

        except Exception as e:
            logger.error(f"[NASA] Range fetch error: {e}")

        return results


nasa_service = NASAService()
