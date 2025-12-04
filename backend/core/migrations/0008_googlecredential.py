from django.db import migrations, models
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0007_update_timestamp_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="GoogleCredential",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("access_token", models.TextField()),
                ("refresh_token", models.TextField()),
                ("token_expiry", models.DateTimeField()),
                ("token_uri", models.CharField(default="https://oauth2.googleapis.com/token", max_length=255)),
                ("client_id", models.CharField(max_length=255)),
                ("client_secret", models.CharField(max_length=255)),
                ("scopes", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=models.deletion.CASCADE,
                        related_name="google_credential",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
    ]
