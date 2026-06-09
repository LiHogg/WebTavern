from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="booking",
            name="cancelled_without_penalty",
            field=models.BooleanField(default=True, verbose_name="Отменена без штрафа"),
        ),
        migrations.AddField(
            model_name="booking",
            name="cancellation_penalty_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10, verbose_name="Сумма штрафа при отмене"),
        ),
        migrations.AddField(
            model_name="booking",
            name="cancellation_penalty_currency",
            field=models.CharField(default="RUB", max_length=8, verbose_name="Валюта штрафа"),
        ),
        migrations.AddField(
            model_name="booking",
            name="no_show_marked_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="Когда отмечена неявка"),
        ),
    ]
