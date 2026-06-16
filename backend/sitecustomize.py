"""Runtime compatibility patches for deployed WebTavern.

Django imports this module automatically at Python startup when the backend
folder is on sys.path. Keep this file small and defensive: it should never
block application startup if a dependency is unavailable.
"""


def _patch_drf_extra_action_name_check() -> None:
    """Allow late monkey-patched DRF actions to keep router compatibility.

    Some project compatibility patches replace a ViewSet action method after
    DRF's @action decorator has already assigned routing metadata. DRF checks
    that the callable __name__ equals the attribute name when building router
    URLs. If only the Python function name differs, normalize it and retry.
    """
    try:
        from rest_framework import viewsets
    except Exception:
        return

    original_check = getattr(viewsets, "_check_attr_name", None)
    if original_check is None or getattr(original_check, "_webtavern_patched", False):
        return

    def safe_check_attr_name(func, name):
        try:
            return original_check(func, name)
        except AssertionError:
            if getattr(func, "__name__", None) != name:
                try:
                    func.__name__ = name
                except Exception:
                    pass
                return original_check(func, name)
            raise

    safe_check_attr_name.__name__ = "_check_attr_name"
    safe_check_attr_name._webtavern_patched = True
    viewsets._check_attr_name = safe_check_attr_name


_patch_drf_extra_action_name_check()
