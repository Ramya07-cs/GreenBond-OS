import logging
from dataclasses import dataclass
from typing import Optional
from config import settings

logger = logging.getLogger(__name__)


@dataclass
class PRResult:
    actual_kwh: float
    nasa_ghi: float
    capacity_kw: float
    expected_kwh: float
    actual_ghi: float
    pr: float
    is_compliant: bool
    verdict: str        # COMPLIANT / PENALTY / IGNORED
    details: dict


class PREngine:
    """
    Performance Ratio calculator.

    Formula:
        expected_kwh = NASA_GHI × capacity_kW × performance_factor
        actual_ghi   = actual_kwh / (capacity_kW × performance_factor)
        PR           = actual_ghi / NASA_GHI

    Where performance_factor accounts for system losses (inverter, wiring, temp, etc.)
    Industry standard is 0.75–0.85. We use 0.80 as a conservative baseline.
    """

    def calculate(
        self,
        actual_kwh: Optional[float],
        nasa_ghi: Optional[float],
        capacity_kw: float,
    ) -> PRResult:
        """
        Calculate PR from actual production, NASA GHI, and system capacity.
        Returns PRResult with full audit trail.
        """

        # Handle missing data — day is IGNORED, not penalised
        if actual_kwh is None or nasa_ghi is None:
            return PRResult(
                actual_kwh=actual_kwh or 0,
                nasa_ghi=nasa_ghi or 0,
                capacity_kw=capacity_kw,
                expected_kwh=0,
                actual_ghi=0,
                pr=0,
                is_compliant=True,   # Missing = not a violation
                verdict="IGNORED",
                details={
                    "reason": "Missing production data or NASA GHI",
                    "threshold": settings.PR_THRESHOLD,
                    "performance_factor": settings.PERFORMANCE_FACTOR,
                },
            )

        if nasa_ghi <= 0 or capacity_kw <= 0:
            logger.error(f"Invalid inputs: nasa_ghi={nasa_ghi}, capacity_kw={capacity_kw}")
            return PRResult(
                actual_kwh=actual_kwh,
                nasa_ghi=nasa_ghi,
                capacity_kw=capacity_kw,
                expected_kwh=0,
                actual_ghi=0,
                pr=0,
                is_compliant=True,
                verdict="IGNORED",
                details={"reason": "Invalid GHI or capacity value"},
            )

        # Core calculation
        expected_kwh = nasa_ghi * capacity_kw * settings.PERFORMANCE_FACTOR
        actual_ghi = actual_kwh / (capacity_kw * settings.PERFORMANCE_FACTOR)
        pr = round(actual_ghi / nasa_ghi, 4)

        is_compliant = pr >= settings.PR_THRESHOLD
        verdict = "COMPLIANT" if is_compliant else "PENALTY"

        logger.debug(
            f"PR Calc: actual={actual_kwh}kWh, nasa_ghi={nasa_ghi}, "
            f"capacity={capacity_kw}kW → PR={pr:.4f} [{verdict}]"
        )

        return PRResult(
            actual_kwh=actual_kwh,
            nasa_ghi=nasa_ghi,
            capacity_kw=capacity_kw,
            expected_kwh=round(expected_kwh, 2),
            actual_ghi=round(actual_ghi, 4),
            pr=pr,
            is_compliant=is_compliant,
            verdict=verdict,
            details={
                "threshold": settings.PR_THRESHOLD,
                "performance_factor": settings.PERFORMANCE_FACTOR,
                "formula": f"PR = {round(actual_ghi,4)} / {nasa_ghi} = {pr}",
                "expected_kwh": round(expected_kwh, 2),
                "deficit_kwh": round(max(0, expected_kwh - actual_kwh), 2),
            },
        )


pr_engine = PREngine()
