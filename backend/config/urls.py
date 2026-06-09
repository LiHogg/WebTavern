from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter

from apps.audit_logs.views import ManagerActionLogViewSet
from apps.booking_rules.views import BookingPriceRuleViewSet, VenueBookingRuleViewSet
from apps.bookings.views import BookingViewSet
from apps.common.media_views import media_file
from apps.common.views import healthcheck, home_overview, manager_overview, owner_overview
from apps.common.page_views import (
    account_page,
    home_page,
    legal_index_page,
    legal_page,
    login_page,
    layout_editor_page,
    manager_page,
    notifications_page,
    venue_manage_page,
    owner_page,
    partner_page,
    platform_admin_page,
    register_page,
    venue_detail_page,
    venue_reviews_page,
    venues_page,
)
from apps.halls.views import HallViewSet
from apps.notifications.views import NotificationViewSet
from apps.layouts.views import TableLayoutViewSet
from apps.payments.views import PaymentViewSet, initialize_payment, payment_webhook_stub
from apps.tables.views import TableViewSet
from apps.users.urls import urlpatterns as auth_urlpatterns
from apps.venues.views import VenueViewSet
from apps.reviews.views import ReviewViewSet

router = DefaultRouter()
router.register("venues", VenueViewSet, basename="venue")
router.register("halls", HallViewSet, basename="hall")
router.register("tables", TableViewSet, basename="table")
router.register("layouts", TableLayoutViewSet, basename="layout")
router.register("booking-rules", VenueBookingRuleViewSet, basename="booking-rule")
router.register("booking-price-rules", BookingPriceRuleViewSet, basename="booking-price-rule")
router.register("bookings", BookingViewSet, basename="booking")
router.register("payments", PaymentViewSet, basename="payment")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("audit-logs", ManagerActionLogViewSet, basename="audit-log")
router.register("reviews", ReviewViewSet, basename="review")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", healthcheck, name="healthcheck"),
    path("api/v1/home/overview/", home_overview, name="home-overview"),
    path("api/v1/owner/overview/", owner_overview, name="owner-overview"),
    path("api/v1/manager/overview/", manager_overview, name="manager-overview"),
    path("api/v1/payments/webhook-stub/", payment_webhook_stub, name="payment-webhook-stub"),
    path("api/v1/auth/", include((auth_urlpatterns, "auth"))),
    path("api/v1/payments/initialize/", initialize_payment, name="payment-initialize"),
    path("api/v1/", include(router.urls)),
    re_path(r"^media/(?P<path>.*)$", media_file, name="media-file"),
    path("", home_page, name="home-page"),
    path("login/", login_page, name="login-page"),
    path("register/", register_page, name="register-page"),
    path("legal/", legal_index_page, name="legal-index-page"),
    path("legal/<slug:document>/", legal_page, name="legal-page"),
    path("account/", account_page, name="account-page"),
    path("account/payments/", account_page, name="account-payments-page"),
    path("notifications/", notifications_page, name="notifications-page"),
    path("venues/", venues_page, name="venues-page"),
    path("venues/<slug:slug>/", venue_detail_page, name="venue-detail-page"),
    path("venues/<slug:slug>/reviews/", venue_reviews_page, name="venue-reviews-page"),
    path("owner/", owner_page, name="owner-page"),
    path("owner/venues/<slug:slug>/edit/", venue_manage_page, name="venue-manage-page"),
    path("manage/venues/<slug:slug>/edit/", venue_manage_page, name="venue-manage-page-shared"),
    path("floor-plan-editor/", layout_editor_page, name="layout-editor-page"),
    path("manager/", manager_page, name="manager-page"),
    path("partner/", partner_page, name="partner-page"),
    path("platform-admin/", platform_admin_page, name="platform-admin-page"),
]


if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
