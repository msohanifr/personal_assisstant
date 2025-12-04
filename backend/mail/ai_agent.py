# backend/mail/ai_agent.py
import json
import logging
import re
from datetime import datetime, time, timedelta
from typing import List, Tuple, Optional

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
from django.utils import timezone

from core.models import Task, Note, CalendarEvent
from .models import EmailMessage

logger = logging.getLogger(__name__)

_HF_MODEL_ID = "google/flan-t5-small"
_local_model = None
_local_tokenizer = None


def _get_local_model():
    """Lazy-load the local seq2seq model; fallback handled by caller."""
    global _local_model, _local_tokenizer
    if _local_model is not None and _local_tokenizer is not None:
        return _local_model, _local_tokenizer

    _local_tokenizer = AutoTokenizer.from_pretrained(_HF_MODEL_ID)
    _local_model = AutoModelForSeq2SeqLM.from_pretrained(_HF_MODEL_ID)
    return _local_model, _local_tokenizer


def _parse_due_date(value: Optional[str]) -> Optional[datetime]:
    """Parse YYYY-MM-DD (or ISO) into aware datetime; return None on failure."""
    if not value:
        return None
    try:
        if len(value) == 10:
            dt = datetime.strptime(value, "%Y-%m-%d")
            dt = datetime.combine(dt.date(), time(hour=17, minute=0))
        else:
            dt = datetime.fromisoformat(value)
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_default_timezone())
        return dt
    except Exception as exc:
        logger.debug("ai_agent._parse_due_date: Failed to parse %r (%s)", value, exc)
        return None


def _heuristic_tasks_notes_events(
    email: EmailMessage,
) -> Tuple[List[Task], List[Note], List[CalendarEvent]]:
    """
    Backup heuristic (no model).
    """
    logger.info("ai_agent.heuristic: Using heuristic for email id=%s", email.id)

    created_tasks: List[Task] = []
    created_notes: List[Note] = []
    created_events: List[CalendarEvent] = []

    user = email.user
    subject = (email.subject or "").strip()
    body = (email.body_text or email.body_html or "").strip()

    if not subject:
        subject = f"Email from {email.from_email or 'unknown sender'}"

    text_for_action = f"{subject.lower()} {body.lower()}"
    actionable_patterns = [
        r"\bplease\b",
        r"\bcan you\b",
        r"\bcould you\b",
        r"\baction\b",
        r"\basap\b",
        r"\bdue\b",
        r"\bfollow up\b",
        r"\bschedule\b",
        r"\bbook\b",
        r"\bsend\b",
        r"\breview\b",
        r"\bneed\b",
    ]
    is_actionable = any(
        re.search(pat, text_for_action, re.IGNORECASE) for pat in actionable_patterns
    )

    if is_actionable:
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
                due_date=timezone.now(),
            )
            created_tasks.append(task)
            logger.info("ai_agent.heuristic: Created Task id=%s title=%r", task.id, task.title)
        except Exception as exc:
            logger.exception("ai_agent.heuristic: Failed to create Task: %s", exc)

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
        logger.info("ai_agent.heuristic: Created Note id=%s title=%r", note.id, note.title)
    except Exception as exc:
        logger.exception("ai_agent.heuristic: Failed to create Note: %s", exc)

    # Event (very lightweight parsing)
    text = f"{subject.lower()} {body.lower()}"
    event_start: Optional[datetime] = None
    if "tomorrow" in text:
        event_start = timezone.localtime() + timedelta(days=1)
    elif "today" in text:
        event_start = timezone.localtime()

    if event_start:
        hour = None
        for token in text.replace(".", " ").split():
            tok = token.strip()
            if tok.endswith("am") or tok.endswith("pm"):
                try:
                    raw = tok[:-2]
                    hour_val = int(raw.split(":")[0])
                    if tok.endswith("pm") and hour_val != 12:
                        hour_val += 12
                    if tok.endswith("am") and hour_val == 12:
                        hour_val = 0
                    hour = hour_val
                    break
                except Exception:
                    continue
        event_start = event_start.replace(
            hour=hour if hour is not None else 15,
            minute=0,
            second=0,
            microsecond=0,
        )
        event_end = event_start + timedelta(hours=1)
        try:
            ev = CalendarEvent.objects.create(
                user=user,
                title=subject[:255] or "Meeting",
                description=f"Auto-created from email:\n\n{body[:800]}",
                start=event_start,
                end=event_end,
                location="",
                source="email_ai",
            )
            created_events.append(ev)
            logger.info("ai_agent.heuristic: Created Event id=%s title=%r", ev.id, ev.title)
        except Exception as exc:
            logger.exception("ai_agent.heuristic: Failed to create Event: %s", exc)

    return created_tasks, created_notes, created_events


