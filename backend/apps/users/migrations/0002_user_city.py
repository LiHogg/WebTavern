from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="city",
            field=models.CharField(blank=True, max_length=120, verbose_name="Город проживания"),
        ),
    ]
