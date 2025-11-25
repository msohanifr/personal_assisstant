# backend/mail/imap_sync.py
import imaplib
import logging
from datetime import timezone as dt_timezone
from email import message_from_bytes, policy
from email.utils import parsedate_to_datetime

from django.utils import timezone

from .models import EmailAccount, EmailMessage as EmailMessageModel

logger = logging.getLogger(__name__)


def _guess_imap_host(account: EmailAccount) -> str:
    """
    Pick a default IMAP host if the account.imap_server is empty.
    """
    if account.imap_server:
        return account.imap_server

    provider = (account.provider or "").lower()
    if provider == "gmail":
        return "imap.gmail.com"
    if provider == "outlook":
        # Outlook / Microsoft 365
        return "outlook.office365.com"
    if provider == "yahoo":
        return "imap.mail.yahoo.com"

    # Fallback for generic IMAP
    domain = account.email_address.split("@")[-1]
    return f"imap.{domain}"


def _guess_imap_port(account: EmailAccount) -> int:
    if account.imap_port:
        return account.imap_port
    return 993  # standard IMAPS


def _login_imap(account: EmailAccount) -> imaplib.IMAP4_SSL:
    """
    Open an IMAP connection and log in.

    NOTE: For Gmail/Outlook, you should use an app password or OAuth2.
    """
    host = _guess_imap_host(account)
    port = _guess_imap_port(account)

    username = account.username or account.email_address
    password = account.password

    logger.info(
        "imap_sync._login_imap: Connecting to host=%s port=%s for account id=%s email=%s",
        host,
        port,
        account.id,
        account.email_address,
    )

    if not password:
        raise RuntimeError(
            f"No password/app password configured for account {account.email_address}"
        )

    imap = imaplib.IMAP4_SSL(host, port)
    logger.debug(
        "imap_sync._login_imap: IMAP connection created for host=%s port=%s", host, port
    )

    typ, data = imap.login(username, password)
    if typ != "OK":
        logger.error("imap_sync._login_imap: Login failed: %s %s", typ, data)
        raise RuntimeError(f"IMAP login failed for {account.email_address}: {data}")

    logger.info(
        "imap_sync._login_imap: Logged into IMAP for account id=%s email=%s",
        account.id,
        account.email_address,
    )
    return imap


def _parse_message_date(msg) -> timezone.datetime:
    """
    Try to parse the email 'Date' header into an aware UTC datetime.

    Fixes:
      - Uses Python's datetime.timezone.utc instead of timezone.utc (removed in newer Django)
    """
    raw_date = msg.get("Date")
    if not raw_date:
        logger.debug("imap_sync._parse_message_date: No Date header found.")
        return timezone.now()

    try:
        dt = parsedate_to_datetime(raw_date)
        if dt is None:
            raise ValueError("parsedate_to_datetime returned None")

        # Ensure timezone-aware, defaulting to UTC if naive
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=dt_timezone.utc)

        # Normalize to UTC
        dt_utc = dt.astimezone(dt_timezone.utc)
        return dt_utc
    except Exception as exc:
        logger.warning(
            "imap_sync._parse_message_date: Failed to parse %r: %s",
            raw_date,
            exc,
        )
        # Fallback: now (UTC)
        return timezone.now().astimezone(dt_timezone.utc)


def _get_address_list(msg, header_name: str) -> str:
    """
    Return a comma-separated string of addresses from the given header.
    """
    values = msg.get_all(header_name, [])
    if not values:
        return ""
    return ", ".join(values)


