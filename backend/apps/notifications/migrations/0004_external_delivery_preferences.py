from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('notifications', '0003_notification_context_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='channel',
            field=models.CharField(choices=[('email', 'Email'), ('sms', 'SMS'), ('browser', 'Browser'), ('in_app', 'In-app')], max_length=32, verbose_name='Канал'),
        ),
        migrations.CreateModel(
            name='NotificationPreference',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Создано')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Обновлено')),
                ('email_enabled', models.BooleanField(default=True, verbose_name='Email-уведомления')),
                ('sms_enabled', models.BooleanField(default=True, verbose_name='SMS-уведомления')),
                ('booking_email_enabled', models.BooleanField(default=True, verbose_name='Email по бронированиям')),
                ('booking_sms_enabled', models.BooleanField(default=True, verbose_name='SMS по бронированиям')),
                ('marketing_enabled', models.BooleanField(default=False, verbose_name='Маркетинговые сообщения')),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='notification_preference', to=settings.AUTH_USER_MODEL, verbose_name='Пользователь')),
            ],
            options={
                'verbose_name': 'Настройки уведомлений',
                'verbose_name_plural': 'Настройки уведомлений',
            },
        ),
        migrations.CreateModel(
            name='NotificationDelivery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Создано')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Обновлено')),
                ('channel', models.CharField(choices=[('email', 'Email'), ('sms', 'SMS')], max_length=16, verbose_name='Канал')),
                ('status', models.CharField(choices=[('sent', 'Отправлено'), ('failed', 'Ошибка'), ('skipped', 'Пропущено')], max_length=16, verbose_name='Статус')),
                ('provider', models.CharField(blank=True, max_length=64, verbose_name='Провайдер')),
                ('destination', models.CharField(blank=True, max_length=255, verbose_name='Адрес/телефон')),
                ('provider_message_id', models.CharField(blank=True, max_length=255, verbose_name='ID сообщения у провайдера')),
                ('error', models.TextField(blank=True, verbose_name='Ошибка')),
                ('sent_at', models.DateTimeField(blank=True, null=True, verbose_name='Отправлено в')),
                ('notification', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='deliveries', to='notifications.notification', verbose_name='Уведомление')),
                ('recipient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notification_deliveries', to=settings.AUTH_USER_MODEL, verbose_name='Получатель')),
            ],
            options={
                'verbose_name': 'Доставка уведомления',
                'verbose_name_plural': 'Доставки уведомлений',
                'ordering': ['-created_at'],
            },
        ),
    ]
