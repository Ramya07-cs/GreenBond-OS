import logging
from typing import Optional
from config import settings

logger = logging.getLogger(__name__)


class AlertService:
    # ── SMS ───────────────────────────────────────────────────────────────────

    def send_sms(self, to: str, body: str) -> bool:
        """Send SMS via Twilio. Returns True on success."""
        try:
            from twilio.rest import Client
            client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            message = client.messages.create(
                to=to,
                from_=settings.TWILIO_FROM_NUMBER,
                body=body,
            )
            logger.info(f"[SMS] Sent to {to}: SID={message.sid}")
            return True
        except Exception as e:
            logger.error(f"[SMS] Failed to {to}: {e}")
            return False

    # ── Email ─────────────────────────────────────────────────────────────────

    def send_email(self, to: str, subject: str, html_body: str) -> bool:
        """Send email via SendGrid. Returns True on success."""
        try:
            import sendgrid
            from sendgrid.helpers.mail import Mail
            sg = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
            message = Mail(
                from_email=settings.ALERT_FROM_EMAIL,
                to_emails=to,
                subject=subject,
                html_content=html_body,
            )
            response = sg.send(message)
            logger.info(f"[Email] Sent to {to}: status={response.status_code}")
            return response.status_code in (200, 202)
        except Exception as e:
            logger.error(f"[Email] Failed to {to}: {e}")
            return False

    # ── Alert Templates ───────────────────────────────────────────────────────

    def send_penalty_alert(
        self,
        bond_id: str,
        bond_name: str,
        previous_rate: float,
        new_rate: float,
        consecutive_days: int,
        tx_hash: Optional[str],
        issuer_email: Optional[str],
        issuer_phone: Optional[str],
    ) -> dict:
        """Send full penalty notification via SMS + Email."""
        results = {}

        subject = f"PENALTY TRIGGERED — {bond_name} ({bond_id})"
        sms_body = (
            f"GreenBond Alert: {bond_name} ({bond_id})\n"
            f"Rate hiked {previous_rate}% → {new_rate}% after "
            f"{consecutive_days} consecutive days below PR threshold.\n"
            f"TX: {tx_hash or 'pending'}"
        )
        html_body = f"""
        <div style="font-family:monospace;background:#0a0a0a;color:#e8f0fe;padding:24px;border-radius:8px">
          <h2 style="color:#FF4444">⚠️ PENALTY TRIGGERED</h2>
          <p><strong>Bond:</strong> {bond_name} ({bond_id})</p>
          <p><strong>Rate Change:</strong>
            <span style="text-decoration:line-through;color:#888">{previous_rate}%</span>
            → <span style="color:#FF4444;font-weight:bold">{new_rate}%</span>
          </p>
          <p><strong>Trigger:</strong> {consecutive_days} consecutive days below 75% PR threshold</p>
          {"<p><strong>Blockchain TX:</strong> " + tx_hash + "</p>" if tx_hash else ""}
          <p style="color:#888;font-size:12px">
            Verify on Polygonscan:
            <a href="https://polygonscan.com/tx/{tx_hash}" style="color:#2196F3">
              polygonscan.com/tx/{tx_hash}
            </a>
          </p>
        </div>
        """

        if issuer_email:
            results["email"] = self.send_email(issuer_email, subject, html_body)
        if issuer_phone:
            results["sms"] = self.send_sms(issuer_phone, sms_body)

        return results

    def send_recovery_alert(
        self,
        bond_id: str,
        bond_name: str,
        previous_rate: float,
        base_rate: float,
        consecutive_days: int,
        tx_hash: Optional[str],
        issuer_email: Optional[str],
        issuer_phone: Optional[str],
    ) -> dict:
        """Send recovery confirmation via Email."""
        results = {}

        subject = f"RECOVERY CONFIRMED — {bond_name} ({bond_id})"
        html_body = f"""
        <div style="font-family:monospace;background:#0a0a0a;color:#e8f0fe;padding:24px;border-radius:8px">
          <h2 style="color:#00E676">✅ RECOVERY CONFIRMED</h2>
          <p><strong>Bond:</strong> {bond_name} ({bond_id})</p>
          <p><strong>Rate Restored:</strong>
            <span style="text-decoration:line-through;color:#FF4444">{previous_rate}%</span>
            → <span style="color:#00E676;font-weight:bold">{base_rate}%</span>
          </p>
          <p><strong>Recovery:</strong> {consecutive_days} consecutive compliant days achieved</p>
          {"<p><strong>Blockchain TX:</strong> " + tx_hash + "</p>" if tx_hash else ""}
        </div>
        """

        if issuer_email:
            results["email"] = self.send_email(issuer_email, subject, html_body)

        return results

    def send_missing_data_alert(
        self,
        bond_id: str,
        bond_name: str,
        missing_date: str,
        consecutive_missing: int,
        issuer_email: Optional[str],
        issuer_phone: Optional[str],
    ) -> dict:

        results = {}

        subject = f"📋 MISSING DATA — {bond_name} ({bond_id}) — {missing_date}"
        html_body = f"""
        <div style="font-family:monospace;background:#0a0a0a;color:#e8f0fe;padding:24px;border-radius:8px">
          <h2 style="color:#FFB300">📋 MISSING PRODUCTION DATA</h2>
          <p><strong>Bond:</strong> {bond_name} ({bond_id})</p>
          <p><strong>Missing Date:</strong> {missing_date}</p>
          <p><strong>Consecutive Missing Days:</strong> {consecutive_missing}</p>
          <p style="color:#FFB300">
            ⚠️ This day has been logged as <strong>IGNORED</strong> and will not
            affect your penalty streak. However, please submit production data
            promptly to maintain a complete audit trail.
          </p>
          <p style="color:#888;font-size:12px">
            Submit data at: <a href="https://greenbond.io/data-entry" style="color:#2196F3">
              greenbond.io/data-entry
            </a>
          </p>
        </div>
        """
        sms_body = (
            f"GreenBond: Missing production data for {bond_name} ({bond_id}) "
            f"on {missing_date}. {consecutive_missing} day(s) missing. "
            f"Please submit at greenbond.io/data-entry"
        )

        if issuer_email:
            results["email"] = self.send_email(issuer_email, subject, html_body)

        # Escalate to SMS only if 3+ consecutive missing days
        if issuer_phone and consecutive_missing >= 3:
            results["sms"] = self.send_sms(issuer_phone, sms_body)

        return results

    def send_maturity_alert(
        self,
        bond_id: str,
        bond_name: str,
        maturity_date: str,
        final_avg_pr: Optional[float],
        total_penalty_days: int,
        issuer_email: Optional[str],
        issuer_phone: Optional[str],
    ) -> dict:
    
        results = {}
        pr_display = f"{round(final_avg_pr * 100, 1)}%" if final_avg_pr else "N/A"

        subject = f"🏁 BOND MATURED — {bond_name} ({bond_id})"
        html_body = f"""
        <div style="font-family:monospace;background:#0a0a0a;color:#e8f0fe;padding:24px;border-radius:8px">
          <h2 style="color:#00BCD4">🏁 BOND MATURED</h2>
          <p><strong>Bond:</strong> {bond_name} ({bond_id})</p>
          <p><strong>Maturity Date:</strong> {maturity_date}</p>
          <hr style="border-color:#263238;margin:16px 0"/>
          <h3 style="color:#90A4AE">Final Performance Summary</h3>
          <p><strong>Average PR (lifetime):</strong> {pr_display}</p>
          <p><strong>Total Penalty Days:</strong> {total_penalty_days}</p>
          <p style="color:#00E676;margin-top:16px">
            ✅ All audit records have been archived and are permanently
            available on the Polygon blockchain.
          </p>
        </div>
        """
        sms_body = (
            f"GreenBond: {bond_name} ({bond_id}) has matured on {maturity_date}. "
            f"Avg PR: {pr_display}. All records archived."
        )

        if issuer_email:
            results["email"] = self.send_email(issuer_email, subject, html_body)
        if issuer_phone:
            results["sms"] = self.send_sms(issuer_phone, sms_body)

        return results


alert_service = AlertService()
