from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("booking_rules", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="venuebookingrule",
            name="allow_shared_seating",
            field=models.BooleanField(default=False, verbose_name="Разрешить подсадку к занятым столам"),
        ),
    ]