def _run_local_model(email: EmailMessage) -> Optional[dict]:
    """
    Run a small local model (flan-t5-small) to extract structured JSON.
    Return parsed dict or None on failure.
    """
    try:
        model, tokenizer = _get_local_model()
    except Exception as exc:
        logger.exception("ai_agent.local_model: failed to load model: %s", exc)
        return None

    body = email.body_text or email.body_html or ""
    if len(body) > 4000:
        body = body[:4000] + "\n[truncated]"

    prompt = (
        "Extract actionable items from this email. "
        "Return JSON with keys tasks (title, description, due_date ISO or null), "
        "notes (title, content), events (title, description, location, start ISO or null, end ISO or null). "
        "Only create tasks if action is clear; otherwise empty lists.\n\n"
        f"Subject: {email.subject}\n"
        f"From: {email.from_email}\n"
        f"To: {email.to_emails}\n"
        f"Body:\n{body}\n\n"
        "JSON:"
    )

    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=1024)
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=256,
            num_beams=2,
        )
    text = tokenizer.decode(outputs[0], skip_special_tokens=True)

    # Extract first JSON object from text
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        logger.warning("ai_agent.local_model: no JSON found in output: %s", text)
        return None

    json_str = text[start : end + 1]
    try:
        data = json.loads(json_str)
        return data
    except Exception as exc:
        logger.warning("ai_agent.local_model: failed to parse JSON: %s (raw=%s)", exc, text)
        return None


def analyze_email_to_tasks_notes_events(
    email: EmailMessage, model_name: Optional[str] = None
) -> Tuple[List[Task], List[Note], List[CalendarEvent]]:
    """
    Uses a small local model (flan-t5-small) to extract tasks/notes/events.
    Falls back to heuristic if model load/parse fails.
    """
    logger.info(
        "ai_agent.analyze_email_to_tasks_notes_events: Starting local model for email id=%s",
        email.id,
    )

    data = _run_local_model(email)
    if data is None:
        logger.info("ai_agent: local model failed; using heuristic for email id=%s", email.id)
        return _heuristic_tasks_notes_events(email)

    tasks_data = data.get("tasks") or []
    notes_data = data.get("notes") or []
    events_data = data.get("events") or []

    created_tasks: List[Task] = []
    created_notes: List[Note] = []
    created_events: List[CalendarEvent] = []
    user = email.user

    # Tasks
    for idx, t in enumerate(tasks_data):
        try:
            title = (t.get("title") or "").strip()
            if not title:
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
        except Exception as exc:
            logger.exception("ai_agent: Failed to create Task idx=%s: %s", idx, exc)

    # Notes
    for idx, n in enumerate(notes_data):
        try:
            title = (n.get("title") or "").strip()
            if not title:
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
        except Exception as exc:
            logger.exception("ai_agent: Failed to create Note idx=%s: %s", idx, exc)

    # Events
    for idx, ev in enumerate(events_data):
        try:
            title = (ev.get("title") or "").strip()
            if not title:
                continue
            description = (ev.get("description") or "").strip()
            location = (ev.get("location") or "").strip()
            start_dt = _parse_due_date(ev.get("start"))
            end_dt = _parse_due_date(ev.get("end"))
            if start_dt and not end_dt:
                end_dt = start_dt + timedelta(hours=1)
            if not start_dt:
                continue
            event = CalendarEvent.objects.create(
                user=user,
                title=title[:255],
                description=description,
                start=start_dt,
                end=end_dt or start_dt + timedelta(hours=1),
                location=location,
                source="email_ai",
            )
            created_events.append(event)
        except Exception as exc:
            logger.exception("ai_agent: Failed to create Event idx=%s: %s", idx, exc)

    logger.info(
        "ai_agent: Done for email id=%s. Created %s tasks, %s notes, %s events (local model).",
        email.id,
        len(created_tasks),
        len(created_notes),
        len(created_events),
    )
    return created_tasks, created_notes, created_events
