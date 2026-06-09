from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("booking_rules", "0003_venuebookingrule_allow_shared_seating"),
    ]

    operations = [
        migrations.AddField(
            model_name="venuebookingrule",
            name="free_cancellation_before_minutes",
            field=models.PositiveIntegerField(default=120, verbose_name="Бесплатная отмена до начала брони"),
        ),
        migrations.AddField(
            model_name="venuebookingrule",
            name="min_booking_notice_minutes",
            field=models.PositiveIntegerField(default=60, verbose_name="Минимальное время до начала брони"),
        ),
        migrations.AddField(
            model_name="venuebookingrule",
            name="no_show_after_minutes",
            field=models.PositiveIntegerField(default=30, verbose_name="Через сколько минут считать гостя неявившимся"),
        ),
    ]
