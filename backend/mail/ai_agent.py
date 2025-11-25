# backend/mail/ai_agent.py
import json
import logging
import os
from datetime import datetime, time
from typing import List, Tuple, Optional

from django.conf import settings
from django.utils import timezone

from core.models import Task, Note
from .models import EmailMessage

logger = logging.getLogger(__name__)

try:
    # OpenAI Python SDK (v1.x)
    from openai import OpenAI, RateLimitError  # type: ignore
except Exception:  # ImportError or others
    OpenAI = None  # type: ignore
    RateLimitError = Exception  # type: ignore


def _get_openai_client() -> Optional["OpenAI"]:
    """
    Create an OpenAI client if OPENAI_API_KEY is configured.
    """
    api_key = getattr(settings, "OPENAI_API_KEY", None) or os.getenv(
        "OPENAI_API_KEY"
    )
    if not api_key:
        logger.warning(
            "ai_agent._get_openai_client: OPENAI_API_KEY not configured; AI analysis disabled."
        )
        return None

    if OpenAI is None:
        logger.warning(
            "ai_agent._get_openai_client: openai library not installed; AI analysis disabled."
        )
        return None

    try:
        client = OpenAI(api_key=api_key)
        logger.info("ai_agent._get_openai_client: OpenAI client created.")
        return client
    except Exception as exc:
        logger.exception(
            "ai_agent._get_openai_client: Failed to create OpenAI client: %s",
            exc,
        )
        return None


def _parse_due_date(value: Optional[str]) -> Optional[datetime]:
    """
    Parse a YYYY-MM-DD (or ISO) string into a timezone-aware datetime.

    If parsing fails, return None.
    """
    if not value:
        return None

    try:
        # Try YYYY-MM-DD first
        if len(value) == 10:
            dt = datetime.strptime(value, "%Y-%m-%d")
            # default to 17:00 local time
            dt = datetime.combine(dt.date(), time(hour=17, minute=0))
        else:
            dt = datetime.fromisoformat(value)

        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_default_timezone())
        return dt
    except Exception as exc:
        logger.warning(
            "ai_agent._parse_due_date: Failed to parse %r: %s", value, exc
        )
        return None


def _heuristic_tasks_notes(email: EmailMessage) -> Tuple[List[Task], List[Note]]:
    """
    Fallback when OpenAI is unavailable or quota is exceeded.

    Heuristic:
    - Create 1 Task: "Follow up: <subject or sender>"
    - Create 1 Note: "Summary for: <subject>" with first part of body.
    """
    logger.info(
        "ai_agent._heuristic_tasks_notes: Using heuristic fallback for email id=%s",
        email.id,
    )

    created_tasks: List[Task] = []
    created_notes: List[Note] = []

    user = email.user
    subject = (email.subject or "").strip()
    body = (email.body_text or email.body_html or "").strip()

    if not subject:
        subject = f"Email from {email.from_email or 'unknown sender'}"

    # Task
    try:
        task_title = f"Follow up: {subject[:200]}"
        task_description = (
            f"Auto-created from email.\n\n"
            f"From: {email.from_email}\n"
            f"To: {email.to_emails}\n\n"
            f"Subject: {email.subject}\n\n"
            f"First part of body:\n{body[:500]}"
        )
        task = Task.objects.create(
            user=user,
            title=task_title,
            description=task_description,
            status="todo",
            due_date=timezone.now(),  # now; you can adjust to +1 day if you prefer
        )
        created_tasks.append(task)
        logger.info(
            "ai_agent._heuristic_tasks_notes: Created fallback Task id=%s title=%r",
            task.id,
            task.title,
        )
    except Exception as exc:
        logger.exception(
            "ai_agent._heuristic_tasks_notes: Failed to create fallback Task: %s",
            exc,
        )

    # Note
    try:
        note_title = f"Summary for: {subject[:200]}"
        note_content = (
            f"Auto-created summary from email.\n\n"
            f"From: {email.from_email}\n"
            f"To: {email.to_emails}\n\n"
            f"Subject: {email.subject}\n\n"
            f"Body (truncated):\n{body[:2000]}"
        )
        note = Note.objects.create(
            user=user,
            note_type="general",
            date=timezone.now().date(),
            title=note_title,
            content=note_content,
        )
        created_notes.append(note)
        logger.info(
            "ai_agent._heuristic_tasks_notes: Created fallback Note id=%s title=%r",
            note.id,
            note.title,
        )
    except Exception as exc:
        logger.exception(
            "ai_agent._heuristic_tasks_notes: Failed to create fallback Note: %s",
            exc,
        )

    return created_tasks, created_notes


