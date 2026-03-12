import logging
from dataclasses import dataclass
from typing import Optional
from config import settings

logger = logging.getLogger(__name__)


@dataclass
class PenaltyDecision:
    verdict: str                    # COMPLIANT / PENALTY / IGNORED / RECOVERY
    rate_changed: bool
    previous_rate: float
    new_rate: float
    consecutive_penalty: int
    consecutive_compliant: int
    trigger_type: Optional[str]     # "PENALTY_TRIGGER" / "RECOVERY_TRIGGER" / None
    message: str


class PenaltyEngine:
    def evaluate(
        self,
        pr_verdict: str,            # COMPLIANT / PENALTY / IGNORED
        consecutive_penalty: int,   # current streak value from DB
        consecutive_compliant: int,
        current_rate: float,
        base_rate: float,
    ) -> PenaltyDecision:

        new_consecutive_penalty = consecutive_penalty
        new_consecutive_compliant = consecutive_compliant

        # Update streaks (IGNORED days don't change either streak)
        if pr_verdict == "PENALTY":
            new_consecutive_penalty = consecutive_penalty + 1
            new_consecutive_compliant = 0
        elif pr_verdict == "COMPLIANT":
            new_consecutive_compliant = consecutive_compliant + 1
            new_consecutive_penalty = 0
        # IGNORED: leave both streaks unchanged
        # Check for penalty trigger
        if (
            pr_verdict == "PENALTY"
            and new_consecutive_penalty >= settings.CONSECUTIVE_PENALTY_DAYS
            and current_rate <= base_rate          # Only if not already penalised
        ):
            new_rate = round(base_rate * settings.PENALTY_RATE_MULTIPLIER, 3)
            logger.info(
                f"PENALTY TRIGGERED: {new_consecutive_penalty} consecutive days "
                f"below threshold. Rate: {current_rate}% → {new_rate}%"
            )
            return PenaltyDecision(
                verdict="PENALTY",
                rate_changed=True,
                previous_rate=current_rate,
                new_rate=new_rate,
                consecutive_penalty=new_consecutive_penalty,
                consecutive_compliant=new_consecutive_compliant,
                trigger_type="PENALTY_TRIGGER",
                message=(
                    f"Rate hiked from {current_rate}% to {new_rate}% after "
                    f"{new_consecutive_penalty} consecutive days below {settings.PR_THRESHOLD} PR threshold."
                ),
            )

        # Check for recovery trigger
        if (
            pr_verdict == "COMPLIANT"
            and new_consecutive_compliant >= settings.CONSECUTIVE_RECOVERY_DAYS
            and current_rate > base_rate           # Only if currently penalised
        ):
            logger.info(
                f"RECOVERY TRIGGERED: {new_consecutive_compliant} consecutive compliant days. "
                f"Rate: {current_rate}% → {base_rate}%"
            )
            return PenaltyDecision(
                verdict="RECOVERY",
                rate_changed=True,
                previous_rate=current_rate,
                new_rate=base_rate,
                consecutive_penalty=new_consecutive_penalty,
                consecutive_compliant=new_consecutive_compliant,
                trigger_type="RECOVERY_TRIGGER",
                message=(
                    f"Rate restored to {base_rate}% after "
                    f"{new_consecutive_compliant} consecutive compliant days."
                ),
            )

        # No rate change
        return PenaltyDecision(
            verdict=pr_verdict,
            rate_changed=False,
            previous_rate=current_rate,
            new_rate=current_rate,
            consecutive_penalty=new_consecutive_penalty,
            consecutive_compliant=new_consecutive_compliant,
            trigger_type=None,
            message=f"No rate change. Verdict: {pr_verdict}.",
        )


penalty_engine = PenaltyEngine()