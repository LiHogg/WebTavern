from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.common.models import TimeStampedModel
from apps.venues.models import Venue


class Review(TimeStampedModel):
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name='reviews', verbose_name='Заведение')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reviews', verbose_name='Автор')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='replies', verbose_name='Родительский отзыв')
    rating = models.PositiveSmallIntegerField(null=True, blank=True, verbose_name='Оценка')
    text = models.TextField(verbose_name='Текст отзыва')
    likes = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name='liked_reviews', blank=True, verbose_name='Лайки')
    is_visible = models.BooleanField(default=True, verbose_name='Виден')

    class Meta:
        verbose_name = 'Отзыв'
        verbose_name_plural = 'Отзывы'
        ordering = ['-created_at']

    def clean(self):
        if self.parent_id:
            if self.parent and self.parent.parent_id:
                raise ValidationError({'parent': 'Ответ может быть только на основной отзыв.'})
            if self.parent and self.parent.venue_id != self.venue_id:
                raise ValidationError({'parent': 'Ответ должен относиться к тому же заведению.'})
            if self.rating is not None:
                raise ValidationError({'rating': 'У ответа не должно быть отдельной оценки.'})
        else:
            if self.rating is None:
                raise ValidationError({'rating': 'Для отзыва нужна оценка.'})
            if self.rating < 1 or self.rating > 5:
                raise ValidationError({'rating': 'Оценка должна быть от 1 до 5.'})
        if not str(self.text or '').strip():
            raise ValidationError({'text': 'Текст отзыва не должен быть пустым.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        if self.parent_id:
            return f'Ответ на отзыв #{self.parent_id}'
        return f'Отзыв {self.author} о {self.venue}'



class ReviewImage(TimeStampedModel):
    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name='images', verbose_name='Отзыв')
    image = models.ImageField(upload_to='reviews/', verbose_name='Изображение')
    alt_text = models.CharField(max_length=255, blank=True, verbose_name='Alt')

    class Meta:
        verbose_name = 'Изображение отзыва'
        verbose_name_plural = 'Изображения отзывов'
        ordering = ['created_at']

    def __str__(self) -> str:
        return f'Фото к отзыву #{self.review_id}'
