import shutil
import tempfile
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.reverse import reverse
from rest_framework.test import APIClient

from core.models import Note, NoteAttachment, Task, TaskTag

User = get_user_model()


class TaskApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="user1", password="pass")
        self.other = User.objects.create_user(username="user2", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_tasks_are_scoped_to_request_user(self):
        Task.objects.create(user=self.user, title="Mine", status=Task.TODO)
        Task.objects.create(user=self.other, title="Not mine", status=Task.TODO)

        url = reverse("task-list")
        resp = self.client.get(url)

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["title"], "Mine")
        self.assertEqual(resp.data[0]["user"], self.user.id)

    def test_cannot_assign_tag_from_another_user(self):
        my_tag = TaskTag.objects.create(user=self.user, name="Work")
        foreign_tag = TaskTag.objects.create(user=self.other, name="Other")

        url = reverse("task-list")
        payload = {
            "title": "With bad tag",
            "description": "",
            "status": Task.TODO,
            "due_date": timezone.now().isoformat(),
            "tag_ids": [foreign_tag.id],
        }

        resp = self.client.post(url, payload, format="json")
        self.assertEqual(resp.status_code, 400)

        good_payload = {**payload, "title": "With my tag", "tag_ids": [my_tag.id]}
        ok_resp = self.client.post(url, good_payload, format="json")
        self.assertEqual(ok_resp.status_code, 201)
        self.assertEqual(ok_resp.data["tags"][0]["id"], my_tag.id)


class NoteAttachmentPermissionTests(TestCase):
    def setUp(self):
        self.tmp_media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp_media)
        self.override_media = override_settings(MEDIA_ROOT=self.tmp_media)
        self.override_media.enable()
        self.addCleanup(self.override_media.disable)

        self.user = User.objects.create_user(username="user1", password="pass")
        self.other = User.objects.create_user(username="user2", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.my_note = Note.objects.create(user=self.user, title="mine", content="")
        self.other_note = Note.objects.create(user=self.other, title="other", content="")

    def test_cannot_create_attachment_for_foreign_note(self):
        url = reverse("note-attachment-list")
        file_obj = SimpleUploadedFile("hello.txt", b"hi", content_type="text/plain")

        resp = self.client.post(
            url,
            {"note": self.other_note.id, "file": file_obj},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 403)

    def test_cannot_delete_attachment_for_foreign_note(self):
        file_obj = SimpleUploadedFile("hello.txt", b"bye", content_type="text/plain")
        attachment = NoteAttachment.objects.create(note=self.other_note, file=file_obj)

        url = reverse("note-attachment-detail", args=[attachment.id])
        resp = self.client.delete(url)
        self.assertEqual(resp.status_code, 403)


class ModelTimestampTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="timey", password="pass")

    def test_note_updated_at_changes_on_save(self):
        first = timezone.now()
        later = first + timedelta(minutes=5)

        with mock.patch("django.utils.timezone.now", return_value=first):
            note = Note.objects.create(user=self.user, title="t", content="first")

        with mock.patch("django.utils.timezone.now", return_value=later):
            note.content = "second"
            note.save()

        note.refresh_from_db()
        self.assertEqual(note.created_at, first)
        self.assertEqual(note.updated_at, later)
