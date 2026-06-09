import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('bookings', '0003_booking_cancellation_and_no_show'),
        ('venues', '0002_geo_theme_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ManagerActionLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Создано')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Обновлено')),
                ('action', models.CharField(choices=[('confirm', 'Подтверждение'), ('cancel', 'Отмена'), ('reschedule', 'Перенос'), ('no_show', 'Неявка')], max_length=32, verbose_name='Действие')),
                ('details', models.TextField(blank=True, verbose_name='Подробности')),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='manager_action_logs', to=settings.AUTH_USER_MODEL, verbose_name='Кто выполнил')),
                ('booking', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='action_logs', to='bookings.booking', verbose_name='Бронь')),
                ('venue', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='manager_action_logs', to='venues.venue', verbose_name='Заведение')),
            ],
            options={'ordering': ['-created_at'], 'verbose_name': 'Лог действий менеджера', 'verbose_name_plural': 'Логи действий менеджера'},
        ),
    ]