def analyze_email_to_tasks_and_notes(
    email: EmailMessage, model_name: Optional[str] = None
) -> Tuple[List[Task], List[Note]]:
    """
    Use an AI model (if configured) to suggest tasks + notes from an email.

    Returns (created_tasks, created_notes).

    Behavior:
    - If OpenAI client is missing -> use heuristic fallback.
    - If OpenAI call fails due to quota / rate-limit -> heuristic fallback.
    - If OpenAI call fails for any other reason -> log and fallback.
    """
    logger.info(
        "ai_agent.analyze_email_to_tasks_and_notes: Starting analysis for email id=%s subject=%r",
        email.id,
        email.subject,
    )
    client = _get_openai_client()

    # If no client, go straight to heuristic fallback
    if client is None:
        logger.info(
            "ai_agent.analyze_email_to_tasks_and_notes: No AI client; using heuristic."
        )
        return _heuristic_tasks_notes(email)

    model = model_name or getattr(
        settings, "OPENAI_ASSISTANT_MODEL", "gpt-4o-mini"
    )

    body = email.body_text or email.body_html or ""
    # Keep body reasonably sized for prompt
    if len(body) > 6000:
        body = body[:6000] + "\n\n[... truncated ...]"

    system_prompt = (
        "You are a productivity assistant. "
        "Read the email and extract actionable tasks and key notes.\n\n"
        "Return STRICTLY valid JSON with this structure:\n"
        "{\n"
        '  "tasks": [\n'
        '    {"title": "...", "description": "...", "due_date": "YYYY-MM-DD" or null}\n'
        "  ],\n"
        '  "notes": [\n'
        '    {"title": "...", "content": "..."}\n'
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        "- Only create tasks if there is a clear action item.\n"
        "- due_date can be null if unclear.\n"
    )

    user_prompt = (
        f"Subject: {email.subject}\n"
        f"From: {email.from_email}\n"
        f"To: {email.to_emails}\n\n"
        f"Body:\n{body}"
    )

    created_tasks: List[Task] = []
    created_notes: List[Note] = []

    try:
        logger.info(
            "ai_agent.analyze_email_to_tasks_and_notes: Calling OpenAI model=%s",
            model,
        )
        resp = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        raw = resp.choices[0].message.content
        logger.debug(
            "ai_agent.analyze_email_to_tasks_and_notes: Raw AI response: %s",
            raw,
        )
        data = json.loads(raw or "{}")
    except RateLimitError as exc:
        # This covers 429, insufficient_quota, etc.
        logger.warning(
            "ai_agent.analyze_email_to_tasks_and_notes: OpenAI quota/rate-limit error for email id=%s: %s",
            email.id,
            exc,
        )
        return _heuristic_tasks_notes(email)
    except Exception as exc:
        logger.exception(
            "ai_agent.analyze_email_to_tasks_and_notes: OpenAI call failed for email id=%s: %s",
            email.id,
            exc,
        )
        # Any other AI error -> fallback
        return _heuristic_tasks_notes(email)

    tasks_data = data.get("tasks") or []
    notes_data = data.get("notes") or []

    user = email.user

    # Create Tasks from AI output
    for idx, t in enumerate(tasks_data):
        try:
            title = (t.get("title") or "").strip()
            if not title:
                logger.debug(
                    "ai_agent: Skipping task idx=%s with empty title.", idx
                )
                continue

            desc = (t.get("description") or "").strip()
            due = _parse_due_date(t.get("due_date"))

            task = Task.objects.create(
                user=user,
                title=title[:255],
                description=desc,
                status="todo",
                due_date=due,
            )
            created_tasks.append(task)
            logger.info(
                "ai_agent: Created Task id=%s title=%r from email id=%s",
                task.id,
                task.title,
                email.id,
            )
        except Exception as exc:
            logger.exception(
                "ai_agent: Failed to create Task from AI output idx=%s: %s",
                idx,
                exc,
            )

    # Create Notes from AI output
    for idx, n in enumerate(notes_data):
        try:
            title = (n.get("title") or "").strip()
            if not title:
                logger.debug(
                    "ai_agent: Skipping note idx=%s with empty title.", idx
                )
                continue

            content = (n.get("content") or "").strip()
            note = Note.objects.create(
                user=user,
                note_type="general",
                date=timezone.now().date(),
                title=title[:255],
                content=content,
            )
            created_notes.append(note)
            logger.info(
                "ai_agent: Created Note id=%s title=%r from email id=%s",
                note.id,
                note.title,
                email.id,
            )
        except Exception as exc:
            logger.exception(
                "ai_agent: Failed to create Note from AI output idx=%s: %s",
                idx,
                exc,
            )

    logger.info(
        "ai_agent.analyze_email_to_tasks_and_notes: Done for email id=%s. Created %s tasks, %s notes.",
        email.id,
        len(created_tasks),
        len(created_notes),
    )
    return created_tasks, created_notes