def sync_imap_account(account: EmailAccount, limit: int = 100) -> int:
    """
    Fetch recent messages over IMAP for a given EmailAccount and store them
    as EmailMessage rows.

    Returns the number of newly imported messages.
    """
    if not account.is_active:
        logger.info(
            "imap_sync.sync_imap_account: Account id=%s is inactive; skipping.",
            account.id,
        )
        return 0

    logger.info(
        "imap_sync.sync_imap_account: Starting IMAP sync for account id=%s email=%s",
        account.id,
        account.email_address,
    )

    imap = _login_imap(account)

    try:
        # Select INBOX by default; can be parameterized later
        typ, data = imap.select("INBOX")
        if typ != "OK":
            logger.error(
                "imap_sync.sync_imap_account: Failed to select INBOX for account id=%s: %s %s",
                account.id,
                typ,
                data,
            )
            return 0

        # Search all messages; we then slice to get latest N
        typ, search_data = imap.search(None, "ALL")
        if typ != "OK":
            logger.error(
                "imap_sync.sync_imap_account: IMAP search failed for account id=%s: %s %s",
                account.id,
                typ,
                search_data,
            )
            return 0

        all_uids = search_data[0].split()
        if not all_uids:
            logger.info(
                "imap_sync.sync_imap_account: No messages found for account id=%s.",
                account.id,
            )
            return 0

        # Take only latest <limit> messages (by UID order)
        uids_to_fetch = all_uids[-limit:]
        logger.info(
            "imap_sync.sync_imap_account: Will fetch %s messages (limit=%s) for account id=%s",
            len(uids_to_fetch),
            limit,
            account.id,
        )

        imported_count = 0
        for uid in uids_to_fetch:
            external_id = f"UID:{uid.decode('ascii', errors='ignore')}"
            if EmailMessageModel.objects.filter(
                account=account, external_id=external_id
            ).exists():
                logger.debug(
                    "imap_sync.sync_imap_account: Message with external_id=%s already exists; skipping.",
                    external_id,
                )
                continue

            typ, msg_data = imap.fetch(uid, "(RFC822)")
            if typ != "OK" or not msg_data or not msg_data[0]:
                logger.warning(
                    "imap_sync.sync_imap_account: Failed to fetch UID %s: %s %s",
                    uid,
                    typ,
                    msg_data,
                )
                continue

            raw_bytes = msg_data[0][1]
            email_msg = message_from_bytes(raw_bytes, policy=policy.default)

            subject = email_msg.get("Subject", "") or ""
            from_email = email_msg.get("From", "") or ""
            to_emails = _get_address_list(email_msg, "To")
            cc_emails = _get_address_list(email_msg, "Cc")
            bcc_emails = _get_address_list(email_msg, "Bcc")
            sent_at = _parse_message_date(email_msg)

            body_text = ""
            body_html = ""
            has_attachments = False

            if email_msg.is_multipart():
                for part in email_msg.walk():
                    # Skip multipart container parts — they don't have useful body content
                    if part.is_multipart():
                        continue

                    content_disposition = part.get_content_disposition()
                    if content_disposition == "attachment":
                        has_attachments = True
                        continue

                    content_type = part.get_content_type()
                    try:
                        payload = part.get_content()
                    except Exception as exc:
                        logger.warning(
                            "imap_sync.sync_imap_account: Failed to get_content for part content_type=%s: %s",
                            content_type,
                            exc,
                        )
                        continue

                    if content_type == "text/plain" and not body_text:
                        body_text = payload or ""
                    elif content_type == "text/html" and not body_html:
                        body_html = payload or ""
            else:
                content_type = email_msg.get_content_type()
                try:
                    payload = email_msg.get_content()
                except Exception as exc:
                    logger.warning(
                        "imap_sync.sync_imap_account: Failed to get_content for singlepart content_type=%s: %s",
                        content_type,
                        exc,
                    )
                    payload = ""

                if content_type == "text/html":
                    body_html = payload or ""
                else:
                    body_text = payload or ""

            msg = EmailMessageModel.objects.create(
                user=account.user,
                account=account,
                external_id=external_id,
                folder="INBOX",
                subject=subject[:998],
                from_email=from_email[:512],
                to_emails=to_emails,
                cc_emails=cc_emails,
                bcc_emails=bcc_emails,
                body_text=body_text or "",
                body_html=body_html or "",
                sent_at=sent_at,
                is_read=True,  # IMAP flags could be inspected in future
                is_starred=False,
                has_attachments=has_attachments,
            )
            logger.debug(
                "imap_sync.sync_imap_account: Created EmailMessage id=%s external_id=%s",
                msg.id,
                external_id,
            )
            imported_count += 1

        logger.info(
            "imap_sync.sync_imap_account: Imported %s new messages for account id=%s",
            imported_count,
            account.id,
        )
        return imported_count

    finally:
        try:
            imap.close()
        except Exception:
            logger.debug(
                "imap_sync.sync_imap_account: Failed to close IMAP mailbox gracefully."
            )
        try:
            imap.logout()
        except Exception:
            logger.debug(
                "imap_sync.sync_imap_account: Failed to logout IMAP session gracefully."
            )