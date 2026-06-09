# Generated for WebTavern hall and table-count booking pricing

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0005_booking_tables'),
    ]

    operations = [
        migrations.AddField(
            model_name='booking',
            name='booking_type',
            field=models.CharField(choices=[('tables', 'Столы'), ('hall', 'Зал целиком')], default='tables', max_length=24, verbose_name='Тип брони'),
        ),
        migrations.AddField(
            model_name='booking',
            name='price_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10, verbose_name='Стоимость брони'),
        ),
        migrations.AddField(
            model_name='booking',
            name='price_currency',
            field=models.CharField(default='RUB', max_length=8, verbose_name='Валюта стоимости'),
        ),
        migrations.AddField(
            model_name='booking',
            name='pricing_note',
            field=models.CharField(blank=True, max_length=255, verbose_name='Применённое правило стоимости'),
        ),
    ]
