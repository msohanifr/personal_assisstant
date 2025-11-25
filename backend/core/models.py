from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    timezone = models.CharField(max_length=64, blank=True, default="America/New_York")
    daily_start_hour = models.IntegerField(default=8)
    daily_end_hour = models.IntegerField(default=18)

    def __str__(self):
        return f"Profile({self.user.username})"


class Task(models.Model):
    STATUS_CHOICES = [
        ("todo", "To Do"),
        ("in_progress", "In Progress"),
        ("done", "Done"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="todo")
    due_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class Note(models.Model):
    NOTE_TYPE_CHOICES = [
        ("daily", "Daily"),
        ("general", "General"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notes")
    note_type = models.CharField(
        max_length=16, choices=NOTE_TYPE_CHOICES, default="general"
    )
    # Optional date associated to the note
    date = models.DateField(null=True, blank=True)
    # Job / context tag so you can separate Marysa, NavonLogic, TANF, etc.
    job = models.CharField(max_length=100, blank=True, null=True, default="")
    # Optional: attach this note to a task
    task = models.ForeignKey(
        Task,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="notes",
    )
    title = models.CharField(max_length=255)
    # Free-form text; can include markdown, code fences, etc.
    content = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class NoteAttachment(models.Model):
    """File or image attached to a note (drawings, docs, etc.)."""

    note = models.ForeignKey(
        Note, on_delete=models.CASCADE, related_name="attachments"
    )
    file = models.FileField(upload_to="notes/attachments/")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Attachment({self.id}) for note {self.note_id}"


class Contact(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="contacts")
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=64, blank=True)
    organization = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class CalendarEvent(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="events")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    start = models.DateTimeField()
    end = models.DateTimeField()
    location = models.CharField(max_length=255, blank=True)
    source = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title