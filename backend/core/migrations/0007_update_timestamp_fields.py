from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_task_completed_at"),
    ]

    operations = [
        migrations.AlterField(
            model_name="calendarevent",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name="contact",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name="note",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
    ]
