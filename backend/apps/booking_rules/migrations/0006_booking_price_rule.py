# Generated for WebTavern pricing rules

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('booking_rules', '0005_venuebookingrule_allow_manager_reschedule'),
        ('halls', '0002_initial'),
        ('venues', '0003_expand_branding_presets'),
    ]

    operations = [
        migrations.CreateModel(
            name='BookingPriceRule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Создано')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Обновлено')),
                ('rule_type', models.CharField(choices=[('table_count', 'По количеству столов'), ('whole_hall', 'Бронь всего зала')], default='table_count', max_length=32, verbose_name='Тип правила')),
                ('title', models.CharField(blank=True, max_length=255, verbose_name='Название акции')),
                ('table_count', models.PositiveIntegerField(blank=True, null=True, verbose_name='Количество столов')),
                ('price_amount', models.DecimalField(decimal_places=2, default=0, max_digits=10, verbose_name='Стоимость брони')),
                ('price_currency', models.CharField(default='RUB', max_length=8, verbose_name='Валюта')),
                ('description', models.TextField(blank=True, verbose_name='Описание')),
                ('is_active', models.BooleanField(default=True, verbose_name='Активно')),
                ('hall', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='price_rules', to='halls.hall', verbose_name='Зал')),
                ('venue', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='price_rules', to='venues.venue', verbose_name='Заведение')),
            ],
            options={
                'verbose_name': 'Правило стоимости бронирования',
                'verbose_name_plural': 'Правила стоимости бронирования',
                'ordering': ['rule_type', 'hall__name', 'table_count', 'price_amount'],
            },
        ),
    ]
